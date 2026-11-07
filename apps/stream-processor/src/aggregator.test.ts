// Unit tests for WindowAggregator (APP-03).
import { describe, it, expect } from "vitest";
import { WindowAggregator } from "./aggregator.js";

describe("WindowAggregator", () => {
  it("computes accurate min, max, mean, stddev on sliding window", () => {
    const agg = new WindowAggregator(5);
    const now = new Date("2026-10-05T10:00:00Z");

    const s1 = agg.addPoint("t-demo", "FT-401", 10, now.toISOString());
    expect(s1.count).toBe(1);
    expect(s1.mean).toBe(10);
    expect(s1.min).toBe(10);
    expect(s1.max).toBe(10);
    expect(s1.stddev).toBe(0);

    const s2 = agg.addPoint("t-demo", "FT-401", 20, new Date(now.getTime() + 1000).toISOString());
    expect(s2.count).toBe(2);
    expect(s2.mean).toBe(15);
    expect(s2.min).toBe(10);
    expect(s2.max).toBe(20);
    expect(s2.stddev).toBeCloseTo(7.071, 2);

    agg.addPoint("t-demo", "FT-401", 30, new Date(now.getTime() + 2000).toISOString());
    agg.addPoint("t-demo", "FT-401", 40, new Date(now.getTime() + 3000).toISOString());
    agg.addPoint("t-demo", "FT-401", 50, new Date(now.getTime() + 4000).toISOString());

    // 6th point evicts 1st point (maxPoints = 5)
    const s6 = agg.addPoint("t-demo", "FT-401", 60, new Date(now.getTime() + 5000).toISOString());
    expect(s6.count).toBe(5);
    expect(s6.min).toBe(20);
    expect(s6.max).toBe(60);
    expect(s6.mean).toBe(40);
  });

  it("isolates windows between distinct tenants and sensors", () => {
    const agg = new WindowAggregator();
    agg.addPoint("t-demo", "FT-401", 100, new Date().toISOString());
    agg.addPoint("t-acme", "FT-401", 200, new Date().toISOString());

    expect(agg.getStats("t-demo", "FT-401")?.mean).toBe(100);
    expect(agg.getStats("t-acme", "FT-401")?.mean).toBe(200);
  });
});
