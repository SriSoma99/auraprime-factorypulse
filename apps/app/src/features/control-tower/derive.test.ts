import { describe, expect, it } from "vitest";
import { deriveBudgetPercent, deriveControlTowerState } from "./derive";
import type { ControlTowerData } from "./types";

const mockData: ControlTowerData = {
  level: "L0",
  fallbackHistory: [{ level: "L0", timestamp: "2026-10-05T12:00:00Z", reason: "All systems healthy" }],
  pipelineLagMs: 24,
  ingestRatePerSec: 520,
  budgetBurnUsd: 14.5,
  budgetCapUsd: 50.0,
  ragCitationCoveragePct: 100,
  ragLatencyP95Ms: 140,
  mcpCallsCount: 1420,
  mcpDenialsCount: 3,
  mcpActuationBlocksCount: 14,
  recentTraces: [{ traceId: "tr-001", scenario: "Slow drift Weld Cell 4", latencyMs: 320, status: "ok", timestamp: "2026-10-05T12:05:00Z" }],
};

describe("deriveControlTowerState", () => {
  it("returns loading when loading is true", () => {
    expect(deriveControlTowerState(null, true, false)).toBe("loading");
  });

  it("returns error on error or null data", () => {
    expect(deriveControlTowerState(null, false, true)).toBe("error");
    expect(deriveControlTowerState(null, false, false)).toBe("error");
  });

  it("returns normal when L0 and budget under 80%", () => {
    expect(deriveControlTowerState(mockData, false, false)).toBe("normal");
  });

  it("returns degraded when fallback level is not L0", () => {
    expect(deriveControlTowerState({ ...mockData, level: "L2" }, false, false)).toBe("degraded");
  });

  it("returns budgetWarning when spend reaches 80% of cap", () => {
    expect(deriveControlTowerState({ ...mockData, budgetBurnUsd: 42.0 }, false, false)).toBe("budgetWarning");
  });
});

describe("deriveBudgetPercent", () => {
  it("calculates budget percentage rounded", () => {
    expect(deriveBudgetPercent(14.5, 50.0)).toBe(29);
    expect(deriveBudgetPercent(55.0, 50.0)).toBe(100);
  });
});
