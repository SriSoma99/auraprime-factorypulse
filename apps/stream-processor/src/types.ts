// Types for Stream Processor (APP-03 / DU-03).

export interface RawTelemetryEnvelope {
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
  received_at: string;
}

export interface WindowStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  stddev: number;
}

export interface TelemetryFeatureEnvelope extends RawTelemetryEnvelope {
  window: WindowStats;
}
