// Causal Engine & Hypothesis Ranker (APP-08 / DU-04 / AGT-2, AGT-3).
// FMEA-style probabilistic hypothesis ranking with discriminating-check proposals.

import type {
  CausalAnalysisResult,
  DiscriminatingCheck,
  FailureModeHypothesis,
  TrustVerdict,
} from "./types.js";

export interface FailureModeDefinition {
  id: string;
  name: string;
  prior: number; // 0.0 to 1.0
  expectedCues: {
    sensor_id: string;
    direction: "high" | "low" | "nominal";
    weight: number;
  }[];
  falsifier: string;
}

export interface CausalAnalysisInput {
  asset_id: string;
  contributing_signals: {
    sensor_id: string;
    value: number;
    nominal_mean: number;
  }[];
  trust_verdict?: TrustVerdict;
}

export class CausalEngine {
  // Pre-configured FMEA knowledge graph for standard industrial assets
  private readonly failureModes: Map<string, FailureModeDefinition[]> = new Map([
    [
      "as-wc4-coolant",
      [
        {
          id: "FM-COOL-01",
          name: "Coolant line strainer / filter clogging",
          prior: 0.45,
          expectedCues: [
            { sensor_id: "FT-401", direction: "low", weight: 3.0 },
            { sensor_id: "TT-402", direction: "high", weight: 2.5 },
            { sensor_id: "IT-405", direction: "high", weight: 2.0 },
          ],
          falsifier: "Strainer differential pressure < 0.2 bar with pump running",
        },
        {
          id: "FM-COOL-02",
          name: "Pump impeller cavitation or mechanical wear",
          prior: 0.25,
          expectedCues: [
            { sensor_id: "FT-401", direction: "low", weight: 2.5 },
            { sensor_id: "IT-405", direction: "low", weight: 2.5 },
            { sensor_id: "VT-102", direction: "high", weight: 2.0 },
          ],
          falsifier: "Discharge head pressure within manufacturer specification at rated RPM",
        },
        {
          id: "FM-COOL-03",
          name: "Flow transmitter transducer calibration drift",
          prior: 0.15,
          expectedCues: [
            { sensor_id: "FT-401", direction: "low", weight: 2.0 },
            { sensor_id: "TT-402", direction: "nominal", weight: 2.0 },
            { sensor_id: "IT-405", direction: "nominal", weight: 2.0 },
          ],
          falsifier: "In-line secondary flow meter agrees with FT-401 within ±1.5%",
        },
        {
          id: "FM-COOL-04",
          name: "Plate heat exchanger fouling / calcification",
          prior: 0.15,
          expectedCues: [
            { sensor_id: "TT-402", direction: "high", weight: 3.0 },
            { sensor_id: "FT-401", direction: "nominal", weight: 2.0 },
          ],
          falsifier: "Heat transfer coefficient U > 1200 W/(m²·K)",
        },
      ],
    ],
  ]);

  private readonly candidateChecks: Map<string, DiscriminatingCheck[]> = new Map([
    [
      "as-wc4-coolant",
      [
        {
          name: "Inspect differential pressure gauge on strainer basket",
          estimated_time_minutes: 3,
          cost_rating: "low",
          discriminates: ["FM-COOL-01", "FM-COOL-02"],
          procedure_ref: "SOP-WC4-CL-03",
        },
        {
          name: "Check portable ultrasonic flow meter clamp-on reading",
          estimated_time_minutes: 10,
          cost_rating: "medium",
          discriminates: ["FM-COOL-01", "FM-COOL-03"],
          procedure_ref: "SOP-WC4-CAL-01",
        },
        {
          name: "Thermal camera scan of plate heat exchanger",
          estimated_time_minutes: 8,
          cost_rating: "medium",
          discriminates: ["FM-COOL-01", "FM-COOL-04"],
          procedure_ref: "SOP-WC4-HX-02",
        },
      ],
    ],
  ]);

  /**
   * Performs Bayesian likelihood inference across FMEA failure modes (AGT-2).
   */
  public analyze(input: CausalAnalysisInput): CausalAnalysisResult {
    const modes = this.failureModes.get(input.asset_id) ?? [];
    if (modes.length === 0) {
      return {
        asset_id: input.asset_id,
        hypotheses: [],
        model_version: "fmea-v1.0.0",
        analyzed_at: new Date().toISOString(),
      };
    }

    // Bayesian scoring
    const unnormalizedLikelihoods: {
      mode: FailureModeDefinition;
      score: number;
      evidenceFor: string[];
      evidenceAgainst: string[];
    }[] = [];

    for (const mode of modes) {
      let likelihood = mode.prior;
      const evidenceFor: string[] = [];
      const evidenceAgainst: string[] = [];

      // If Telemetry Trust verdict is sensor_fault, strongly prioritize sensor calibration drift
      if (input.trust_verdict === "sensor_fault") {
        if (mode.id === "FM-COOL-03") {
          likelihood *= 8.0;
          evidenceFor.push("Telemetry Trust layer confirmed sensor data fault");
        } else {
          likelihood *= 0.15;
          evidenceAgainst.push("Telemetry Trust layer indicates sensor reading is untrustworthy, weakening machine hypothesis");
        }
      } else if (input.trust_verdict === "machine_fault") {
        if (mode.id === "FM-COOL-03") {
          likelihood *= 0.2;
          evidenceAgainst.push("Telemetry Trust layer verified physical consistency, ruling out sensor fault");
        }
      }

      // Check evidence from contributing signals
      for (const cue of mode.expectedCues) {
        const signal = input.contributing_signals.find((s) => s.sensor_id === cue.sensor_id);
        if (!signal) continue;

        const diff = signal.value - signal.nominal_mean;
        const observedDirection = Math.abs(diff) < 0.2 ? "nominal" : diff > 0 ? "high" : "low";

        if (observedDirection === cue.direction) {
          likelihood *= cue.weight;
          evidenceFor.push(
            `Observed ${signal.sensor_id} is ${observedDirection} (${signal.value}), matching ${mode.name}`
          );
        } else {
          likelihood *= 0.5;
          evidenceAgainst.push(
            `Expected ${signal.sensor_id} to be ${cue.direction}, but observed ${observedDirection} (${signal.value})`
          );
        }
      }

      unnormalizedLikelihoods.push({
        mode,
        score: likelihood,
        evidenceFor,
        evidenceAgainst,
      });
    }

    // Normalize to proper probability distribution sum(P) = 1.0
    const totalScore = unnormalizedLikelihoods.reduce((acc, item) => acc + item.score, 0) || 1;
    const hypotheses: FailureModeHypothesis[] = unnormalizedLikelihoods.map((item) => ({
      id: item.mode.id,
      failure_mode: item.mode.name,
      probability: Number((item.score / totalScore).toFixed(3)),
      rank: 1,
      evidence_for: item.evidenceFor,
      evidence_against: item.evidenceAgainst,
      falsifiers: [item.mode.falsifier],
    }));

    // Sort descending by probability
    hypotheses.sort((a, b) => b.probability - a.probability);
    hypotheses.forEach((h, idx) => {
      h.rank = idx + 1;
    });

    // Propose discriminating check between top 2 hypotheses (AGT-3)
    let suggestedCheck: DiscriminatingCheck | undefined;
    if (hypotheses.length >= 2 && hypotheses[0] && hypotheses[1]) {
      const top1 = hypotheses[0].id;
      const top2 = hypotheses[1].id;

      const checks = this.candidateChecks.get(input.asset_id) ?? [];
      const match = checks.find(
        (c) =>
          (c.discriminates[0] === top1 && c.discriminates[1] === top2) ||
          (c.discriminates[0] === top2 && c.discriminates[1] === top1)
      );

      suggestedCheck = match ?? checks[0];
    }

    return {
      asset_id: input.asset_id,
      hypotheses,
      suggested_check: suggestedCheck,
      model_version: "fmea-v1.0.0",
      analyzed_at: new Date().toISOString(),
    };
  }
}
