// Deterministic threshold rules (DET-4) and baseline anomaly detector (DET-1).
import type { TelemetryFeatureEnvelope, DetectionResult, LimitSpec } from "./types.js";

export const LIMIT_SPECS: Record<string, LimitSpec> = {
  "FT-401": {
    sensor_id: "FT-401",
    signal_name: "Coolant flow FT-401",
    unit: "L/min",
    low_warning: 15.0,
    low_critical: 12.0,
    default_impact: "Throughput at risk: Weld Cell 4 slows downstream stations after 22-min buffer",
  },
  "TT-402": {
    sensor_id: "TT-402",
    signal_name: "Return temperature TT-402",
    unit: "°C",
    high_warning: 55.0,
    high_critical: 65.0,
    default_impact: "Weld transformer thermal runaway hazard",
  },
  "VT-102": {
    sensor_id: "VT-102",
    signal_name: "Drive vibration VT-102",
    unit: "mm/s",
    high_warning: 2.5,
    high_critical: 4.0,
    default_impact: "Conveyor C2 drive bearing seizure risk",
  },
  "IT-405": {
    sensor_id: "IT-405",
    signal_name: "Pump current IT-405",
    unit: "A",
    high_warning: 18.0,
    high_critical: 22.0,
    default_impact: "Coolant pump overcurrent trip risk",
  },
};

export function evaluateFeatureEnvelope(feature: TelemetryFeatureEnvelope): DetectionResult {
  const spec = LIMIT_SPECS[feature.sensor_id];
  const val = feature.value;

  // 1. Check deterministic threshold limits (DET-4)
  if (spec) {
    if (spec.low_critical !== undefined && val <= spec.low_critical) {
      return {
        triggered: true,
        severity: "critical",
        ruleType: "threshold",
        detail: `${spec.signal_name} dropped to ${val} ${spec.unit} (critical limit: ${spec.low_critical} ${spec.unit})`,
        leadTimeHours: 1.5,
      };
    }
    if (spec.high_critical !== undefined && val >= spec.high_critical) {
      return {
        triggered: true,
        severity: "critical",
        ruleType: "threshold",
        detail: `${spec.signal_name} rose to ${val} ${spec.unit} (critical limit: ${spec.high_critical} ${spec.unit})`,
        leadTimeHours: 1.0,
      };
    }
    if (spec.low_warning !== undefined && val <= spec.low_warning) {
      return {
        triggered: true,
        severity: "warning",
        ruleType: "threshold",
        detail: `${spec.signal_name} dropped to ${val} ${spec.unit} (warning limit: ${spec.low_warning} ${spec.unit})`,
        leadTimeHours: 3.0,
      };
    }
    if (spec.high_warning !== undefined && val >= spec.high_warning) {
      return {
        triggered: true,
        severity: "warning",
        ruleType: "threshold",
        detail: `${spec.signal_name} rose to ${val} ${spec.unit} (warning limit: ${spec.high_warning} ${spec.unit})`,
        leadTimeHours: 2.5,
      };
    }
  }

  // 2. Baseline statistical anomaly (DET-1: > 3.0 sigma deviation with >= 5 historical points)
  if (feature.window.count >= 5 && feature.window.stddev > 0.05) {
    const zScore = Math.abs((val - feature.window.mean) / feature.window.stddev);
    if (zScore >= 3.0) {
      return {
        triggered: true,
        severity: "warning",
        ruleType: "anomaly",
        detail: `${spec?.signal_name ?? feature.sensor_id} sudden shift to ${val} (${zScore.toFixed(1)}σ deviation from window mean ${feature.window.mean})`,
        leadTimeHours: 4.0,
      };
    }
  }

  return { triggered: false };
}
