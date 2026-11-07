// Unit tests for the sensor registry check (ING-7).
import { describe, it, expect } from "vitest";
import { placeEnvelope, PgSensorRegistry, type SensorPlacement, type SensorRegistry } from "./registry.js";
import type { ValidatedTelemetryEnvelope } from "./types.js";

const now = new Date("2026-11-05T12:00:00Z");
const registered: Record<string, Record<string, SensorPlacement>> = {
  "t-demo": { "S-05-SPD": { siteId: "SITE-DEMO", lineId: "LINE-01", stationId: "ST-05", assetId: "M-05" } },
};
const registry: SensorRegistry = { lookup: async (t, s) => registered[t]?.[s] ?? null };
const env = (over: Partial<ValidatedTelemetryEnvelope> = {}): ValidatedTelemetryEnvelope => ({
  message_id: "m1", tenant_id: "t-demo", site_id: "SITE-DEMO", line_id: "LINE-01", station_id: "ST-05", asset_id: "M-05", sensor_id: "S-05-SPD",
  ts: now.toISOString(), ingest_ts: now.toISOString(), value: 4.2, quality_flag: "good", traceparent: "00-0-0-01", is_synthetic: true, ...over,
});

describe("placeEnvelope", () => {
  it("forwards a reading for a registered sensor at its registered place", async () => {
    expect(await placeEnvelope(env(), registry, { topic: "t", now, trustStation: true })).toEqual({ envelope: env() });
  });

  it("dead-letters a sensor the tenant never registered", async () => {
    const r = await placeEnvelope(env({ sensor_id: "S-99-SPD" }), registry, { topic: "t", now, trustStation: true });
    expect(r).toMatchObject({ dlq: { reason: "unknown_sensor", tenant_id: "t-demo", topic: "t" } });
  });

  it("dead-letters another tenant's sensor even with the right IDs (invariant 4)", async () => {
    const r = await placeEnvelope(env({ tenant_id: "t-acme" }), registry, { topic: "t", now, trustStation: true });
    expect(r).toMatchObject({ dlq: { reason: "unknown_sensor", tenant_id: "t-acme" } });
  });

  it("dead-letters a registered sensor reported on the wrong machine, line or site", async () => {
    for (const over of [{ asset_id: "M-04" }, { line_id: "LINE-02" }, { site_id: "site-a" }]) {
      const r = await placeEnvelope(env(over), registry, { topic: "t", now, trustStation: true });
      expect("dlq" in r && r.dlq.error_detail, JSON.stringify(over)).toContain("registered at");
    }
  });

  it("checks the station only when the sender named it, and otherwise takes it from the registry", async () => {
    expect("dlq" in (await placeEnvelope(env({ station_id: "ST-04" }), registry, { topic: "t", now, trustStation: true }))).toBe(true);
    expect(await placeEnvelope(env({ station_id: "ST-04" }), registry, { topic: "t", now, trustStation: false })).toEqual({ envelope: env() });
  });
});

describe("PgSensorRegistry caching", () => {
  function fakePool(loads: string[][]) {
    let n = 0;
    const client = {
      query: async (sql: string) => {
        if (!sql.startsWith("SELECT se.id")) return { rows: [] };
        const ids = loads[Math.min(n++, loads.length - 1)]!;
        return { rows: ids.map((id) => ({ sensor_id: id, site_id: "s", line_id: "l", station_id: "st", asset_id: "a" })) };
      },
      release: () => {},
    };
    return { pool: { connect: async () => client } as never, loads: () => n };
  }

  it("reloads a tenant's sensors only after the refresh interval", async () => {
    let t = 0;
    const f = fakePool([["S-1"], ["S-1", "S-2"]]);
    const reg = new PgSensorRegistry(f.pool, 60, () => t);
    expect(await reg.lookup("t-demo", "S-2")).toBeNull();
    t = 59_000;
    expect(await reg.lookup("t-demo", "S-2")).toBeNull();
    expect(f.loads()).toBe(1);
    t = 61_000;
    expect(await reg.lookup("t-demo", "S-2")).toMatchObject({ assetId: "a" });
    expect(f.loads()).toBe(2);
  });
});
