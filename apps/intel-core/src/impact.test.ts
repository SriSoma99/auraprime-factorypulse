import { describe, it, expect, afterAll } from "vitest";
import { config, appPool } from "@fp/db";
import { LineImpactService } from "./impact.js";
import type { AlertEnvelope } from "./types.js";

describe("Line-Impact Prioritisation Service (APP-06 / LIM-1..5)", () => {
  const cfg = config();
  const pool = appPool(cfg);
  const impactService = new LineImpactService(pool);

  afterAll(async () => {
    await pool.end();
  });

  it("calculates 22-min buffer starvation and lost units for Weld Cell 4 alert (LIM-1, LIM-2)", () => {
    const impact = impactService.calculateStationImpact("line-body-1", "st-cell4", "critical");

    // Weld Cell 4 has 29 buffer units to QGate (cycle time 45s) -> (29 * 45)/60 = 21.75 min ≈ 21.8 min
    expect(impact.starvationTimeMinutes).toBeCloseTo(21.8, 1);
    expect(impact.bottleneckStationId).toBe("st-qgate");
    expect(impact.cascadePath).toEqual(["st-cell4", "st-qgate", "st-paint"]);

    // With 22 min buffer and critical stoppage, lost good units over 60-min horizon = (60 - 21.8)/60 * 80 ≈ 51 units
    expect(impact.lostUnitsEstimate).toBeGreaterThanOrEqual(45);
    expect(impact.lostUnitsEstimate).toBeLessThanOrEqual(55);
    expect(impact.throughputAtRiskPct).toBeGreaterThanOrEqual(55);
  });

  it("ranks alert queue by predicted lost good units rather than severity alone (LIM-3)", () => {
    const alerts: AlertEnvelope[] = [
      {
        id: "ALT-01",
        tenant_id: "t-demo",
        sensor_id: "VT-102", // Stamping press / upstream conveyor
        line_id: "line-body-1",
        signal_name: "Drive vibration VT-102",
        detail: "Vibration high",
        severity: "warning",
        rank: 1,
        impact: "low",
        lead_time: { hours: 4, confidence: 0.8 },
        status: "open",
        traceparent: "00-test-1",
        arrived_at: new Date().toISOString(),
        is_synthetic: true,
      },
      {
        id: "ALT-02",
        tenant_id: "t-demo",
        sensor_id: "FT-401", // Weld Cell 4 Coolant flow
        line_id: "line-body-1",
        signal_name: "Coolant flow FT-401",
        detail: "Flow low",
        severity: "critical",
        rank: 2,
        impact: "high",
        lead_time: { hours: 1, confidence: 0.9 },
        status: "open",
        traceparent: "00-test-2",
        arrived_at: new Date().toISOString(),
        is_synthetic: true,
      },
    ];

    const ranked = impactService.rankAlertQueue(alerts);
    expect(ranked.length).toBe(2);

    // ALT-02 (Weld Cell 4) has larger throughput loss than ALT-01
    expect(ranked[0]!.id).toBe("ALT-02");
    expect(ranked[0]!.impactAssessment.rank).toBe(1);
    expect(ranked[1]!.id).toBe("ALT-01");
    expect(ranked[1]!.impactAssessment.rank).toBe(2);
  });

  it("persists line impact into PostgreSQL intel.line_impact with RLS isolation (LIM-4)", async () => {
    const impact = impactService.calculateStationImpact("line-body-1", "st-cell4", "critical");
    await impactService.persistLineImpact({
      line_id: "line-body-1",
      tenant_id: "t-demo",
      station_id: "st-cell4",
      starvation_time_minutes: impact.starvationTimeMinutes,
      bottleneck_station_id: impact.bottleneckStationId,
      lost_units_estimate: impact.lostUnitsEstimate,
      throughput_at_risk_pct: impact.throughputAtRiskPct,
      cascade_path: impact.cascadePath,
      confidence: impact.confidence,
      rank: 1,
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      const res = await client.query<{ line_id: string; cascade: { starvation_time_minutes: number } }>(
        "SELECT line_id, cascade FROM intel.line_impact WHERE line_id = $1",
        ["line-body-1"]
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]!.line_id).toBe("line-body-1");
      expect(res.rows[0]!.cascade.starvation_time_minutes).toBeCloseTo(21.8, 1);

      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });
});
