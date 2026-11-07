// Unit tests for basic sensor health and machine state (ING-12).
import { describe, it, expect } from "vitest";
import { assessSensor, machineState, settleForState, type Reading } from "./health.ts";

const now = new Date("2026-11-05T12:00:00Z");
const limits = { normalMin: 5500, normalMax: 6500, maxSilenceS: 10 };
const rules = { flatlineMinPoints: 5, flatlineTolerancePct: 0.1 };
/** Newest first, one second apart, ending `ageS` seconds before now. */
const series = (values: number[], ageS = 1): Reading[] => values.map((v, k) => ({ value: v, ts: new Date(now.getTime() - (ageS + k) * 1000) }));

describe("assessSensor", () => {
  it("reports ok inside the normal range with normal variation", () => {
    expect(assessSensor(limits, series([5900, 5905, 5897, 5910, 5902]), now, rules)).toMatchObject({ status: "ok", direction: null, lastValue: 5900, silentForS: 1 });
  });

  it("reports no data when there is no reading in the window", () => {
    expect(assessSensor(limits, [], now, rules)).toEqual({ status: "no_data", direction: null, lastValue: null, lastAt: null, silentForS: null });
  });

  it("reports stale once the sensor has been silent longer than its max silence", () => {
    expect(assessSensor(limits, series([5900], 10), now, rules).status).toBe("ok");
    expect(assessSensor(limits, series([5900], 11), now, rules)).toMatchObject({ status: "stale", silentForS: 11, lastValue: 5900 });
  });

  it("reports out of range low and high against the normal range edges", () => {
    expect(assessSensor(limits, series([5500]), now, rules).status).toBe("ok");
    expect(assessSensor(limits, series([4.2]), now, rules)).toMatchObject({ status: "out_of_range", direction: "low" });
    expect(assessSensor(limits, series([6500.1]), now, rules)).toMatchObject({ status: "out_of_range", direction: "high" });
  });

  it("reports a flatline when the last N readings do not move within tolerance", () => {
    expect(assessSensor(limits, series([6000, 6000, 6000, 6000, 6000]), now, rules).status).toBe("flatline");
    expect(assessSensor(limits, series([6000, 6000.5, 6000, 6000.9, 6000]), now, rules).status).toBe("flatline"); // spread 0.9 <= 1.0 (0.1 % of 1000)
    expect(assessSensor(limits, series([6000, 6002, 6000, 6000, 6000]), now, rules).status).toBe("ok");
  });

  it("needs the full flatline window before calling a flatline", () => {
    expect(assessSensor(limits, series([6000, 6000, 6000, 6000]), now, rules).status).toBe("ok");
  });

  it("prefers stale over out of range, and out of range over flatline", () => {
    expect(assessSensor(limits, series([4.2], 30), now, rules).status).toBe("stale");
    expect(assessSensor(limits, series([4.2, 4.2, 4.2, 4.2, 4.2]), now, rules).status).toBe("out_of_range");
  });

  it("reports not configured when the registry has no limits, without hiding the last value", () => {
    expect(assessSensor({ normalMin: null, normalMax: 10, maxSilenceS: 10 }, series([3]), now, rules)).toMatchObject({ status: "not_configured", lastValue: 3 });
    expect(assessSensor({ normalMin: 0, normalMax: 10, maxSilenceS: null }, [], now, rules).status).toBe("not_configured");
  });
});

describe("machineState", () => {
  const rule = { runAtOrAbove: 1000, stoppedBelow: 100 };
  const at = (v: number, ageS = 1) => assessSensor(limits, series([v], ageS), now, rules);

  it("is running at or above the run threshold, idle between, stopped below the stop threshold", () => {
    expect(machineState(rule, at(1000))).toBe("running");
    expect(machineState(rule, at(500))).toBe("idle");
    expect(machineState(rule, at(100))).toBe("idle");
    expect(machineState(rule, at(4.2))).toBe("stopped");
  });

  it("is unknown without a rule, a state sensor or a fresh reading", () => {
    expect(machineState(null, at(6000))).toBe("unknown");
    expect(machineState(rule, undefined)).toBe("unknown");
    expect(machineState(rule, at(6000, 60))).toBe("unknown");
    expect(machineState(rule, assessSensor(limits, [], now, rules))).toBe("unknown");
  });
});

describe("settleForState", () => {
  const flat = assessSensor(limits, series([6000, 6000, 6000, 6000, 6000]), now, rules);

  it("keeps a flatline while the machine runs or its state is unknown", () => {
    expect(settleForState(flat, "running").status).toBe("flatline");
    expect(settleForState(flat, "unknown").status).toBe("flatline");
  });

  it("does not call a steady signal a flatline on a stopped or idle machine", () => {
    expect(settleForState(flat, "stopped").status).toBe("ok");
    expect(settleForState(flat, "idle").status).toBe("ok");
  });

  it("never hides out of range, stale or no data", () => {
    for (const h of [assessSensor(limits, series([4.2]), now, rules), assessSensor(limits, series([6000], 60), now, rules), assessSensor(limits, [], now, rules)]) {
      expect(settleForState(h, "stopped")).toEqual(h);
    }
  });
});
