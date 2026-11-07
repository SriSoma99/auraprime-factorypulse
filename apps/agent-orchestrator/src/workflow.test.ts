import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config, appPool } from "@fp/db";
import {
  CausalEngine,
  LineImpactService,
  TrustService,
  type AlertEnvelope,
} from "@fp/intel-core";
import { KnowledgeService } from "@fp/knowledge-svc";
import { IncidentInvestigationWorkflow } from "./workflow.js";

describe("Agent Investigation Workflow (APP-09 / AGT-1..8)", () => {
  const cfg = config();
  const pool = appPool(cfg);

  let workflow: IncidentInvestigationWorkflow;
  let knowledgeService: KnowledgeService;

  beforeAll(async () => {
    const trustService = new TrustService(pool);
    const impactService = new LineImpactService(pool);
    const causalEngine = new CausalEngine();
    knowledgeService = new KnowledgeService(cfg, pool);

    // Seed knowledge base document for retrieval
    await knowledgeService.ingestDocument({
      id: "CIT-WC4-SOP",
      tenant_id: "t-demo",
      metadata: {
        title: "Weld Cell 4 Coolant System SOP",
        section: "section 4.2",
        version: "v3",
        effective_from: "2025-03-01",
        classification: "internal",
        verified: true,
      },
      content: "Coolant flow restriction: when strainer basket accumulates debris, differential pressure increases and coolant flow drops below nominal 24 L/min. Clean strainer basket per procedure SOP-WC-07.",
    });

    workflow = new IncidentInvestigationWorkflow({
      pool,
      trustService,
      impactService,
      causalEngine,
      knowledgeService,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("executes complete investigation lifecycle for Weld Cell 4 Coolant anomaly (Hero Scenario)", async () => {
    const testAlert: AlertEnvelope = {
      id: `ALT-TEST-${Date.now()}`,
      tenant_id: "t-demo",
      sensor_id: "FT-401",
      line_id: "line-body-1",
      signal_name: "Coolant flow FT-401",
      detail: "Coolant flow 17.5 L/min below warning threshold",
      severity: "critical",
      rank: 1,
      impact: "high",
      lead_time: { hours: 2, confidence: 0.88 },
      status: "open",
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      arrived_at: new Date().toISOString(),
      is_synthetic: true,
    };

    const result = await workflow.execute(testAlert);

    // 1. Trace ID preserved from W3C traceparent
    expect(result.trace_id).toBe("4bf92f3577b34da6a3ce929d0e0e4736");

    // 2. Trust check evaluated
    expect(result.trust).toBeDefined();
    expect(result.trust!.sensor_id).toBe("FT-401");

    // 3. Line impact prioritisation (LIM-1..4)
    expect(result.impact).toBeDefined();
    expect(result.impact!.starvation_time_minutes).toBeCloseTo(21.8, 1); // 22-min buffer
    expect(result.impact!.lost_units_estimate).toBeGreaterThanOrEqual(40);

    // 4. Causal hypotheses ranked (AGT-2)
    expect(result.hypotheses.length).toBeGreaterThanOrEqual(2);
    expect(result.hypotheses[0]!.id).toBe("FM-COOL-01"); // Coolant restriction

    // 5. Knowledge retrieval executed (RAG-1..4)
    expect(result.retrieved_chunks.length).toBeGreaterThanOrEqual(1);

    // 6. Work order created strictly as draft (Invariant 2)
    expect(result.work_order_draft).toBeDefined();
    expect(result.work_order_draft!.is_draft).toBe(true);
    expect(result.work_order_draft!.steps.length).toBeGreaterThanOrEqual(3);

    // 7. Policy gate held for human approval (Invariant 2)
    expect(result.policy_approval).toBeDefined();
    expect(result.policy_approval!.tier).toBe(1);
    expect(result.policy_approval!.required_role).toBe("lead_engineer");
    expect(result.policy_approval!.status).toBe("pending");

    // 8. Hash-chained audit event recorded (Invariant 3)
    expect(result.audit_event_ids.length).toBeGreaterThanOrEqual(2);

    // 9. Persisted in PostgreSQL "case".incident under tenant RLS (Invariant 4)
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      const res = await client.query<{ id: string; state: string; trace_id: string }>(
        `SELECT id, state, trace_id FROM "case".incident WHERE id = $1`,
        [result.incident_id]
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]!.id).toBe(result.incident_id);
      expect(res.rows[0]!.trace_id).toBe(result.trace_id);

      // Verify work order in "case".work_order
      const woRes = await client.query<{ status: string; is_draft: boolean }>(
        `SELECT status, is_draft FROM "case".work_order WHERE id = $1`,
        [result.work_order_draft!.id]
      );
      expect(woRes.rows.length).toBe(1);
      expect(woRes.rows[0]!.status).toBe("draft");
      expect(woRes.rows[0]!.is_draft).toBe(true);

      // Verify approval in "case".approval
      const appRes = await client.query<{ status: string; tier: number }>(
        `SELECT status, tier FROM "case".approval WHERE id = $1`,
        [result.policy_approval!.id]
      );
      expect(appRes.rows.length).toBe(1);
      expect(appRes.rows[0]!.status).toBe("pending");
      expect(appRes.rows[0]!.tier).toBe(1);

      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });

  it("short-circuits machine diagnosis when Telemetry Trust identifies sensor fault (TRU-3)", async () => {
    // Sensor flatlining at constant reading
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");
      // Inject flatline trust assessment for PT-310
      await client.query(
        `INSERT INTO intel.trust_assessment (
           sensor_id, tenant_id, score, level, verdict, verdict_text,
           checks, series, history
         ) VALUES ($1, $2, 0.15, 'untrustworthy', 'sensor_fault', 'Sensor flatline detected', '{}', '[]', '[]')
         ON CONFLICT (sensor_id) DO UPDATE SET verdict = 'sensor_fault', level = 'untrustworthy'`,
        ["PT-310", "t-demo"]
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const sensorAlert: AlertEnvelope = {
      id: `ALT-SENS-${Date.now()}`,
      tenant_id: "t-demo",
      sensor_id: "PT-310",
      line_id: "line-body-1",
      signal_name: "Pressure sensor PT-310",
      detail: "Signal flatline for 3 hours",
      severity: "warning",
      rank: 4,
      impact: "low",
      lead_time: { hours: 8, confidence: 0.95 },
      status: "open",
      traceparent: "00-1a2b3c4d5e6f708192a3b4c5d6e7f809-00f067aa0ba902b7-01",
      arrived_at: new Date().toISOString(),
      is_synthetic: true,
    };

    const result = await workflow.execute(sensorAlert);
    expect(result.trust?.verdict).toBe("sensor_fault");
    // Machine hypotheses should be empty because machine diagnosis was skipped
    expect(result.hypotheses.length).toBe(0);
    expect(result.summary_text).toContain("sensor fault");
  });
});
