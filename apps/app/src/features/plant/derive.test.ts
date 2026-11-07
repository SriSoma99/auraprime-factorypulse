import { describe, expect, it } from "vitest";
import { derivePlantState, formatNumber, formatRange, formatValue, lineOptions, silenceText, statusLabel, summary, visibleLine, type PlantSensor, type PlantView } from "./derive";

const sensor = (over: Partial<PlantSensor>): PlantSensor => ({
  id: "S-01-SPD", name: "Spindle speed S-01-SPD", measurand: "speed", unit: "rpm", normalRange: { min: 5500, max: 6500 }, instrumentRange: { min: 0, max: 12000 },
  maxSilenceSeconds: 10, status: "ok", direction: null, lastValue: 5900, lastAt: "2026-11-05T12:00:00Z", silentForSeconds: 1, ...over,
});
const counts = (over: Partial<PlantView["counts"]> = {}): PlantView["counts"] => ({ ok: 0, out_of_range: 0, flatline: 0, stale: 0, no_data: 0, not_configured: 0, ...over });
const view = (sensors: PlantSensor[], c = counts()): PlantView => ({
  generatedAt: "2026-11-05T12:00:00Z", lookbackMinutes: 15, counts: c,
  sites: [{ id: "SITE-DEMO", name: "Demo Plant", lines: [{ id: "LINE-01", name: "Demo machining line", stations: [{ id: "ST-01", name: "Operation 10", position: 1, cycleTimeSeconds: 40, isBottleneck: false, bufferToNextMinutes: 4,
    machines: [{ id: "M-01", name: "Machining centre 1", equipmentType: "cnc_mill", plantTag: "MC-01", model: "Example OEM VMC-850", state: "running", stateSensorId: "S-01-SPD", sensors }] }] }] }],
});

describe("formatting", () => {
  it("rounds by magnitude", () => {
    expect([formatNumber(5896.84), formatNumber(47.04), formatNumber(2.264), formatNumber(0.0621), formatNumber(-12.345)]).toEqual(["5897", "47.04", "2.26", "0.062", "-12.35"]);
  });
  it("formats value, range and missing data", () => {
    expect(formatValue(sensor({}))).toBe("5900 rpm");
    expect(formatValue(sensor({ lastValue: null }))).toBe("—");
    expect(formatRange(sensor({}))).toBe("5500–6500 rpm");
    expect(formatRange(sensor({ normalRange: null }))).toBe("not set");
  });
  it("names the direction of an out-of-range reading", () => {
    expect(statusLabel(sensor({ status: "out_of_range", direction: "low" }))).toBe("Out of range (low)");
    expect(statusLabel(sensor({ status: "flatline" }))).toBe("Flatline");
  });
  it("explains silence only for stale sensors", () => {
    expect(silenceText(sensor({ status: "stale", silentForSeconds: 30 }))).toBe("silent 30 s (limit 10 s)");
    expect(silenceText(sensor({ status: "ok" }))).toBeNull();
  });
});

describe("derivePlantState", () => {
  it("covers loading, error, empty, no telemetry and live", () => {
    expect(derivePlantState(undefined, true, false)).toBe("loading");
    expect(derivePlantState(undefined, false, true)).toBe("error");
    expect(derivePlantState(view([]), false, false)).toBe("empty");
    expect(derivePlantState(view([], counts({ no_data: 39 })), false, false)).toBe("noTelemetry");
    expect(derivePlantState(view([], counts({ no_data: 38, ok: 1 })), false, false)).toBe("live");
  });
});

describe("summary and line options", () => {
  it("lists non-zero statuses worst first", () => {
    expect(summary(view([], counts({ ok: 20, stale: 1, out_of_range: 2 })))).toEqual([{ status: "out_of_range", count: 2 }, { status: "stale", count: 1 }, { status: "ok", count: 20 }]);
  });
  it("labels each line with its site and counts sensors needing attention", () => {
    const v = view([sensor({}), sensor({ id: "a", status: "stale" }), sensor({ id: "b", status: "no_data" }), sensor({ id: "c", status: "out_of_range" })]);
    expect(lineOptions(v)).toEqual([{ id: "LINE-01", label: "Demo Plant · Demo machining line", attention: 3 }]);
  });
});

describe("visibleLine", () => {
  const v = view([sensor({ id: "ok" }), sensor({ id: "nd", status: "no_data" }), sensor({ id: "st", status: "stale" }), sensor({ id: "oor", status: "out_of_range" })]);
  it("sorts sensors worst first and keeps every station and machine", () => {
    const l = visibleLine(v, "LINE-01", false)!;
    expect(l.stations[0]!.machines[0]!.sensors.map(s => s.id)).toEqual(["oor", "st", "nd", "ok"]);
  });
  it("shows every sensor that is not OK, including no data, when attention only is on", () => {
    const l = visibleLine(v, "LINE-01", true)!;
    expect(l.stations).toHaveLength(1);
    expect(l.stations[0]!.machines[0]!.sensors.map(s => s.id)).toEqual(["oor", "st", "nd"]);
  });
  it("returns null for an unknown line", () => {
    expect(visibleLine(v, "LINE-99", false)).toBeNull();
  });
});
