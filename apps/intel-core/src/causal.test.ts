import { describe, it, expect } from "vitest";
import { CausalEngine } from "./causal.js";

describe("Causal Engine & Hypothesis Ranker (APP-08 / AGT-2, AGT-3)", () => {
  const engine = new CausalEngine();

  it("ranks failure mode hypotheses probabilistically based on telemetry cues (AGT-2)", () => {
    // Physical cues: low flow, high return temperature, high pump current
    const result = engine.analyze({
      asset_id: "as-wc4-coolant",
      contributing_signals: [
        { sensor_id: "FT-401", value: 16.5, nominal_mean: 24.0 }, // Low
        { sensor_id: "TT-402", value: 34.0, nominal_mean: 28.0 }, // High
        { sensor_id: "IT-405", value: 9.8, nominal_mean: 8.5 },   // High
      ],
      trust_verdict: "machine_fault",
    });

    expect(result.hypotheses.length).toBeGreaterThanOrEqual(3);
    const topHypothesis = result.hypotheses[0]!;

    // FM-COOL-01: Strainer/filter clogging perfectly matches low flow + high temp + high current
    expect(topHypothesis.id).toBe("FM-COOL-01");
    expect(topHypothesis.probability).toBeGreaterThan(0.5);
    expect(topHypothesis.evidence_for.length).toBeGreaterThan(0);
    expect(topHypothesis.falsifiers.length).toBeGreaterThan(0);

    // Sum of probabilities is 1.0 (within precision)
    const sumProb = result.hypotheses.reduce((acc, h) => acc + h.probability, 0);
    expect(sumProb).toBeCloseTo(1.0, 1);
  });

  it("switches top hypothesis to sensor fault when Telemetry Trust reports sensor_fault", () => {
    const result = engine.analyze({
      asset_id: "as-wc4-coolant",
      contributing_signals: [
        { sensor_id: "FT-401", value: 12.0, nominal_mean: 24.0 },
        { sensor_id: "TT-402", value: 28.1, nominal_mean: 28.0 }, // nominal
        { sensor_id: "IT-405", value: 8.4, nominal_mean: 8.5 },   // nominal
      ],
      trust_verdict: "sensor_fault",
    });

    const topHypothesis = result.hypotheses[0]!;
    // FM-COOL-03: Flow transmitter transducer calibration drift
    expect(topHypothesis.id).toBe("FM-COOL-03");
    expect(topHypothesis.probability).toBeGreaterThan(0.6);
  });

  it("proposes discriminating check to separate top 2 hypotheses (AGT-3)", () => {
    const result = engine.analyze({
      asset_id: "as-wc4-coolant",
      contributing_signals: [
        { sensor_id: "FT-401", value: 18.0, nominal_mean: 24.0 },
        { sensor_id: "TT-402", value: 30.0, nominal_mean: 28.0 },
      ],
    });

    expect(result.suggested_check).toBeDefined();
    expect(result.suggested_check!.name).toContain("strainer");
    expect(result.suggested_check!.estimated_time_minutes).toBeLessThanOrEqual(15);
    expect(result.suggested_check!.cost_rating).toBe("low");
  });
});
