// Pure validation, topic parsing, timestamp skew checking, and traceparent enrichment for APP-02 (ADR-028).
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type {
  MqttTopicParts,
  ValidatedTelemetryEnvelope,
  DeadLetterEnvelope,
  QualityFlag,
} from "./types.js";

const payloadSchema = z.object({
  message_id: z.string().optional(),
  sensor_id: z.string().min(1, "sensor_id is required"),
  ts: z.string().datetime({ message: "ts must be an ISO 8601 datetime" }),
  value: z.number().finite({ message: "value must be a finite number" }),
  quality_flag: z.enum(["good", "uncertain", "bad", "stale"]).default("good"),
  is_synthetic: z.boolean().default(false),
});

/**
 * Parses an MQTT telemetry topic adhering to doc/09-messaging.md Section 3:
 * fp/v1/<tenant>/<site>/<line>/<station>/<asset>/telemetry
 */
export function parseMqttTopic(topic: string, prefix = "fp/v1"): MqttTopicParts | null {
  const parts = topic.split("/");
  const prefixParts = prefix.split("/");
  if (parts.length !== prefixParts.length + 6) return null;
  for (let i = 0; i < prefixParts.length; i++) {
    if (parts[i] !== prefixParts[i]) return null;
  }
  if (parts[parts.length - 1] !== "telemetry") return null;

  const [tenantId, siteId, lineId, stationId, assetId] = parts.slice(prefixParts.length, -1);
  if (!tenantId || !siteId || !lineId || !stationId || !assetId) return null;

  return {
    prefix: prefixParts[0] ?? "fp",
    version: prefixParts[1] ?? "v1",
    tenantId,
    siteId,
    lineId,
    stationId,
    assetId,
  };
}

/**
 * Generates a valid W3C traceparent header: 00-<32 hex trace-id>-<16 hex span-id>-01 (ING-10)
 */
export function generateTraceparent(): string {
  const traceId = randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  return `00-${traceId}-${spanId}-01`;
}

export interface ValidationOptions {
  maxFutureSkewMs?: number; // default: 5 minutes (ING-7)
  maxPastSkewMs?: number; // default: 7 days
  traceparent?: string;
  topicPrefix?: string;
}

export type ValidationResult =
  | { success: true; envelope: ValidatedTelemetryEnvelope }
  | { success: false; dlq: DeadLetterEnvelope };

export function validateAndEnrich(
  topic: string,
  rawPayload: Buffer | string,
  now: Date = new Date(),
  options: ValidationOptions = {}
): ValidationResult {
  const nowMs = now.getTime();
  const maxFuture = options.maxFutureSkewMs ?? 5 * 60_000;
  const maxPast = options.maxPastSkewMs ?? 7 * 24 * 60 * 60_000;
  const traceparent = options.traceparent || generateTraceparent();

  // 1. Topic structure validation
  const topicMeta = parseMqttTopic(topic, options.topicPrefix ?? "fp/v1");
  if (!topicMeta) {
    return {
      success: false,
      dlq: {
        id: `dlq-${randomBytes(8).toString("hex")}`,
        tenant_id: "unknown",
        topic,
        reason: "invalid_topic",
        payload: typeof rawPayload === "string" ? rawPayload : rawPayload.toString("utf8"),
        error_detail: `Topic "${topic}" does not match namespace schema <prefix>/<tenant>/<site>/<line>/<station>/<asset>/telemetry`,
        received_at: now.toISOString(),
      },
    };
  }

  // 2. JSON parse
  let parsedJson: unknown;
  try {
    const rawStr = typeof rawPayload === "string" ? rawPayload : rawPayload.toString("utf8");
    parsedJson = JSON.parse(rawStr);
  } catch (err) {
    return {
      success: false,
      dlq: {
        id: `dlq-${randomBytes(8).toString("hex")}`,
        tenant_id: topicMeta.tenantId,
        topic,
        reason: "malformed_json",
        payload: typeof rawPayload === "string" ? rawPayload : rawPayload.toString("utf8"),
        error_detail: `Malformed JSON payload: ${(err as Error).message}`,
        received_at: now.toISOString(),
      },
    };
  }

  // 3. Schema validation
  const parseResult = payloadSchema.safeParse(parsedJson);
  if (!parseResult.success) {
    return {
      success: false,
      dlq: {
        id: `dlq-${randomBytes(8).toString("hex")}`,
        tenant_id: topicMeta.tenantId,
        topic,
        reason: "schema_validation_failed",
        payload: parsedJson,
        error_detail: parseResult.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; "),
        received_at: now.toISOString(),
      },
    };
  }

  const data = parseResult.data;

  // 4. Timestamp skew check (ING-7)
  const sourceMs = Date.parse(data.ts);
  if (sourceMs > nowMs + maxFuture) {
    return {
      success: false,
      dlq: {
        id: `dlq-${randomBytes(8).toString("hex")}`,
        tenant_id: topicMeta.tenantId,
        topic,
        reason: "timestamp_skew_exceeded",
        payload: data,
        error_detail: `Source timestamp ${data.ts} is ${Math.round((sourceMs - nowMs) / 1000)}s into the future (limit: ${maxFuture / 1000}s)`,
        received_at: now.toISOString(),
      },
    };
  }
  if (sourceMs < nowMs - maxPast) {
    return {
      success: false,
      dlq: {
        id: `dlq-${randomBytes(8).toString("hex")}`,
        tenant_id: topicMeta.tenantId,
        topic,
        reason: "timestamp_skew_exceeded",
        payload: data,
        error_detail: `Source timestamp ${data.ts} is too stale (> ${maxPast / 86400000} days old)`,
        received_at: now.toISOString(),
      },
    };
  }

  // 5. Validated envelope output
  const messageId = data.message_id || `msg-${randomBytes(8).toString("hex")}`;
  return {
    success: true,
    envelope: {
      message_id: messageId,
      tenant_id: topicMeta.tenantId,
      site_id: topicMeta.siteId,
      line_id: topicMeta.lineId,
      station_id: topicMeta.stationId,
      asset_id: topicMeta.assetId,
      sensor_id: data.sensor_id,
      ts: data.ts,
      ingest_ts: now.toISOString(),
      value: data.value,
      quality_flag: data.quality_flag as QualityFlag,
      traceparent,
      is_synthetic: data.is_synthetic,
    },
  };
}
