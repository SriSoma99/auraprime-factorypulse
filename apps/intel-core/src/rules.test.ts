// Unit tests for detection rules (DET-1, DET-4).
import { describe, it, expect } from "vitest";
import { evaluateFeatureEnvelope } from "./rules.js";
import type { TelemetryFeatureEnvelope } from "./types.js";

function makeFeature(
  sensorId: string,
  value: number,
  window: { count: number; mean: number; min: number; max: number; stddev: number }
): TelemetryFeatureEnvelope {
  return {
    tenant_id: "t-demo",
    site_id: "site-a",
    line_id: "line-body-1",
    station_id: "st-cell4",
    asset_id: "as-wc4-coolant",
    sensor_id: sensorId,
    ts: new Date().toISOString(),
    value,
    quality_flag: "good",
    traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    window,
  };
}

describe("Baseline Detection Rules", () => {
  it("does not trigger on nominal values", () => {
    const f = makeFeature("FT-401", 24.2, { count: 10, mean: 24.0, min: 23.8, max: 24.3, stddev: 0.2 });
    const res = evaluateFeatureEnvelope(f);
    expect(res.triggered).toBe(false);
  });

  it("triggers warning and critical thresholds on coolant flow FT-401 (DET-4)", () => {
    // Warning: < 15.0
    const warnFeature = makeFeature("FT-401", 14.2, { count: 10, mean: 16.0, min: 14.0, max: 18.0, stddev: 1.2 });
    const warnRes = evaluateFeatureEnvelope(warnFeature);
    expect(warnRes.triggered).toBe(true);
    expect(warnRes.severity).toBe("warning");
    expect(warnRes.detail).toContain("dropped to 14.2 L/min");

    // Critical: <= 12.0
    const critFeature = makeFeature("FT-401", 10.8, { count: 10, mean: 12.0, min: 10.0, max: 14.0, stddev: 1.5 });
    const critRes = evaluateFeatureEnvelope(critFeature);
    expect(critRes.triggered).toBe(true);
    expect(critRes.severity).toBe("critical");
    expect(critRes.detail).toContain("critical limit: 12 L/min");
  });

  it("triggers critical threshold on return temperature TT-402 (DET-4)", () => {
    const hotFeature = makeFeature("TT-402", 68.5, { count: 10, mean: 60.0, min: 55.0, max: 68.5, stddev: 4.0 });
    const res = evaluateFeatureEnvelope(hotFeature);
    expect(res.triggered).toBe(true);
    expect(res.severity).toBe("critical");
    expect(res.detail).toContain("rose to 68.5 °C");
  });

  it("triggers critical threshold on vibration spike VT-102 (DET-4)", () => {
    const vibFeature = makeFeature("VT-102", 4.8, { count: 5, mean: 2.0, min: 0.8, max: 4.8, stddev: 1.5 });
    const res = evaluateFeatureEnvelope(vibFeature);
    expect(res.triggered).toBe(true);
    expect(res.severity).toBe("critical");
    expect(res.detail).toContain("rose to 4.8 mm/s");
  });

  it("triggers statistical anomaly when z-score exceeds 3.0 sigma (DET-1)", () => {
    // Value = 18.0, window mean = 10.0, stddev = 2.0 -> zScore = (18 - 10)/2 = 4.0 sigma
    const anomFeature = makeFeature("UNKNOWN-SENSOR", 18.0, { count: 8, mean: 10.0, min: 8.0, max: 12.0, stddev: 2.0 });
    const res = evaluateFeatureEnvelope(anomFeature);
    expect(res.triggered).toBe(true);
    expect(res.ruleType).toBe("anomaly");
    expect(res.detail).toContain("4.0σ deviation");
  });
});
