import { describe, it, expect } from "vitest";
import {
  parseMqttTopic,
  generateTraceparent,
  validateAndEnrich,
} from "./validator.js";

describe("parseMqttTopic", () => {
  it("parses a valid telemetry topic adhering to doc/09 Section 3", () => {
    const res = parseMqttTopic("fp/v1/t-demo/site-1/line-1/st-4/ast-wc4/telemetry");
    expect(res).toEqual({
      prefix: "fp",
      version: "v1",
      tenantId: "t-demo",
      siteId: "site-1",
      lineId: "line-1",
      stationId: "st-4",
      assetId: "ast-wc4",
    });
  });

  it("rejects non-telemetry topics or actuation paths (Invariant 1: advisory only)", () => {
    expect(parseMqttTopic("fp/v1/t-demo/site-1/line-1/st-4/ast-wc4/commands")).toBeNull();
    expect(parseMqttTopic("fp/v1/t-demo/site-1/line-1/st-4/ast-wc4/control")).toBeNull();
    expect(parseMqttTopic("random/topic")).toBeNull();
  });
});

describe("generateTraceparent (ING-10)", () => {
  it("generates a standard W3C traceparent header", () => {
    const tp = generateTraceparent();
    expect(tp).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });
});

describe("validateAndEnrich (ING-1, ING-7, ING-9, ING-10)", () => {
  const topic = "fp/v1/t-demo/site-1/line-1/st-4/ast-wc4/telemetry";
  const now = new Date("2026-10-05T09:00:00Z");

  it("validates and enriches a well-formed telemetry payload", () => {
    const payload = JSON.stringify({
      sensor_id: "sn-flow-01",
      ts: "2026-10-05T08:59:50Z",
      value: 18.4,
      quality_flag: "good",
    });

    const res = validateAndEnrich(topic, payload, now);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.envelope.tenant_id).toBe("t-demo");
      expect(res.envelope.site_id).toBe("site-1");
      expect(res.envelope.line_id).toBe("line-1");
      expect(res.envelope.station_id).toBe("st-4");
      expect(res.envelope.asset_id).toBe("ast-wc4");
      expect(res.envelope.sensor_id).toBe("sn-flow-01");
      expect(res.envelope.value).toBe(18.4);
      expect(res.envelope.quality_flag).toBe("good");
      expect(res.envelope.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
      expect(res.envelope.ingest_ts).toBe("2026-10-05T09:00:00.000Z");
    }
  });

  it("propagates an existing traceparent if provided via MQTT 5 properties (ING-10)", () => {
    const customTrace = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const payload = JSON.stringify({
      sensor_id: "sn-flow-01",
      ts: "2026-10-05T08:59:50Z",
      value: 18.4,
    });

    const res = validateAndEnrich(topic, payload, now, { traceparent: customTrace });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.envelope.traceparent).toBe(customTrace);
    }
  });

  it("routes malformed JSON to DLQ (ING-9)", () => {
    const res = validateAndEnrich(topic, "{ invalid json ...", now);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.dlq.reason).toBe("malformed_json");
      expect(res.dlq.tenant_id).toBe("t-demo");
      expect(res.dlq.topic).toBe(topic);
    }
  });

  it("routes schema invalid payload (missing sensor_id) to DLQ (ING-9)", () => {
    const payload = JSON.stringify({
      ts: "2026-10-05T08:59:50Z",
      value: 18.4,
    });
    const res = validateAndEnrich(topic, payload, now);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.dlq.reason).toBe("schema_validation_failed");
      expect(res.dlq.error_detail).toContain("sensor_id");
    }
  });

  it("rejects timestamps too far in the future (> 5m) to DLQ (ING-7)", () => {
    const payload = JSON.stringify({
      sensor_id: "sn-flow-01",
      ts: "2026-10-05T09:10:00Z", // 10 mins in future
      value: 18.4,
    });
    const res = validateAndEnrich(topic, payload, now);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.dlq.reason).toBe("timestamp_skew_exceeded");
      expect(res.dlq.error_detail).toContain("future");
    }
  });

  it("rejects stale timestamps (> 7 days) to DLQ (ING-7)", () => {
    const payload = JSON.stringify({
      sensor_id: "sn-flow-01",
      ts: "2026-09-01T09:00:00Z", // > 1 month old
      value: 18.4,
    });
    const res = validateAndEnrich(topic, payload, now);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.dlq.reason).toBe("timestamp_skew_exceeded");
      expect(res.dlq.error_detail).toContain("stale");
    }
  });
});
