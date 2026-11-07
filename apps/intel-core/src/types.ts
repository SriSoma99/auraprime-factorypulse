// Types for Intelligence & Differentiating Analytics (WP-5 / APP-04, APP-05, APP-06, APP-08).

export interface WindowStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  stddev: number;
}

export interface TelemetryFeatureEnvelope {
  tenant_id: string;
  site_id: string;
  line_id: string;
  station_id: string;
  asset_id: string;
  sensor_id: string;
  ts: string;
  value: number;
  quality_flag: "good" | "bad" | "uncertain";
  traceparent: string;
  window: WindowStats;
}

export type AlertSeverity = "warning" | "critical";

export interface DetectionResult {
  triggered: boolean;
  severity?: AlertSeverity;
  ruleType?: "threshold" | "anomaly" | "drift";
  detail?: string;
  leadTimeHours?: number;
}

export interface LimitSpec {
  sensor_id: string;
  signal_name: string;
  low_warning?: number;
  low_critical?: number;
  high_warning?: number;
  high_critical?: number;
  default_impact: string;
  unit: string;
}

export interface AlertEnvelope {
  id: string;
  tenant_id: string;
  sensor_id: string;
  line_id: string;
  signal_name: string;
  detail: string;
  severity: AlertSeverity;
  rank: number;
  impact: string;
  lead_time: { hours: number; confidence: number };
  status: "open";
  traceparent: string;
  arrived_at: string;
  is_synthetic: boolean;
}

// ---------------------------------------------------------------------------
// Telemetry Trust Types (APP-05 / TRU-1..4)
// ---------------------------------------------------------------------------

export type TrustLevel = "confirmed_good" | "undetermined" | "untrustworthy";
export type TrustVerdict = "sensor_fault" | "machine_fault" | "undetermined" | "nominal";

export interface TrustCheckDetail {
  name: string;
  score: number; // 0.0 to 1.0
  passed: boolean;
  message: string;
  weight: number;
}

export interface TrustAssessment {
  sensor_id: string;
  tenant_id: string;
  score: number; // 0.0 to 1.0
  level: TrustLevel;
  verdict: TrustVerdict;
  verdict_text: string;
  checks: Record<string, TrustCheckDetail>;
  series: { ts: string; value: number }[];
  history: { ts: string; verdict: TrustVerdict; score: number }[];
  sensor_work_order_id?: string;
}

// ---------------------------------------------------------------------------
// Line Impact Types (APP-06 / LIM-1..5)
// ---------------------------------------------------------------------------

export interface StationNode {
  id: string;
  name: string;
  lineId: string;
  cycleTimeSeconds: number; // Takt time
  bufferCapacityUnits: number; // Buffer to next station
  isBottleneck?: boolean;
}

export interface LineImpactAssessment {
  line_id: string;
  tenant_id: string;
  station_id: string;
  starvation_time_minutes: number;
  bottleneck_station_id: string;
  lost_units_estimate: number;
  throughput_at_risk_pct: number;
  cascade_path: string[];
  confidence: number;
  rank: number;
}

// ---------------------------------------------------------------------------
// Multivariate Drift Types (APP-04 / DET-2, DET-3)
// ---------------------------------------------------------------------------

export interface SignalReading {
  sensor_id: string;
  value: number;
  mean: number;
  stddev: number;
}

export interface MultivariateDriftResult {
  asset_id: string;
  is_drifting: boolean;
  drift_score: number; // Mahalanobis / Covariance drift distance
  threshold: number;
  lead_time_minutes: number;
  contributing_signals: {
    sensor_id: string;
    contribution_pct: number;
    current_zscore: number;
  }[];
  divergence_message: string;
}

// ---------------------------------------------------------------------------
// Causal Engine / Hypotheses (APP-08 / AGT-2, AGT-3)
// ---------------------------------------------------------------------------

export interface DiscriminatingCheck {
  name: string;
  estimated_time_minutes: number;
  cost_rating: "low" | "medium" | "high";
  discriminates: [string, string]; // [Hypothesis A, Hypothesis B]
  procedure_ref?: string;
}

export interface FailureModeHypothesis {
  id: string;
  failure_mode: string;
  probability: number; // 0.0 to 1.0
  rank: number;
  evidence_for: string[];
  evidence_against: string[];
  falsifiers: string[];
}

export interface CausalAnalysisResult {
  asset_id: string;
  hypotheses: FailureModeHypothesis[];
  suggested_check?: DiscriminatingCheck;
  model_version: string;
  analyzed_at: string;
}
