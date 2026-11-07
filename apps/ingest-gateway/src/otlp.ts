// Pure OTLP HTTP/JSON Metrics decoder for APP-02 Ingest Gateway.
// Conforms to OpenTelemetry Metrics Data Model and FactoryPulse Telemetry Envelope (doc/09-messaging.md, doc/05-data-architecture.md).
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { ValidatedTelemetryEnvelope, DeadLetterEnvelope, QualityFlag } from "./types.js";
import { generateTraceparent } from "./validator.js";

// --- OTLP JSON Schema Definition ---

export const otlpAnyValueSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    stringValue: z.string().optional(),
    boolValue: z.boolean().optional(),
    intValue: z.union([z.number(), z.string()]).optional(),
    doubleValue: z.number().optional(),
    arrayValue: z.object({ values: z.array(otlpAnyValueSchema) }).optional(),
    kvlistValue: z.object({ values: z.array(otlpKeyValueSchema) }).optional(),
  })
);

export const otlpKeyValueSchema = z.object({
  key: z.string(),
  value: otlpAnyValueSchema,
});

export const otlpDataPointSchema = z.object({
  timeUnixNano: z.string(),
  startTimeUnixNano: z.string().optional(),
  asDouble: z.number().optional(),
  asInt: z.union([z.number(), z.string()]).optional(),
  attributes: z.array(otlpKeyValueSchema).optional(),
});

export const otlpMetricSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  unit: z.string().optional(),
  gauge: z.object({ dataPoints: z.array(otlpDataPointSchema) }).optional(),
  sum: z.object({ dataPoints: z.array(otlpDataPointSchema) }).optional(),
});

export const otlpScopeMetricsSchema = z.object({
  scope: z
    .object({
      name: z.string().optional(),
      version: z.string().optional(),
    })
    .optional(),
  metrics: z.array(otlpMetricSchema),
});

export const otlpResourceMetricsSchema = z.object({
  resource: z
    .object({
      attributes: z.array(otlpKeyValueSchema).optional(),
    })
    .optional(),
  scopeMetrics: z.array(otlpScopeMetricsSchema),
});

export const otlpMetricsPayloadSchema = z.object({
  resourceMetrics: z.array(otlpResourceMetricsSchema),
});

export type OtlpAnyValue = z.infer<typeof otlpAnyValueSchema>;
export type OtlpKeyValue = z.infer<typeof otlpKeyValueSchema>;

// --- Helper Functions ---

/**
 * Extracts a primitive JS value from an OTLP AnyValue.
 */
export function extractAnyValue(val?: OtlpAnyValue): string | number | boolean | null {
  if (!val) return null;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.boolValue !== undefined) return val.boolValue;
  if (val.doubleValue !== undefined) return val.doubleValue;
  if (val.intValue !== undefined) {
    return typeof val.intValue === "string" ? parseInt(val.intValue, 10) : val.intValue;
  }
  return null;
}

/**
 * Converts a list of OTLP KeyValue attributes into a flat JS record.
 */
export function extractAttributeMap(attributes?: OtlpKeyValue[]): Record<string, string | number | boolean> {
  const map: Record<string, string | number | boolean> = {};
  if (!attributes) return map;
  for (const attr of attributes) {
    const val = extractAnyValue(attr.value);
    if (val !== null) {
      map[attr.key] = val;
    }
  }
  return map;
}

/**
 * Converts nanoseconds timestamp string into ISO 8601 string.
 */
export function nanoToIsoString(timeUnixNano: string): string {
  try {
    const nanoBig = BigInt(timeUnixNano);
    const millis = Number(nanoBig / 1000000n);
    return new Date(millis).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Default station resolver if not directly present in resource attributes.
 * Maps machines M-01 .. M-10 to ST-01 .. ST-10.
 */
export function defaultResolveStation(machineId: string): string {
  const match = machineId.match(/^M-(\d+)$/i);
  if (match) {
    return `ST-${match[1]}`;
  }
  return machineId;
}

// --- Decoder Options & Output ---

export interface OtlpDecodeOptions {
  /** Tenant of the authenticated sender (invariant 4). Payload attributes can never override it. */
  tenantId?: string;
  now?: Date;
  validateSkew?: boolean;
  maxFutureSkewMs?: number;
  maxPastSkewMs?: number;
  stationResolver?: (machineId: string, resourceAttrs: Record<string, string | number | boolean>) => string;
}

export interface OtlpDecodeResult {
  success: boolean;
  envelopes: ValidatedTelemetryEnvelope[];
  dlqErrors: DeadLetterEnvelope[];
  summary: {
    totalResources: number;
    totalMetrics: number;
    totalDataPoints: number;
    validCount: number;
    errorCount: number;
  };
}

/**
 * Decodes and validates standard OTLP JSON resourceMetrics into FactoryPulse ValidatedTelemetryEnvelope instances.
 */
export function decodeOtlpMetrics(
  rawPayload: unknown,
  options: OtlpDecodeOptions = {}
): OtlpDecodeResult {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const tenantId = options.tenantId;
  const maxFuture = options.maxFutureSkewMs ?? 5 * 60_000;
  const maxPast = options.maxPastSkewMs ?? 30 * 24 * 60 * 60_000; // 30 days past allowed for replays
  const resolveStation = options.stationResolver ?? defaultResolveStation;

  const envelopes: ValidatedTelemetryEnvelope[] = [];
  const dlqErrors: DeadLetterEnvelope[] = [];

  const rejectAll = (dlq: Omit<DeadLetterEnvelope, "id" | "received_at">): OtlpDecodeResult => ({
    success: false,
    envelopes: [],
    dlqErrors: [{ id: `dlq-${randomBytes(8).toString("hex")}`, received_at: now.toISOString(), ...dlq }],
    summary: { totalResources: 0, totalMetrics: 0, totalDataPoints: 0, validCount: 0, errorCount: 1 },
  });

  // 1. The tenant comes from the authenticated connection, never from the payload (invariant 4)
  if (!tenantId) {
    return rejectAll({
      tenant_id: "unknown",
      topic: "otlp/http/metrics",
      reason: "tenant_missing",
      payload: rawPayload,
      error_detail: "No authenticated tenant for this OTLP request",
    });
  }

  // 2. Validate top-level OTLP schema
  const parsed = otlpMetricsPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return rejectAll({
      tenant_id: tenantId,
      topic: "otlp/http/metrics",
      reason: "schema_validation_failed",
      payload: rawPayload,
      error_detail: `OTLP schema parsing failed: ${parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}`,
    });
  }

  const { resourceMetrics } = parsed.data;
  let totalMetrics = 0;
  let totalDataPoints = 0;

  for (const rm of resourceMetrics) {
    const rAttrs = extractAttributeMap(rm.resource?.attributes);

    const site = rAttrs["factory.site.id"] ?? rAttrs["site.id"] ?? rAttrs["site_id"];
    const line = rAttrs["factory.line.id"] ?? rAttrs["line.id"] ?? rAttrs["line_id"];
    const machine = rAttrs["factory.machine.id"] ?? rAttrs["machine.id"] ?? rAttrs["asset_id"];
    const claimedTenant = rAttrs["factory.tenant.id"] ?? rAttrs["tenant.id"] ?? rAttrs["tenant_id"];
    const resourcePoints = rm.scopeMetrics.reduce(
      (n, sm) => n + sm.metrics.reduce((k, m) => k + (m.gauge?.dataPoints ?? m.sum?.dataPoints ?? []).length, 0),
      0
    );

    // A resource that names another tenant, or lacks its place in the asset hierarchy, is rejected whole (ING-4, ING-7)
    const resourceError =
      claimedTenant !== undefined && String(claimedTenant) !== tenantId
        ? { reason: "tenant_mismatch" as const, detail: `Resource claims tenant "${String(claimedTenant)}" but the sender is authenticated as "${tenantId}"` }
        : site === undefined || line === undefined || machine === undefined
          ? { reason: "schema_validation_failed" as const, detail: "Resource attributes must include site, line and machine IDs" }
          : null;
    if (resourceError) {
      totalMetrics += rm.scopeMetrics.reduce((n, sm) => n + sm.metrics.length, 0);
      totalDataPoints += resourcePoints;
      dlqErrors.push({
        id: `dlq-${randomBytes(8).toString("hex")}`,
        tenant_id: tenantId,
        topic: "otlp/http/metrics",
        reason: resourceError.reason,
        payload: rm,
        error_detail: resourceError.detail,
        received_at: now.toISOString(),
      });
      continue;
    }

    const siteId = String(site);
    const lineId = String(line);
    const machineId = String(machine);
    const stationId = String(rAttrs["factory.station.id"] ?? rAttrs["station.id"] ?? resolveStation(machineId, rAttrs));
    const isSynthetic = Boolean(rAttrs["factory.data.synthetic"] ?? true);

    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        totalMetrics++;
        const dataPoints = metric.gauge?.dataPoints ?? metric.sum?.dataPoints ?? [];

        for (const dp of dataPoints) {
          totalDataPoints++;
          const dpAttrs = extractAttributeMap(dp.attributes);
          const sensorId = String(
            dpAttrs["factory.sensor.id"] ??
              dpAttrs["sensor.id"] ??
              dpAttrs["sensor_id"] ??
              `${machineId}-${metric.name}`
          );

          // Extract value (asDouble takes priority over asInt)
          let val: number | null = null;
          if (dp.asDouble !== undefined) {
            val = dp.asDouble;
          } else if (dp.asInt !== undefined) {
            val = typeof dp.asInt === "string" ? Number(dp.asInt) : dp.asInt;
          }

          if (val === null || !Number.isFinite(val)) {
            dlqErrors.push({
              id: `dlq-${randomBytes(8).toString("hex")}`,
              tenant_id: tenantId,
              topic: `otlp/${tenantId}/${siteId}/${lineId}/${stationId}/${machineId}/telemetry`,
              reason: "schema_validation_failed",
              payload: dp,
              error_detail: `Missing or non-finite metric value for ${metric.name} on ${sensorId}`,
              received_at: now.toISOString(),
            });
            continue;
          }

          const sourceIso = nanoToIsoString(dp.timeUnixNano);
          const sourceMs = Date.parse(sourceIso);

          // Timestamp skew check if enabled
          if (options.validateSkew) {
            if (sourceMs > nowMs + maxFuture) {
              dlqErrors.push({
                id: `dlq-${randomBytes(8).toString("hex")}`,
                tenant_id: tenantId,
                topic: `otlp/${tenantId}/${siteId}/${lineId}/${stationId}/${machineId}/telemetry`,
                reason: "timestamp_skew_exceeded",
                payload: dp,
                error_detail: `Source timestamp ${sourceIso} is too far in future`,
                received_at: now.toISOString(),
              });
              continue;
            }
            if (sourceMs < nowMs - maxPast) {
              dlqErrors.push({
                id: `dlq-${randomBytes(8).toString("hex")}`,
                tenant_id: tenantId,
                topic: `otlp/${tenantId}/${siteId}/${lineId}/${stationId}/${machineId}/telemetry`,
                reason: "timestamp_skew_exceeded",
                payload: dp,
                error_detail: `Source timestamp ${sourceIso} is too stale (> ${maxPast / 86400000} days old)`,
                received_at: now.toISOString(),
              });
              continue;
            }
          }

          const messageId = `msg-${randomBytes(8).toString("hex")}`;
          const traceparent = generateTraceparent();

          envelopes.push({
            message_id: messageId,
            tenant_id: tenantId,
            site_id: siteId,
            line_id: lineId,
            station_id: stationId,
            asset_id: machineId,
            sensor_id: sensorId,
            ts: sourceIso,
            ingest_ts: now.toISOString(),
            value: val,
            quality_flag: "good" as QualityFlag,
            traceparent,
            is_synthetic: isSynthetic,
          });
        }
      }
    }
  }

  return {
    success: dlqErrors.length === 0,
    envelopes,
    dlqErrors,
    summary: {
      totalResources: resourceMetrics.length,
      totalMetrics,
      totalDataPoints,
      validCount: envelopes.length,
      errorCount: dlqErrors.length,
    },
  };
}
