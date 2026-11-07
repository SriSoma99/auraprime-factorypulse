import { describe, it, expect, afterAll } from "vitest";
import { config, appPool } from "@fp/db";
import { ResolutionVerificationService } from "./resolution.js";

describe("Resolution Verification Service (APP-12 / LRN-1, LRN-2, AC-H7)", () => {
  const cfg = config();
  const pool = appPool(cfg);
  const resolutionService = new ResolutionVerificationService(pool);

  afterAll(async () => {
    await pool.end();
  });

  it("captures technician outcome and verifies physical reversal across good cycles (LRN-1, LRN-2, AC-H7)", async () => {
    const incId = `INC-VERIF-${Date.now()}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      await client.query(
        `INSERT INTO "case".incident (
           id, tenant_id, title, state, opened_at, summary_text, template_summary,
           hypotheses, evidence, what_would_change, citation_ids, trust_sensor_ids, trace_id
         ) VALUES ($1, 't-demo', 'Weld Cell 4 Coolant Flow Drift', 'in_progress', now(),
                   'Coolant flow restricted', 'Template', '[]', '[]', '[]', '[]', '[]',
                   '4bf92f3577b34da6a3ce929d0e0e4736')`,
        [incId]
      );

      await client.query("COMMIT");
    } finally {
      client.release();
    }

    // 1. Record technician outcome (LRN-1)
    const outcome = await resolutionService.recordOutcome({
      tenant_id: "t-demo",
      incident_id: incId,
      technician_id: "tech-42",
      finding: "Coolant strainer basket heavily fouled with particulate debris.",
      readings: { "FT-401": 24.2, "TT-402": 26.5 },
      action_taken: "Flushed strainer basket per SOP-WC-07 and restored nominal flow.",
    });

    expect(outcome.id).toBeDefined();
    expect(outcome.verified).toBe(false);
    expect(outcome.good_cycle_count).toBe(0);

    // 2. Simulate 4 consecutive nominal cycles (in_verification)
    for (let cycle = 1; cycle <= 4; cycle++) {
      const cycleRes = await resolutionService.evaluateCycle({
        tenant_id: "t-demo",
        incident_id: incId,
        drift_detected: false,
        metric_name: "FT-401",
        metric_value: 24.0 + cycle * 0.1,
        required_consecutive_cycles: 5,
      });

      expect(cycleRes.status).toBe("in_verification");
      expect(cycleRes.consecutive_good_cycles).toBe(cycle);
    }

    // 3. 5th nominal cycle reaches threshold: verified closure (LRN-2, AC-H7)
    const fifthCycle = await resolutionService.evaluateCycle({
      tenant_id: "t-demo",
      incident_id: incId,
      drift_detected: false,
      metric_name: "FT-401",
      metric_value: 24.3,
      required_consecutive_cycles: 5,
    });

    expect(fifthCycle.status).toBe("verified_closed");
    expect(fifthCycle.consecutive_good_cycles).toBe(5);

    // Verify incident state in database
    const verifyClient = await pool.connect();
    try {
      await verifyClient.query("BEGIN");
      await verifyClient.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      const inc = (await verifyClient.query<{ state: string }>(
        `SELECT state FROM "case".incident WHERE id = $1`,
        [incId]
      )).rows[0]!;
      expect(inc.state).toBe("closed");

      const out = (await verifyClient.query<{ verified: boolean; good_cycle_count: number }>(
        `SELECT verified, good_cycle_count FROM "case".outcome WHERE id = $1`,
        [outcome.id]
      )).rows[0]!;
      expect(out.verified).toBe(true);
      expect(out.good_cycle_count).toBe(5);

      await verifyClient.query("COMMIT");
    } finally {
      verifyClient.release();
    }
  }, 15000);

  it("reopens incident when simulated failed fix reveals persistent drift (AC-H7)", async () => {
    const incId = `INC-REOPEN-${Date.now()}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      await client.query(
        `INSERT INTO "case".incident (
           id, tenant_id, title, state, opened_at, summary_text, template_summary,
           hypotheses, evidence, what_would_change, citation_ids, trust_sensor_ids, trace_id
         ) VALUES ($1, 't-demo', 'Recurring Temperature Drift', 'in_progress', now(),
                   'Temp rising', 'Template', '[]', '[]', '[]', '[]', '[]',
                   '4bf92f3577b34da6a3ce929d0e0e4736')`,
        [incId]
      );

      await client.query("COMMIT");
    } finally {
      client.release();
    }

    // 1. Record outcome
    await resolutionService.recordOutcome({
      tenant_id: "t-demo",
      incident_id: incId,
      technician_id: "tech-18",
      finding: "Inspected valve; appeared open.",
      readings: { "TT-402": 31.0 },
      action_taken: "Adjusted manual valve position.",
    });

    // 2. Cycle 1 nominal
    const c1 = await resolutionService.evaluateCycle({
      tenant_id: "t-demo",
      incident_id: incId,
      drift_detected: false,
      metric_name: "TT-402",
      metric_value: 26.0,
      required_consecutive_cycles: 5,
    });
    expect(c1.status).toBe("in_verification");

    // 3. Cycle 2: Failed fix! Drift re-occurs! (AC-H7)
    const c2 = await resolutionService.evaluateCycle({
      tenant_id: "t-demo",
      incident_id: incId,
      drift_detected: true,
      metric_name: "TT-402",
      metric_value: 33.5, // High temperature drift persists
      required_consecutive_cycles: 5,
    });

    expect(c2.status).toBe("reopened");
    expect(c2.consecutive_good_cycles).toBe(0);

    // Verify incident reopened in database
    const verifyClient = await pool.connect();
    try {
      await verifyClient.query("BEGIN");
      await verifyClient.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      const inc = (await verifyClient.query<{ state: string; summary_text: string }>(
        `SELECT state, summary_text FROM "case".incident WHERE id = $1`,
        [incId]
      )).rows[0]!;
      expect(inc.state).toBe("open");
      expect(inc.summary_text).toContain("Verification failed");

      await verifyClient.query("COMMIT");
    } finally {
      verifyClient.release();
    }
  });
});
