import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config, appPool } from "@fp/db";
import { TrustService } from "./trust.js";

describe("Telemetry Trust Service (APP-05 / TRU-1..4)", () => {
  const cfg = config();
  const pool = appPool(cfg);
  const trustService = new TrustService(pool);

  afterAll(async () => {
    await pool.end();
  });

  it("evaluates all 5 statistical trust checks and detects staleness/flatline penalties (TRU-1)", () => {
    // 1. Nominal sensor reading
    const nominal = trustService.evaluateChecks({
      tenant_id: "t-demo",
      sensor_id: "FT-401",
      asset_id: "as-wc4-coolant",
      value: 24.1,
      ts: new Date().toISOString(),
      window_stddev: 0.45,
      recent_values: [24.0, 24.2, 23.9, 24.1, 24.3],
      sensor_meta: "ultrasonic · calibrated 2026-05-20",
    });

    expect(nominal.overallScore).toBeGreaterThanOrEqual(0.85);
    expect(nominal.checks["range"]!.passed).toBe(true);
    expect(nominal.checks["staleness"]!.passed).toBe(true);
    expect(nominal.checks["flatline"]!.passed).toBe(true);
    expect(nominal.checks["calibration"]!.passed).toBe(true);

    // 2. Stale reading (> 60s) triggers hard floor penalty
    const staleTs = new Date(Date.now() - 150_000).toISOString();
    const staleResult = trustService.evaluateChecks({
      tenant_id: "t-demo",
      sensor_id: "FT-401",
      asset_id: "as-wc4-coolant",
      value: 24.1,
      ts: staleTs,
    });
    expect(staleResult.checks["staleness"]!.passed).toBe(false);
    expect(staleResult.overallScore).toBeLessThanOrEqual(0.15); // Hard floor applied

    // 3. Flatline reading triggers flatline penalty
    const flatlineResult = trustService.evaluateChecks({
      tenant_id: "t-demo",
      sensor_id: "FT-401",
      asset_id: "as-wc4-coolant",
      value: 24.0,
      ts: new Date().toISOString(),
      recent_values: [24.0, 24.0, 24.0, 24.0, 24.0],
    });
    expect(flatlineResult.checks["flatline"]!.passed).toBe(false);
    expect(flatlineResult.overallScore).toBeLessThanOrEqual(0.2);
  });

  it("determines verdict using decision table separating sensor faults from machine faults (TRU-2)", () => {
    // Suspect sensor low trust + related sensors high trust -> sensor_fault
    const sensorFaultVerdict = trustService.determineVerdict(0.25, [
      { sensor_id: "TT-402", trust_score: 0.95, value: 28.0 },
      { sensor_id: "IT-405", trust_score: 0.92, value: 8.5 },
    ]);
    expect(sensorFaultVerdict.verdict).toBe("sensor_fault");
    expect(sensorFaultVerdict.level).toBe("untrustworthy");

    // Suspect high trust + related high trust -> machine_fault
    const machineFaultVerdict = trustService.determineVerdict(0.88, [
      { sensor_id: "TT-402", trust_score: 0.95, value: 34.5 },
      { sensor_id: "IT-405", trust_score: 0.92, value: 9.8 },
    ]);
    expect(machineFaultVerdict.verdict).toBe("machine_fault");
    expect(machineFaultVerdict.level).toBe("confirmed_good");

    // Suspect low trust + related low trust -> undetermined
    const undeterminedVerdict = trustService.determineVerdict(0.3, [
      { sensor_id: "TT-402", trust_score: 0.35, value: 0 },
    ]);
    expect(undeterminedVerdict.verdict).toBe("undetermined");
    expect(undeterminedVerdict.level).toBe("undetermined");
  });

  it("persists assessment to PostgreSQL intel.trust_assessment and drafts sensor work order on sensor fault (TRU-3)", async () => {
    const assessment = await trustService.assessSensor({
      tenant_id: "t-demo",
      sensor_id: "PT-310",
      asset_id: "as-wc4-coolant",
      value: 12.0,
      ts: new Date().toISOString(),
      window_stddev: 0.00001, // Flatline
      recent_values: [12.0, 12.0, 12.0, 12.0, 12.0],
      related_sensor_readings: [
        { sensor_id: "TT-402", trust_score: 0.95, value: 28.0 },
      ],
    });

    expect(assessment.verdict).toBe("sensor_fault");
    expect(assessment.sensor_work_order_id).toBeDefined();
    expect(assessment.sensor_work_order_id).toBe("WO-SENS-PT-310");

    // Verify record in PostgreSQL intel.trust_assessment with forced RLS
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      const res = await client.query<{ verdict: string; score: string; sensor_work_order_id: string }>(
        "SELECT verdict, score, sensor_work_order_id FROM intel.trust_assessment WHERE sensor_id = $1",
        ["PT-310"]
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]!.verdict).toBe("sensor_fault");
      expect(res.rows[0]!.sensor_work_order_id).toBe("WO-SENS-PT-310");

      // Verify draft work order exists in case.work_order with draft status
      const woRes = await client.query<{ status: string; title: string }>(
        `SELECT status, title FROM "case".work_order WHERE id = $1`,
        ["WO-SENS-PT-310"]
      );
      expect(woRes.rows.length).toBe(1);
      expect(woRes.rows[0]!.status).toBe("draft");
      expect(woRes.rows[0]!.title).toContain("PT-310");

      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });

  it("enforces tenant RLS isolation on intel.trust_assessment (Invariant 4)", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-other', true)");

      // Tenant t-other cannot see t-demo trust assessment
      const res = await client.query(
        "SELECT * FROM intel.trust_assessment WHERE sensor_id = $1",
        ["PT-310"]
      );
      expect(res.rows.length).toBe(0);

      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });
});
