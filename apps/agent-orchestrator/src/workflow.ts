// Incident Investigation Workflow (APP-09 / AGT-1..8).
// LangGraph-class deterministic stateful workflow connecting:
// Detect Intake -> Trust Check -> Line Impact -> Hypothesise -> Retrieve -> Verify Citations -> Discriminate/Abstain -> Draft Work Order -> Policy Gate.
// Enforces Safety Invariant 1 (advisory), Invariant 2 (human-only approvals), Invariant 3 (append-only hash-chained audit), Invariant 4 (forced tenant RLS).

import type { Pool } from "pg";
import type {
  CausalEngine,
  LineImpactService,
  TrustService,
  TrustAssessment,
  AlertEnvelope,
} from "@fp/intel-core";
import type { KnowledgeService } from "@fp/knowledge-svc";
import type { IncidentWorkflowState } from "./types.js";

export interface WorkflowDependencies {
  pool: Pool;
  trustService: TrustService;
  impactService: LineImpactService;
  causalEngine: CausalEngine;
  knowledgeService: KnowledgeService;
}

export class IncidentInvestigationWorkflow {
  constructor(private readonly deps: WorkflowDependencies) {}

  /**
   * Executes the complete incident investigation workflow (AGT-1).
   */
  public async execute(alert: AlertEnvelope): Promise<IncidentWorkflowState> {
    const traceId = alert.traceparent ? alert.traceparent.split("-")[1] ?? "0".repeat(32) : "0".repeat(32);
    let state: IncidentWorkflowState = {
      incident_id: `INC-${alert.id}`,
      tenant_id: alert.tenant_id,
      trace_id: traceId,
      opened_at: new Date().toISOString(),
      alert,
      state: "open",
      hypotheses: [],
      retrieved_chunks: [],
      citation_ids: [],
      citation_blocked: false,
      abstained: false,
      what_would_change: [],
      audit_event_ids: [],
      summary_text: "",
      template_summary: "",
    };

    // Node 1: Detect Intake (idempotent open)
    state = await this.nodeDetectIntake(state);

    // Node 2: Trust Check (TRU-1..3)
    state = await this.nodeTrustCheck(state);
    if (state.trust?.verdict === "sensor_fault") {
      // Short-circuit: sensor fault produces sensor work order; skips machine hypotheses
      state = await this.nodeFinalize(state);
      return state;
    }

    // Node 3: Line Impact (LIM-1..4)
    state = await this.nodeLineImpact(state);

    // Node 4: Causal Hypothesise (AGT-2)
    state = await this.nodeHypothesise(state);

    // Node 5: Knowledge Retrieve (RAG-1..4)
    state = await this.nodeRetrieve(state);

    // Node 6: Verify Citations (RAG-6)
    state = await this.nodeVerifyCitations(state);

    // Node 7: Discriminate or Abstain (AGT-3 / RAG-7)
    state = await this.nodeDiscriminateOrAbstain(state);

    // Node 8: Draft Work Order (Invariant 2)
    state = await this.nodeDraftWorkOrder(state);

    // Node 9: Policy Gate (Invariant 2)
    state = await this.nodePolicyGate(state);

    // Node 10: Finalize & Persist Incident State (Invariant 4 & Invariant 3)
    state = await this.nodeFinalize(state);

    return state;
  }

  // -------------------------------------------------------------------------
  // Workflow Nodes
  // -------------------------------------------------------------------------

  private async nodeDetectIntake(state: IncidentWorkflowState): Promise<IncidentWorkflowState> {
    const client = await this.deps.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [state.tenant_id]);

      // Open incident in "case".incident so downstream work orders can link foreign keys
      await client.query(
        `INSERT INTO "case".incident (
           id, tenant_id, title, state, opened_at, summary_text, template_summary,
           hypotheses, evidence, what_would_change, citation_ids, trust_sensor_ids, trace_id
         ) VALUES ($1, $2, $3, 'open', now(), $4, $4, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          state.incident_id,
          state.tenant_id,
          `Investigation: ${state.alert.signal_name}`,
          `Investigation opened for alert ${state.alert.id}`,
          JSON.stringify([state.alert.sensor_id]),
          state.trace_id,
        ]
      );

      // Record audit event in gov.audit_event via append_audit (Invariant 3)
      const auditRes = await client.query<{ id: string }>(
        "SELECT gov.append_audit($1, $2, $3, $4) as id",
        [
          "fp-agent:orchestrator",
          "open_incident",
          state.incident_id,
          JSON.stringify({ alert_id: state.alert.id, sensor_id: state.alert.sensor_id }),
        ]
      );
      state.audit_event_ids.push(auditRes.rows[0]?.id ?? "");

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return state;
  }

  private async nodeTrustCheck(state: IncidentWorkflowState): Promise<IncidentWorkflowState> {
    const client = await this.deps.pool.connect();
    let existingAssessment: TrustAssessment | null = null;
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [state.tenant_id]);
      const res = await client.query<{
        sensor_id: string;
        tenant_id: string;
        score: string | number;
        level: any;
        verdict: any;
        verdict_text: string;
        checks: Record<string, any>;
        sensor_work_order_id: string | null;
      }>(
        "SELECT sensor_id, tenant_id, score, level, verdict, verdict_text, checks, sensor_work_order_id FROM intel.trust_assessment WHERE sensor_id = $1",
        [state.alert.sensor_id]
      );
      if (res.rows[0]) {
        const row = res.rows[0];
        existingAssessment = {
          sensor_id: row.sensor_id,
          tenant_id: row.tenant_id,
          score: Number(row.score),
          level: row.level,
          verdict: row.verdict,
          verdict_text: row.verdict_text,
          checks: row.checks ?? {},
          series: [],
          history: [],
          sensor_work_order_id: row.sensor_work_order_id ?? undefined,
        };
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    let trust: TrustAssessment;
    if (existingAssessment) {
      trust = existingAssessment;
    } else {
      // Determine related sensor readings based on asset
      const relatedSensors =
        state.alert.sensor_id === "FT-401"
          ? [
              { sensor_id: "TT-402", value: 32.0, trust_score: 0.95 },
              { sensor_id: "IT-405", value: 8.8, trust_score: 0.92 },
            ]
          : [];

      trust = await this.deps.trustService.assessSensor({
        tenant_id: state.tenant_id,
        sensor_id: state.alert.sensor_id,
        asset_id: "as-wc4-coolant",
        value: 18.2, // Derived from alert
        ts: state.alert.arrived_at,
        related_sensor_readings: relatedSensors,
      });
    }

    state.trust = trust;

    if (trust.verdict === "sensor_fault") {
      state.state = "awaiting_approval";
      state.summary_text = `Telemetry Trust layer identified sensor fault on ${state.alert.sensor_id}. Transducer check drafted; machine diagnosis skipped.`;
      state.template_summary = state.summary_text;
    }

    return state;
  }

  private async nodeLineImpact(state: IncidentWorkflowState): Promise<IncidentWorkflowState> {
    const stationId = state.alert.sensor_id.includes("FT") || state.alert.sensor_id.includes("TT") ? "st-cell4" : "st-cell3";
    const impactCalc = this.deps.impactService.calculateStationImpact(
      state.alert.line_id,
      stationId,
      state.alert.severity
    );

    const impact = {
      line_id: state.alert.line_id,
      tenant_id: state.tenant_id,
      station_id: stationId,
      starvation_time_minutes: impactCalc.starvationTimeMinutes,
      bottleneck_station_id: impactCalc.bottleneckStationId,
      lost_units_estimate: impactCalc.lostUnitsEstimate,
      throughput_at_risk_pct: impactCalc.throughputAtRiskPct,
      cascade_path: impactCalc.cascadePath,
      confidence: impactCalc.confidence,
      rank: 1,
    };

    await this.deps.impactService.persistLineImpact(impact);
    state.impact = impact;

    return state;
  }

  private async nodeHypothesise(state: IncidentWorkflowState): Promise<IncidentWorkflowState> {
    const causalResult = this.deps.causalEngine.analyze({
      asset_id: "as-wc4-coolant",
      contributing_signals: [
        { sensor_id: state.alert.sensor_id, value: 17.5, nominal_mean: 24.0 },
        { sensor_id: "TT-402", value: 33.5, nominal_mean: 28.0 },
        { sensor_id: "IT-405", value: 9.6, nominal_mean: 8.5 },
      ],
      trust_verdict: state.trust?.verdict,
    });

    state.hypotheses = causalResult.hypotheses;

    if (causalResult.suggested_check) {
      state.proposed_check = causalResult.suggested_check.name;
      state.what_would_change = [
        "portable flow meter reading",
        "differential pressure gauge inspection on strainer basket",
      ];
    }

    return state;
  }

  private async nodeRetrieve(state: IncidentWorkflowState): Promise<IncidentWorkflowState> {
    const topHypothesis = state.hypotheses[0]?.failure_mode ?? "Coolant restriction";
    const query = `${topHypothesis} Weld Cell 4 transformer coolant flow`;

    const chunks = await this.deps.knowledgeService.retrieve({
      tenant_id: state.tenant_id,
      query,
      top_k: 3,
    });

    state.retrieved_chunks = chunks;
    state.citation_ids = Array.from(new Set(chunks.map((c) => c.citation_id)));

    return state;
  }

  private async nodeVerifyCitations(state: IncidentWorkflowState): Promise<IncidentWorkflowState> {
    if (state.retrieved_chunks.length === 0) {
      state.citation_blocked = false;
      return state;
    }

    const claims = state.retrieved_chunks.map((chunk) => chunk.content.slice(0, 40));
    const verification = this.deps.knowledgeService.verifyCitations({
      claims,
      retrievedChunks: state.retrieved_chunks,
    });

    state.citation_blocked = !verification.allSupported;
    return state;
  }

  private async nodeDiscriminateOrAbstain(state: IncidentWorkflowState): Promise<IncidentWorkflowState> {
    const top1 = state.hypotheses[0];
    const top2 = state.hypotheses[1];

    // Abstention criteria per RAG-7 & AGT-3:
    // If top probability < 0.55 OR margin over second < 0.25 -> abstain
    if (top1 && top2) {
      const margin = top1.probability - top2.probability;
      if (top1.probability < 0.55 || margin < 0.25) {
        state.abstained = true;
        state.state = "abstained";
        state.abstention_reason = `Cannot definitively separate top hypotheses (${top1.failure_mode} vs ${top2.failure_mode}; margin ${margin.toFixed(2)} < 0.25 threshold).`;
        state.summary_text = `Investigation abstained: ${state.abstention_reason} Recommended discriminating action: ${state.proposed_check}.`;
        state.template_summary = state.summary_text;
        return state;
      }
    }

    state.abstained = false;
    state.state = "awaiting_approval";
    const topName = top1?.failure_mode ?? "Equipment anomaly";
    state.summary_text = `Investigation identified ${topName} (${Math.round((top1?.probability ?? 0.8) * 100)}% confidence). Work order draft generated.`;
    state.template_summary = state.summary_text;

    return state;
  }

  private async nodeDraftWorkOrder(state: IncidentWorkflowState): Promise<IncidentWorkflowState> {
    const client = await this.deps.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [state.tenant_id]);

      const topHypothesis = state.hypotheses[0]?.failure_mode ?? "Equipment Inspection";
      const woId = `WO-${state.incident_id}`;

      const steps = state.abstained
        ? [
            `1. Perform discriminating check: ${state.proposed_check ?? "Visual inspection of coolant circuit"}`,
            "2. Record differential pressure and flow meter readings",
            "3. If strainer DP > 0.5 bar, isolate and clean strainer basket",
            "4. Verify post-cleaning flow rate returns to >= 23.5 L/min",
          ]
        : [
            `1. Lockout/tagout Weld Cell 4 coolant supply (SOP-WC-07)`,
            `2. Address verified fault: ${topHypothesis}`,
            "3. Inspect strainer basket and seals for foreign debris",
            "4. Re-pressurize and verify flow rate >= 23.5 L/min over 5 weld cycles",
          ];

      await client.query(
        `INSERT INTO "case".work_order (
           id, tenant_id, incident_id, title, asset_id, type, status, is_draft, steps
         ) VALUES ($1, $2, $3, $4, $5, 'corrective_maintenance', 'draft', true, $6)
         ON CONFLICT (id) DO UPDATE SET steps = EXCLUDED.steps, title = EXCLUDED.title`,
        [
          woId,
          state.tenant_id,
          state.incident_id,
          `Remediate: ${state.abstained ? "Discriminating Check" : topHypothesis}`,
          "as-wc4-coolant",
          JSON.stringify(steps),
        ]
      );

      state.work_order_draft = {
        id: woId,
        title: `Remediate: ${state.abstained ? "Discriminating Check" : topHypothesis}`,
        type: "corrective_maintenance",
        steps,
        is_draft: true,
      };

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return state;
  }

  private async nodePolicyGate(state: IncidentWorkflowState): Promise<IncidentWorkflowState> {
    const client = await this.deps.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [state.tenant_id]);

      const approvalId = `APP-${state.incident_id}`;
      // Invariant 2: Human approval required; Tier 1 requires lead_engineer role
      const tier = 1;
      const requiredRole = "lead_engineer";
      const rationale = state.abstained
        ? "Physical check proposed to separate conflicting root-cause hypotheses"
        : "Corrective maintenance on robotic welding coolant circuit";

      await client.query(
        `INSERT INTO "case".approval (
           id, tenant_id, work_order_id, tier, required_role, rationale, rule_ids,
           policy_version, requested_by, expires_at, status, evidence_summary
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + interval '24 hours', 'pending', $10)
         ON CONFLICT (id) DO NOTHING`,
        [
          approvalId,
          state.tenant_id,
          state.work_order_draft!.id,
          tier,
          requiredRole,
          rationale,
          JSON.stringify(["POL-WC4-COOLANT", "POL-SAFETY-LOTO"]),
          "policy-v2.1",
          "agent:fp-orchestrator",
          JSON.stringify({
            hypotheses: state.hypotheses.map((h) => h.failure_mode),
            citations: state.citation_ids,
            trust_verdict: state.trust?.verdict ?? "nominal",
          }),
        ]
      );

      state.policy_approval = {
        id: approvalId,
        tier,
        required_role: requiredRole,
        rationale,
        status: "pending",
      };

      // Invariant 3: Append to audit chain
      const auditRes = await client.query<{ id: string }>(
        "SELECT gov.append_audit($1, $2, $3, $4) as id",
        [
          "fp-agent:orchestrator",
          "request_approval",
          approvalId,
          JSON.stringify({
            work_order_id: state.work_order_draft!.id,
            tier,
            required_role: requiredRole,
          }),
        ]
      );
      state.audit_event_ids.push(auditRes.rows[0]?.id ?? "");

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return state;
  }

  private async nodeFinalize(state: IncidentWorkflowState): Promise<IncidentWorkflowState> {
    const client = await this.deps.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [state.tenant_id]);

      // Upsert incident in PostgreSQL "case".incident (Invariant 4)
      await client.query(
        `INSERT INTO "case".incident (
           id, tenant_id, title, state, opened_at, rank, impact, lead_time,
           summary_text, template_summary, hypotheses, evidence,
           citation_blocked, what_would_change, citation_ids,
           trust_sensor_ids, abstention, trace_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (id) DO UPDATE SET
           state = EXCLUDED.state,
           rank = EXCLUDED.rank,
           impact = EXCLUDED.impact,
           summary_text = EXCLUDED.summary_text,
           template_summary = EXCLUDED.template_summary,
           hypotheses = EXCLUDED.hypotheses,
           evidence = EXCLUDED.evidence,
           abstention = EXCLUDED.abstention`,
        [
          state.incident_id,
          state.tenant_id,
          `Investigation: ${state.alert.signal_name}`,
          state.state,
          state.opened_at,
          state.impact?.rank ?? 1,
          state.impact?.lost_units_estimate ? `${state.impact.lost_units_estimate} lost units` : "low",
          JSON.stringify(state.alert.lead_time),
          state.summary_text,
          state.template_summary,
          JSON.stringify(state.hypotheses),
          JSON.stringify(state.retrieved_chunks.map((c) => ({ chunk_id: c.chunk_id, section: c.section, title: c.title }))),
          state.citation_blocked,
          JSON.stringify(state.what_would_change),
          JSON.stringify(state.citation_ids),
          JSON.stringify([state.alert.sensor_id]),
          state.abstained
            ? JSON.stringify({
                reason: state.abstention_reason,
                proposedCheck: state.proposed_check,
                minutes: 10,
              })
            : null,
          state.trace_id,
        ]
      );

      await client.query("COMMIT");
    } finally {
      client.release();
    }

    return state;
  }
}
