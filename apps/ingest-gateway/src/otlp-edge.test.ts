// Edge cases, fixture replay and tenant isolation for the OTLP decoder and gateway path (APP-02, ING-4, ING-9, invariant 4).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { config } from "@fp/db";
import { decodeOtlpMetrics } from "./otlp.js";
import { IngestGateway } from "./gateway.js";

const T0 = new Date("2026-11-05T12:00:00.000Z");
const nano = (d: Date) => `${BigInt(d.getTime()) * 1_000_000n}`;

function payload(points: Array<Record<string, unknown>>, resourceAttrs: Record<string, string> = {}, kind: "gauge" | "sum" = "gauge") {
  const attrs = { "factory.site.id": "SITE-DEMO", "factory.line.id": "LINE-01", "factory.machine.id": "M-03", ...resourceAttrs };
  return {
    resourceMetrics: [{
      resource: { attributes: Object.entries(attrs).map(([key, v]) => ({ key, value: { stringValue: v } })) },
      scopeMetrics: [{ metrics: [{ name: "machine.spindle.speed", [kind]: { dataPoints: points } }] }],
    }],
  };
}
const point = (value: Record<string, unknown>, at: Date = T0, sensor = "S-03-SPD") =>
  ({ timeUnixNano: nano(at), ...value, attributes: [{ key: "factory.sensor.id", value: { stringValue: sensor } }] });

describe("OTLP decoder edge cases", () => {
  it("sends a point with no value to the dead-letter queue and keeps the valid points", () => {
    const r = decodeOtlpMetrics(payload([point({ asDouble: 5900 }), point({}), point({ asInt: "6001" })]), { tenantId: "t-demo", now: T0 });
    expect(r.envelopes.map((e) => e.value)).toEqual([5900, 6001]);
    expect(r.dlqErrors).toHaveLength(1);
    expect(r.dlqErrors[0]!.error_detail).toContain("S-03-SPD");
    expect(r.success).toBe(false);
    expect(r.summary).toMatchObject({ totalDataPoints: 3, validCount: 2, errorCount: 1 });
  });

  it("rejects a non-numeric integer string instead of passing NaN downstream", () => {
    const r = decodeOtlpMetrics(payload([point({ asInt: "not-a-number" })]), { tenantId: "t-demo", now: T0 });
    expect(r.envelopes).toHaveLength(0);
    expect(r.dlqErrors).toHaveLength(1);
  });

  it("rejects future and too-old timestamps only when the skew check is on", () => {
    const future = point({ asDouble: 1 }, new Date(T0.getTime() + 10 * 60_000));
    const old = point({ asDouble: 2 }, new Date(T0.getTime() - 40 * 86_400_000));
    const on = decodeOtlpMetrics(payload([future, old, point({ asDouble: 3 })]), { tenantId: "t-demo", now: T0, validateSkew: true });
    expect(on.envelopes.map((e) => e.value)).toEqual([3]);
    expect(on.dlqErrors.map((d) => d.reason)).toEqual(["timestamp_skew_exceeded", "timestamp_skew_exceeded"]);
    const off = decodeOtlpMetrics(payload([future, old]), { tenantId: "t-demo", now: T0 });
    expect(off.envelopes).toHaveLength(2);
  });

  it("decodes sum metrics the same way as gauges", () => {
    const r = decodeOtlpMetrics(payload([point({ asDouble: 42 })], {}, "sum"), { tenantId: "t-demo", now: T0 });
    expect(r.envelopes[0]).toMatchObject({ value: 42, sensor_id: "S-03-SPD", station_id: "ST-03", asset_id: "M-03" });
  });

  it("derives a sensor ID from machine and metric when the point has none", () => {
    const r = decodeOtlpMetrics(payload([{ timeUnixNano: nano(T0), asDouble: 1 }]), { tenantId: "t-demo", now: T0 });
    expect(r.envelopes[0]!.sensor_id).toBe("M-03-machine.spindle.speed");
  });

  it("gives every envelope its own message ID and a W3C traceparent", () => {
    const r = decodeOtlpMetrics(payload([point({ asDouble: 1 }), point({ asDouble: 2 })]), { tenantId: "t-demo", now: T0 });
    expect(new Set(r.envelopes.map((e) => e.message_id)).size).toBe(2);
    for (const e of r.envelopes) expect(e.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it("decodes the simulator's sample OTLP fixture without errors", () => {
    const fixture = JSON.parse(readFileSync(new URL("../../simulator/src/fixtures/sampleOtlpMetrics.json", import.meta.url), "utf8"));
    const r = decodeOtlpMetrics(fixture, { tenantId: "t-demo" });
    expect(r.dlqErrors).toEqual([]);
    expect(r.envelopes).toHaveLength(30);
    expect(new Set(r.envelopes.map((e) => e.asset_id)).size).toBe(10);
    expect(new Set(r.envelopes.map((e) => e.sensor_id)).size).toBe(30);
  });
});

describe("OTLP tenant isolation (invariant 4)", () => {
  it("never lets the payload choose a different tenant from the authenticated one", () => {
    const r = decodeOtlpMetrics(payload([point({ asDouble: 1 })], { "factory.tenant.id": "t-acme" }), { tenantId: "t-demo", now: T0 });
    expect(r.envelopes).toEqual([]);
    expect(r.dlqErrors.map((d) => [d.reason, d.tenant_id])).toEqual([["tenant_mismatch", "t-demo"]]);
  });

  it("accepts a resource that names the authenticated tenant", () => {
    const r = decodeOtlpMetrics(payload([point({ asDouble: 1 })], { "factory.tenant.id": "t-demo" }), { tenantId: "t-demo", now: T0 });
    expect(r.envelopes.map((e) => e.tenant_id)).toEqual(["t-demo"]);
  });

  it("rejects a resource without site, line or machine instead of inventing demo IDs", () => {
    for (const missing of ["factory.site.id", "factory.line.id", "factory.machine.id"]) {
      const p = payload([point({ asDouble: 1 })]);
      p.resourceMetrics[0]!.resource.attributes = p.resourceMetrics[0]!.resource.attributes.filter((a) => a.key !== missing);
      const r = decodeOtlpMetrics(p, { tenantId: "t-demo", now: T0 });
      expect(r.envelopes, missing).toEqual([]);
      expect(r.dlqErrors.map((d) => d.reason), missing).toEqual(["schema_validation_failed"]);
      expect(r.summary.totalDataPoints, missing).toBe(1);
    }
  });

  it("rejects data when no tenant is known instead of filing it under the demo tenant", () => {
    const r = decodeOtlpMetrics(payload([point({ asDouble: 1 })]), { now: T0 });
    expect(r.envelopes).toEqual([]);
    expect(r.dlqErrors.map((d) => [d.reason, d.tenant_id])).toEqual([["tenant_missing", "unknown"]]);
  });
});

describe("IngestGateway.handleOtlpMetrics", () => {
  it("counts received, forwarded and dead-lettered points", async () => {
    const gw = new IngestGateway(config()); // not started: no Kafka or database writes
    await gw.handleOtlpMetrics(payload([point({ asDouble: 1 }), point({})]), { tenantId: "t-demo", now: T0 });
    expect(gw.getStats()).toMatchObject({ receivedCount: 2, forwardedCount: 1, dlqCount: 1 });
  });

  it("counts a rejected payload as received", async () => {
    const gw = new IngestGateway(config());
    await gw.handleOtlpMetrics({ not: "otlp" }, { tenantId: "t-demo" });
    expect(gw.getStats()).toMatchObject({ receivedCount: 1, forwardedCount: 0, dlqCount: 1 });
  });
});
