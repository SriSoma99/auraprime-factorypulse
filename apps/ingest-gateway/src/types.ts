// Types for APP-02 Ingest Gateway (doc/09-messaging.md, doc/05-data-architecture.md section 4.2).

export interface MqttTopicParts {
  prefix: string;
  version: string;
  tenantId: string;
  siteId: string;
  lineId: string;
  stationId: string;
  assetId: string;
}

export type QualityFlag = "good" | "uncertain" | "bad" | "stale";

export interface ValidatedTelemetryEnvelope {
  message_id: string;
  tenant_id: string;
  site_id: string;
  line_id: string;
  station_id: string;
  asset_id: string;
  sensor_id: string;
  ts: string;
  ingest_ts: string;
  value: number;
  quality_flag: QualityFlag;
  traceparent: string;
  is_synthetic: boolean;
}

export interface DeadLetterEnvelope {
  id: string;
  tenant_id: string;
  topic: string;
  reason: "malformed_json" | "invalid_topic" | "schema_validation_failed" | "timestamp_skew_exceeded" | "tenant_missing" | "tenant_mismatch" | "unknown_sensor";
  payload: unknown;
  error_detail: string;
  received_at: string;
}
