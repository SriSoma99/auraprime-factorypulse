// Consistency tests for the plant topology template and the registry rows built from it (ING-7, RAG-11).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { cncMachiningLineTopology as topology } from "./cncLineTopology.ts";
import { fromTopology } from "./fromTopology.ts";
import { generate } from "../generate.ts";

const line = topology.lines[0]!;
const machines = line.stations.flatMap((s) => s.machines);
const sensorIds = new Set(machines.flatMap((m) => m.sensors.map((s) => s.sensor_id)));

describe("CNC line topology template", () => {
  it("has 10 stations in position order with links between existing stations", () => {
    expect(line.stations.map((s) => s.station_id)).toEqual(Array.from({ length: 10 }, (_, k) => `ST-${String(k + 1).padStart(2, "0")}`));
    expect(line.stations.map((s) => s.position)).toEqual(Array.from({ length: 10 }, (_, k) => k + 1));
    const ids = new Set(line.stations.map((s) => s.station_id));
    for (const l of line.links) {
      expect(ids.has(l.from), `link from ${l.from}`).toBe(true);
      expect(ids.has(l.to), `link to ${l.to}`).toBe(true);
    }
    expect(line.stations.filter((s) => s.is_bottleneck).map((s) => s.station_id)).toEqual(["ST-04"]);
  });

  it("gives every sensor a unique ID and a normal range inside its instrument range", () => {
    const all = machines.flatMap((m) => m.sensors);
    expect(all).toHaveLength(30);
    expect(sensorIds.size).toBe(30);
    for (const s of all) {
      expect(s.normal_range.min, s.sensor_id).toBeLessThan(s.normal_range.max);
      expect(s.normal_range.min, s.sensor_id).toBeGreaterThanOrEqual(s.instrument_range.min);
      expect(s.normal_range.max, s.sensor_id).toBeLessThanOrEqual(s.instrument_range.max);
      expect(s.sampling.max_silence_s, s.sensor_id).toBeGreaterThan(0);
      for (const ref of s.related_sensor_refs ?? []) expect(sensorIds.has(ref), `${s.sensor_id} -> ${ref}`).toBe(true);
    }
  });

  it("drives each machine's state from one of its own sensors", () => {
    for (const m of machines) {
      const rule = m.operating_profile.mode_rules;
      expect(m.sensors.map((s) => s.sensor_id), m.machine_id).toContain(rule.signal_ref);
      expect(rule.stopped_below, m.machine_id).toBeLessThanOrEqual(rule.run_at_or_above);
    }
  });

  it("keeps the JSON copy identical to the TypeScript copy", () => {
    const json = JSON.parse(readFileSync(new URL("./cncLineTopology.json", import.meta.url), "utf8"));
    expect(json).toEqual(JSON.parse(JSON.stringify(topology)));
  });
});

describe("registry rows from the template", () => {
  const rows = fromTopology(topology, "t-demo", "2026-11-05T00:00:00Z");

  it("maps site, line, 10 stations, 9 links, 10 machines and 30 sensors for one tenant", () => {
    expect([rows.sites.length, rows.lines.length, rows.stations.length, rows.stationLinks.length, rows.assets.length, rows.sensors.length]).toEqual([1, 1, 10, 9, 10, 30]);
    const all = [...rows.sites, ...rows.lines, ...rows.stations, ...rows.stationLinks, ...rows.assets, ...rows.sensors];
    expect(all.every((r) => r.tenantId === "t-demo")).toBe(true);
  });

  it("copies the limits and state rule of each machine", () => {
    const spd = rows.sensors.find((s) => s.id === "S-05-SPD")!;
    expect(spd).toMatchObject({ assetId: "M-05", unit: "rpm", measurand: "speed", normalRange: { min: 5500, max: 6500 }, instrumentRange: { min: 0, max: 12000 }, maxSilenceS: 10 });
    expect(rows.assets.find((a) => a.id === "M-05")!.stateRule).toEqual({ sensorId: "S-05-SPD", runAtOrAbove: 1000, stoppedBelow: 100 });
  });
});

describe("generated registry", () => {
  const d = generate({ seed: 7, referenceTime: "2026-10-04T08:50:00Z" });

  it("configures limits on every sensor, so health can be judged for all of them", () => {
    for (const s of d.sensors) {
      expect(s.normalRange.min, s.id).toBeLessThan(s.normalRange.max);
      expect(s.normalRange.min, s.id).toBeGreaterThanOrEqual(s.instrumentRange.min);
      expect(s.normalRange.max, s.id).toBeLessThanOrEqual(s.instrumentRange.max);
      expect(s.maxSilenceS, s.id).toBeGreaterThan(0);
    }
  });

  it("links every sensor to an asset, every asset to a station and every station to a line of the same tenant", () => {
    const asset = new Map(d.assets.map((a) => [a.id, a])), station = new Map(d.stations.map((s) => [s.id, s])), lineById = new Map(d.lines.map((l) => [l.id, l]));
    for (const s of d.sensors) expect(asset.get(s.assetId)?.tenantId, s.id).toBe(s.tenantId);
    for (const a of d.assets) expect(station.get(a.stationId)?.tenantId, a.id).toBe(a.tenantId);
    for (const s of d.stations) expect(lineById.get(s.lineId)?.tenantId, s.id).toBe(s.tenantId);
    expect(new Set(d.sensors.map((s) => s.id)).size).toBe(d.sensors.length);
  });

  it("keeps the hero body line first for the demo tenant", () => {
    const names = d.lines.filter((l) => l.tenantId === "t-demo").map((l) => l.name).sort();
    expect(names[0]).toBe("Body line 1");
  });
});
