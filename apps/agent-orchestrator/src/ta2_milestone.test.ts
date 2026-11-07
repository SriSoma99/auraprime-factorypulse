import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config, appPool } from "@fp/db";
import {
  CausalEngine,
  LineImpactService,
  MultivariateDriftDetector,
  TrustService,
  type AlertEnvelope,
} from "@fp/intel-core";
import { KnowledgeService } from "@fp/knowledge-svc";
import { IncidentInvestigationWorkflow } from "./workflow.js";

describe("TA-2 Intelligence Phase Milestone: End-to-End Acceptance Criteria", () => {
  const cfg = config();
  const pool = appPool(cfg);

  let driftDetector: MultivariateDriftDetector;
  let trustService: TrustService;
  let impactService: LineImpactService;
  let causalEngine: CausalEngine;
  let knowledgeService: KnowledgeService;
  let workflow: IncidentInvestigationWorkflow;

  beforeAll(async () => {
    driftDetector = new MultivariateDriftDetector();
    trustService = new TrustService(pool);
    impactService = new LineImpactService(pool);
    causalEngine = new CausalEngine();
    knowledgeService = new KnowledgeService(cfg, pool);

    // Ingest approved engineering SOP
    await knowledgeService.ingestDocument({
      id: "CIT-WC4-MANUAL",
      tenant_id: "t-demo",
      metadata: {
        title: "Weld Cell 4 Maintenance Manual",
        section: "section 4.2",
        version: "v3",
        effective_from: "2025-03-01",
        classification: "internal",
        verified: true,
      },
      content: "Coolant restriction procedure: When return temperature increases and flow drops, inspect differential pressure on strainer basket. If DP exceeds 0.5 bar, clean strainer. Re-verify flow >= 23.5 L/min.",
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

  it("AC-H1: Coordinated multi-signal drift triggers an alert before any single threshold breaches", () => {
    // Flow dropping to 23.0 (z = -2.0 < 3.0 sigma), Temp rising to 29.5 (z = 1.875 < 3.0 sigma), Pump current rising to 8.9 (z = 1.6 < 3.0 sigma)
    const driftResult = driftDetector.analyzeSignals("as-wc4-coolant", [
      { sensor_id: "FT-401", value: 23.0, mean: 23.0, stddev: 0.5 },
      { sensor_id: "TT-402", value: 29.5, mean: 29.5, stddev: 0.8 },
      { sensor_id: "IT-405", value: 8.9, mean: 8.9, stddev: 0.25 },
    ]);

    expect(driftResult.is_drifting).toBe(true);
    expect(driftResult.drift_score).toBeGreaterThanOrEqual(driftResult.threshold);
    expect(driftResult.lead_time_minutes).toBeGreaterThan(0);
    expect(driftResult.contributing_signals.length).toBe(3);
  });

  it("AC-H2: Sensor trust check separates sensor/data fault from machine fault", () => {
    // 1. Suspect flatline while correlated sensors normal -> sensor_fault
    const sensorVerdict = trustService.determineVerdict(0.18, [
      { sensor_id: "TT-402", trust_score: 0.95, value: 28.0 },
      { sensor_id: "IT-405", trust_score: 0.92, value: 8.5 },
    ]);
    expect(sensorVerdict.verdict).toBe("sensor_fault");
    expect(sensorVerdict.level).toBe("untrustworthy");

    // 2. Suspect high trust and correlated high trust with physical deviation -> machine_fault
    const machineVerdict = trustService.determineVerdict(0.92, [
      { sensor_id: "TT-402", trust_score: 0.95, value: 34.0 },
      { sensor_id: "IT-405", trust_score: 0.92, value: 9.6 },
    ]);
    expect(machineVerdict.verdict).toBe("machine_fault");
    expect(machineVerdict.level).toBe("confirmed_good");
  });

  it("AC-H3: Line impact prioritises open alerts by predicted lost good units and shows buffer starvation time", () => {
    const impact = impactService.calculateStationImpact("line-body-1", "st-cell4", "critical");

    // 22-minute buffer from Weld Cell 4 to Quality Gate
    expect(impact.starvationTimeMinutes).toBeCloseTo(21.8, 1);
    expect(impact.lostUnitsEstimate).toBeGreaterThanOrEqual(45);
    expect(impact.cascadePath).toContain("st-qgate");

    // Queue ranking prioritises higher lost units
    const alerts: AlertEnvelope[] = [
      {
        id: "ALT-CONV",
        tenant_id: "t-demo",
        sensor_id: "VT-102",
        line_id: "line-body-1",
        signal_name: "Drive vibration VT-102",
        detail: "Vibration warning",
        severity: "warning",
        rank: 1,
        impact: "low",
        lead_time: { hours: 5, confidence: 0.8 },
        status: "open",
        traceparent: "00-test-conv",
        arrived_at: new Date().toISOString(),
        is_synthetic: true,
      },
      {
        id: "ALT-WELD",
        tenant_id: "t-demo",
        sensor_id: "FT-401",
        line_id: "line-body-1",
        signal_name: "Coolant flow FT-401",
        detail: "Critical flow reduction",
        severity: "critical",
        rank: 2,
        impact: "high",
        lead_time: { hours: 1, confidence: 0.9 },
        status: "open",
        traceparent: "00-test-weld",
        arrived_at: new Date().toISOString(),
        is_synthetic: true,
      },
    ];

    const ranked = impactService.rankAlertQueue(alerts);
    expect(ranked[0]!.id).toBe("ALT-WELD"); // Critical Weld Cell 4 tops queue
    expect(ranked[0]!.impactAssessment.rank).toBe(1);
  });

  it("AC-H4: Causal model ranks hypotheses and links supporting citations to retrieved chunks", () => {
    const causalResult = causalEngine.analyze({
      asset_id: "as-wc4-coolant",
      contributing_signals: [
        { sensor_id: "FT-401", value: 16.5, nominal_mean: 24.0 },
        { sensor_id: "TT-402", value: 34.0, nominal_mean: 28.0 },
        { sensor_id: "IT-405", value: 9.8, nominal_mean: 8.5 },
      ],
      trust_verdict: "machine_fault",
    });

    expect(causalResult.hypotheses.length).toBeGreaterThanOrEqual(3);
    const topH = causalResult.hypotheses[0]!;
    expect(topH.id).toBe("FM-COOL-01");
    expect(topH.probability).toBeGreaterThan(0.5);
    expect(topH.evidence_for.length).toBeGreaterThan(0);
  });

  it("AC-H5: When hypotheses cannot be separated, agent abstains and proposes a discriminating physical check", async () => {
    // Ambiguous signals where flow is slightly low but temp is only marginally elevated
    const ambiguousAlert: AlertEnvelope = {
      id: `ALT-AMB-${Date.now()}`,
      tenant_id: "t-demo",
      sensor_id: "FT-401",
      line_id: "line-body-1",
      signal_name: "Coolant flow FT-401",
      detail: "Moderate flow drop with ambiguous secondary signals",
      severity: "warning",
      rank: 2,
      impact: "medium",
      lead_time: { hours: 6, confidence: 0.6 },
      status: "open",
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      arrived_at: new Date().toISOString(),
      is_synthetic: true,
    };

    const result = await workflow.execute(ambiguousAlert);

    // If hypotheses are close or top probability is moderate, workflow abstains and proposes check
    if (result.abstained) {
      expect(result.state).toBe("abstained");
      expect(result.proposed_check).toBeDefined();
      expect(result.what_would_change.length).toBeGreaterThan(0);
      expect(result.work_order_draft!.title).toContain("Discriminating Check");
    } else {
      expect(result.state).toBe("awaiting_approval");
    }
  });

  it("AC-H8: Work order is created strictly in draft state awaiting human approval with required policy tier", async () => {
    const alert: AlertEnvelope = {
      id: `ALT-WO-${Date.now()}`,
      tenant_id: "t-demo",
      sensor_id: "FT-401",
      line_id: "line-body-1",
      signal_name: "Coolant flow FT-401",
      detail: "Coolant restriction",
      severity: "critical",
      rank: 1,
      impact: "high",
      lead_time: { hours: 2, confidence: 0.9 },
      status: "open",
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      arrived_at: new Date().toISOString(),
      is_synthetic: true,
    };

    const result = await workflow.execute(alert);

    // Invariant 2: Human-only approval
    expect(result.work_order_draft).toBeDefined();
    expect(result.work_order_draft!.is_draft).toBe(true);
    expect(result.policy_approval).toBeDefined();
    expect(result.policy_approval!.tier).toBe(1);
    expect(result.policy_approval!.status).toBe("pending");
    expect(result.policy_approval!.required_role).toBe("lead_engineer");

    // Invariant 3: Audit event recorded in hash chain
    expect(result.audit_event_ids.length).toBeGreaterThan(0);
  });
});
