import { describe, it, expect } from "vitest";
import { MultivariateDriftDetector } from "./drift.js";
import type { SignalReading } from "./types.js";

describe("Multivariate Drift Detector (APP-04 / DET-2, DET-3)", () => {
  const detector = new MultivariateDriftDetector();

  it("reports nominal when signals are near baseline", () => {
    const nominalReadings: SignalReading[] = [
      { sensor_id: "FT-401", value: 24.1, mean: 24.1, stddev: 0.5 },
      { sensor_id: "TT-402", value: 28.0, mean: 28.0, stddev: 0.8 },
      { sensor_id: "IT-405", value: 8.5, mean: 8.5, stddev: 0.25 },
    ];

    const result = detector.analyzeSignals("as-wc4-coolant", nominalReadings);
    expect(result.is_drifting).toBe(false);
    expect(result.drift_score).toBeLessThan(result.threshold);
  });

  it("detects coordinated drift before any single-sensor threshold trips (DET-2)", () => {
    // Each signal is under 2.5 sigma (< 3.0 sigma trip limit), so NO single-signal alarm fires
    // FT-401: nominal 24.0, value 23.0 -> z = -2.0 (< 3.0 limit)
    // TT-402: nominal 28.0, value 29.5 -> z = +1.875 (< 3.0 limit)
    // IT-405: nominal 8.5, value 8.9 -> z = +1.6 (< 3.0 limit)
    const driftingReadings: SignalReading[] = [
      { sensor_id: "FT-401", value: 23.0, mean: 23.0, stddev: 0.5 },
      { sensor_id: "TT-402", value: 29.5, mean: 29.5, stddev: 0.8 },
      { sensor_id: "IT-405", value: 8.9, mean: 8.9, stddev: 0.25 },
    ];

    const result = detector.analyzeSignals("as-wc4-coolant", driftingReadings);
    expect(result.is_drifting).toBe(true);
    expect(result.drift_score).toBeGreaterThanOrEqual(result.threshold);

    // Verifies lead time estimate (DET-3)
    expect(result.lead_time_minutes).toBeGreaterThan(0);
    expect(result.lead_time_minutes).toBeLessThanOrEqual(120);

    // Verifies signal attribution
    expect(result.contributing_signals.length).toBe(3);
    expect(result.contributing_signals[0]!.contribution_pct).toBeGreaterThan(0);
    expect(result.divergence_message).toContain("Multivariate drift detected");
  });
});
