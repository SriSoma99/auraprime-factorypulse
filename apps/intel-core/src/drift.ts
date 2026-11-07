// Multivariate Drift Detector (APP-04 / DU-04 / DET-2, DET-3).
// Detects coordinated multi-signal drift before any single-signal threshold breaches.

import type { MultivariateDriftResult, SignalReading } from "./types.js";

export interface AssetBaseline {
  assetId: string;
  nominalSignals: Record<
    string,
    {
      name: string;
      nominalMean: number;
      nominalStddev: number;
      directionOfConcern: "high" | "low" | "both";
      tripLimitZ: number; // e.g. 3.0 sigma
    }
  >;
  // Pairwise expected physical correlation: +1 or -1
  correlations: Record<string, number>;
  driftDistanceThreshold: number; // e.g. 2.6
}

export class MultivariateDriftDetector {
  private readonly baselines: Map<string, AssetBaseline> = new Map();

  constructor() {
    // Default baseline for Weld Cell 4 Coolant Circuit (Hero Scenario)
    this.registerBaseline({
      assetId: "as-wc4-coolant",
      nominalSignals: {
        "FT-401": {
          name: "Coolant Flow",
          nominalMean: 24.0,
          nominalStddev: 0.5,
          directionOfConcern: "low",
          tripLimitZ: 3.0,
        },
        "TT-402": {
          name: "Return Temperature",
          nominalMean: 28.0,
          nominalStddev: 0.8,
          directionOfConcern: "high",
          tripLimitZ: 3.0,
        },
        "IT-405": {
          name: "Pump Current",
          nominalMean: 8.5,
          nominalStddev: 0.25,
          directionOfConcern: "high",
          tripLimitZ: 3.0,
        },
      },
      correlations: {
        "FT-401:TT-402": -0.85, // Negative: flow drop causes temp rise
        "FT-401:IT-405": -0.65, // Negative: restriction causes pump current rise
      },
      driftDistanceThreshold: 2.5,
    });
  }

  public registerBaseline(baseline: AssetBaseline): void {
    this.baselines.set(baseline.assetId, baseline);
  }

  /**
   * Analyzes multi-signal telemetry to detect coordinated multivariate drift (DET-2).
   */
  public analyzeSignals(
    assetId: string,
    readings: SignalReading[],
    historicalTrendMinutes = 15
  ): MultivariateDriftResult {
    const baseline = this.baselines.get(assetId);
    if (!baseline) {
      return {
        asset_id: assetId,
        is_drifting: false,
        drift_score: 0,
        threshold: 2.5,
        lead_time_minutes: 0,
        contributing_signals: [],
        divergence_message: "No multivariate baseline configured for asset",
      };
    }

    let sumSquaredZ = 0;
    const signalContributions: {
      sensor_id: string;
      current_zscore: number;
      squaredZ: number;
    }[] = [];

    let anySingleLimitTripped = false;

    for (const reading of readings) {
      const spec = baseline.nominalSignals[reading.sensor_id];
      if (!spec) continue;

      const zScore = (reading.value - spec.nominalMean) / spec.nominalStddev;
      if (Math.abs(zScore) >= spec.tripLimitZ) {
        anySingleLimitTripped = true;
      }

      const sq = zScore * zScore;
      sumSquaredZ += sq;
      signalContributions.push({
        sensor_id: reading.sensor_id,
        current_zscore: Number(zScore.toFixed(2)),
        squaredZ: sq,
      });
    }

    // Include cross-signal correlation penalty
    let correlationDivergence = 0;
    const ft = signalContributions.find((s) => s.sensor_id === "FT-401");
    const tt = signalContributions.find((s) => s.sensor_id === "TT-402");
    if (ft && tt) {
      // Flow dropping (z < 0) while Temp rising (z > 0) is a physical signature of restriction
      if (ft.current_zscore < -1.0 && tt.current_zscore > 1.0) {
        correlationDivergence += 1.5;
      }
    }

    const rawDistance = Math.sqrt(sumSquaredZ) + correlationDivergence;
    const driftScore = Number(rawDistance.toFixed(2));
    const isDrifting = driftScore >= baseline.driftDistanceThreshold;

    // Calculate contribution percentages
    const totalSq = signalContributions.reduce((acc, s) => acc + s.squaredZ, 0) || 1;
    const contributingSignals = signalContributions.map((s) => ({
      sensor_id: s.sensor_id,
      current_zscore: s.current_zscore,
      contribution_pct: Number(((s.squaredZ / totalSq) * 100).toFixed(1)),
    }));

    // Sort contributions descending
    contributingSignals.sort((a, b) => b.contribution_pct - a.contribution_pct);

    // Lead time estimation (DET-3):
    // If drift is progressing, estimate time before critical trip (e.g. 3.0 sigma limit)
    let leadTimeMinutes = 0;
    if (isDrifting && !anySingleLimitTripped) {
      // Linear extrapolation based on current distance vs critical boundary (e.g., 5.2)
      const criticalBoundary = 5.0;
      const remainingDistance = Math.max(0, criticalBoundary - driftScore);
      const estimatedRatePerMinute = driftScore / Math.max(5, historicalTrendMinutes);
      leadTimeMinutes = Math.round(remainingDistance / Math.max(0.02, estimatedRatePerMinute));
      leadTimeMinutes = Math.max(10, Math.min(180, leadTimeMinutes)); // Clamped to 10 - 180 min
    }

    const message = isDrifting
      ? `Multivariate drift detected across ${contributingSignals.length} correlated signals (score ${driftScore} >= threshold ${baseline.driftDistanceThreshold}). Estimated ${leadTimeMinutes} minutes lead time before single-signal alarm threshold trips.`
      : `Multivariate state nominal (score ${driftScore} < threshold ${baseline.driftDistanceThreshold}).`;

    return {
      asset_id: assetId,
      is_drifting: isDrifting,
      drift_score: driftScore,
      threshold: baseline.driftDistanceThreshold,
      lead_time_minutes: leadTimeMinutes,
      contributing_signals: contributingSignals,
      divergence_message: message,
    };
  }
}
