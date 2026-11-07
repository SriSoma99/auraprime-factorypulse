import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config, appPool } from "@fp/db";
import { KnowledgeService, LocalEmbedder } from "@fp/knowledge-svc";
import { LearningService } from "./learning.js";

describe("Case Memory & Gated Learning Service (APP-12 / LRN-3..7, AC-H9, AC-H10, ADR-031)", () => {
  const cfg = config();
  const pool = appPool(cfg);
  const knowledgeService = new KnowledgeService(cfg, pool);
  const learningService = new LearningService(pool, knowledgeService);

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");
      await client.query("DELETE FROM learn.lesson");
      await client.query("DELETE FROM learn.case_record");
      await client.query("DELETE FROM learn.learning_batch");
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("stores episodic case memory and retrieves similar verified cases as cited evidence (LRN-5, AC-H10)", async () => {
    const incId = `INC-CASE-${Date.now()}`;

    // Ensure parent incident exists in DB
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");
      await client.query(
        `INSERT INTO "case".incident (
           id, tenant_id, title, state, opened_at, summary_text, template_summary,
           hypotheses, evidence, what_would_change, citation_ids, trust_sensor_ids, trace_id
         ) VALUES ($1, 't-demo', 'Strainer Fouling Historical Incident', 'closed', now(),
                   'Strainer clogged with particulate', 'Template', '[]', '[]', '[]', '[]', '[]',
                   '4bf92f3577b34da6a3ce929d0e0e4736')`,
        [incId]
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    // 1. Store case memory upon verified resolution
    const caseRecord = await learningService.storeCaseMemory({
      tenant_id: "t-demo",
      incident_id: incId,
      asset_id: "as-wc4-coolant",
      asset_class: "weld_cell_coolant_system",
      signal_pattern: { "FT-401": 18.2, "TT-402": 31.8, "IT-405": 8.7 },
      trust_verdicts: { "FT-401": "machine_fault", "TT-402": "nominal" },
      hypotheses: [
        { failure_mode: "Coolant strainer basket restriction", posterior: 0.88 },
        { failure_mode: "Impeller cavitation", posterior: 0.12 },
      ],
      discriminating_check: {
        method: "Strainer Differential Pressure Inspection",
        instruction: "Inspect differential pressure gauge on basket strainer.",
      },
      confirmed_failure_mode: "Coolant strainer basket restriction",
      action_taken: "Cleaned particulate from strainer basket per SOP-WC-07; restored nominal flow.",
      outcome: { verified: true, post_flow_rate: 24.3, cycles: 5 },
    });

    expect(caseRecord.id).toBeDefined();
    expect(caseRecord.confirmed_failure_mode).toBe("Coolant strainer basket restriction");

    // 2. Second occurrence: retrieve similar cases by semantic pattern (AC-H10)
    const similar = await learningService.findSimilarCases(
      "t-demo",
      "weld_cell_coolant_system",
      "Coolant flow restriction with rising temperature and strainer blockage",
      2
    );

    expect(similar.length).toBeGreaterThanOrEqual(1);
    expect(similar.some((c) => c.id === caseRecord.id)).toBe(true);
    expect(similar[0]!.confirmed_failure_mode).toBe("Coolant strainer basket restriction");
    expect(similar[0]!.similarity).toBeGreaterThan(0.30);
  });

  it("model drafts reusable lesson citing case, requiring human approval before retrieval promotion (LRN-6)", async () => {
    const incId = `INC-LES-${Date.now()}`;
    const client = await pool.connect();
    let caseId = "";
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      await client.query(
        `INSERT INTO "case".incident (
           id, tenant_id, title, state, opened_at, summary_text, template_summary,
           hypotheses, evidence, what_would_change, citation_ids, trust_sensor_ids, trace_id
         ) VALUES ($1, 't-demo', 'Valve Drift Historical Incident', 'closed', now(),
                   'Valve bypass', 'Template', '[]', '[]', '[]', '[]', '[]',
                   '4bf92f3577b34da6a3ce929d0e0e4736')`,
        [incId]
      );

      const sampleVec = new LocalEmbedder().embedText("Bypass valve seat leakage");
      const caseRes = await client.query<{ id: string }>(
        `INSERT INTO learn.case_record (
           id, tenant_id, incident_id, asset_id, asset_class, signal_pattern,
           trust_verdicts, hypotheses, confirmed_failure_mode, action_taken, outcome,
           verified_at, embedding
         ) VALUES ($1, 't-demo', $2, 'as-wc4-coolant', 'weld_cell_coolant_system', '{}',
                   '{}', '[]', 'Bypass valve seat leakage', 'Replaced valve seat', '{}', now(),
                   $3::vector)
         RETURNING id`,
        [`CASE-${Date.now()}`, incId, JSON.stringify(sampleVec)]
      );
      caseId = caseRes.rows[0]!.id;

      await client.query("COMMIT");
    } finally {
      client.release();
    }

    // 1. Model drafts reusable lesson (labelled AI-generated, citing case ID)
    const draft = await learningService.draftLesson(
      "t-demo",
      caseId,
      "Coolant bypass valve seat leakage: When FT-401 drops below 19 L/min while TT-402 rises without DP change across strainer, inspect bypass valve seat for wear.",
      "fp-local-embed-v1"
    );

    expect(draft.status).toBe("draft");
    expect(draft.is_ai_generated).toBe(true);
    expect(draft.case_id).toBe(caseId);

    // 2. Human reliability engineer approves lesson
    const approved = await learningService.decideLesson(
      "t-demo",
      draft.id,
      "elena.manager@factory.internal",
      "approved",
      "Validated with maintenance crew; accurate diagnostic guideline."
    );

    expect(approved.status).toBe("approved");
    expect(approved.decided_by).toBe("elena.manager@factory.internal");

    // 3. Verify chunk was indexed in know.chunk_embedding for operational retrieval
    const verifyClient = await pool.connect();
    try {
      await verifyClient.query("BEGIN");
      await verifyClient.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      const chunkRes = await verifyClient.query<{ id: string; content: string }>(
        `SELECT id, content FROM know.chunk_embedding WHERE citation_id = $1`,
        [`CIT-LES-${draft.id}`]
      );
      expect(chunkRes.rows.length).toBeGreaterThanOrEqual(1);
      expect(chunkRes.rows[0]!.content).toContain("bypass valve seat");

      await verifyClient.query("COMMIT");
    } finally {
      verifyClient.release();
    }
  });

  it("stages learning batch and rejects regressive updates through the evaluation gate (LRN-7, AC-H10)", async () => {
    const baselineBenchmark = {
      detection_lead_time_hours: 5.2,
      false_alarm_rate: 0.03,
      rca_top1_accuracy: 0.92,
      rca_top3_accuracy: 0.98,
      citation_coverage: 1.0,
    };

    // Candidate 1: Regressed metrics (shorter lead time and worse accuracy)
    const regressiveCandidate = {
      detection_lead_time_hours: 3.5, // Regressed by 1.7h (> 0.5h tolerance)
      false_alarm_rate: 0.07, // Increased by 0.04 (> 0.02 tolerance)
      rca_top1_accuracy: 0.84, // Dropped by 0.08 (> 0.02 tolerance)
      rca_top3_accuracy: 0.95,
      citation_coverage: 1.0,
    };

    const regResult = await learningService.stageAndEvaluateBatch({
      tenant_id: "t-demo",
      batch_id: `BATCH-REG-${Date.now()}`,
      decided_by: "system:evaluator",
      candidate_benchmark: regressiveCandidate,
      baseline_benchmark: baselineBenchmark,
    });

    expect(regResult.gate_passed).toBe(false);
    expect(regResult.batch.status).toBe("rejected");
    expect(regResult.rejection_reasons?.length).toBeGreaterThanOrEqual(2);

    // Candidate 2: Improved metrics
    const improvedCandidate = {
      detection_lead_time_hours: 5.4,
      false_alarm_rate: 0.025,
      rca_top1_accuracy: 0.94,
      rca_top3_accuracy: 0.99,
      citation_coverage: 1.0,
    };

    const passResult = await learningService.stageAndEvaluateBatch({
      tenant_id: "t-demo",
      batch_id: `BATCH-PASS-${Date.now()}`,
      decided_by: "system:evaluator",
      candidate_benchmark: improvedCandidate,
      baseline_benchmark: baselineBenchmark,
    });

    expect(passResult.gate_passed).toBe(true);
    expect(passResult.batch.status).toBe("active");
    expect(passResult.rejection_reasons).toBeUndefined();
  });
});
