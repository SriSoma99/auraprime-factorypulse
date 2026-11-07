// Types for the Telemetry Simulator (SIM-1, SIM-2).
export type QualityFlag = "good" | "bad" | "uncertain";

export interface TelemetryPoint {
  sensor_id: string;
  ts: string;
  value: number;
  quality_flag: QualityFlag;
}

export interface GroundTruthAnnotation {
  is_anomaly: boolean;
  anomaly_type?: "threshold_high" | "threshold_low" | "drift" | "flatline" | "noise_spike";
  expected_severity?: "info" | "warning" | "critical";
  description?: string;
}

export interface SimulatedSignal {
  tenant: string;
  site: string;
  line: string;
  station: string;
  asset: string;
  sensor_id: string;
}

export interface SimulatedMessage {
  topic: string;
  payload: TelemetryPoint;
  groundTruth: GroundTruthAnnotation;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  defaultTickIntervalMs: number;
  totalTicks: number;
  generateTick: (tick: number, now: Date) => SimulatedMessage[];
}
