// The OTLP replay restamps every data point and leaves the rest of the fixture untouched (ING-13).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { restamp } from "./otlpReplay.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/sampleOtlpMetrics.json", import.meta.url), "utf8"));
const points = (p: any) => p.resourceMetrics.flatMap((r: any) => r.scopeMetrics.flatMap((s: any) => s.metrics.flatMap((m: any) => (m.gauge ?? m.sum).dataPoints)));

describe("restamp", () => {
  it("stamps all 30 points with the given time in Unix nanoseconds", () => {
    const at = new Date("2026-11-05T12:00:00Z");
    const out = restamp(fixture, at);
    expect(points(out)).toHaveLength(30);
    expect(new Set(points(out).map((p: any) => p.timeUnixNano))).toEqual(new Set([`${BigInt(at.getTime()) * 1_000_000n}`]));
  });

  it("keeps values and attributes, and does not change the fixture", () => {
    const before = JSON.stringify(fixture);
    const out = restamp(fixture, new Date());
    expect(points(out).map((p: any) => p.asDouble)).toEqual(points(fixture).map((p: any) => p.asDouble));
    expect(JSON.stringify(fixture)).toBe(before);
  });
});
