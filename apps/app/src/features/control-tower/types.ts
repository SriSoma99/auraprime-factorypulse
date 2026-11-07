// Types for W06 Control Tower (02 section 6.1; OBS-1 to OBS-11).
import type { FallbackLevel } from "@fp/sdk-ts";

export type ControlTowerScreenState = "loading" | "error" | "normal" | "degraded" | "budgetWarning";

export interface FallbackHistoryEntry {
  level: FallbackLevel;
  timestamp: string;
  reason: string;
}

export interface TraceSummary {
  traceId: string;
  scenario: string;
  latencyMs: number;
  status: "ok" | "degraded" | "blocked";
  timestamp: string;
}

export interface ControlTowerData {
  level: FallbackLevel;
  fallbackHistory: FallbackHistoryEntry[];
  pipelineLagMs: number;
  ingestRatePerSec: number;
  budgetBurnUsd: number;
  budgetCapUsd: number;
  ragCitationCoveragePct: number;
  ragLatencyP95Ms: number;
  mcpCallsCount: number;
  mcpDenialsCount: number;
  mcpActuationBlocksCount: number;
  recentTraces: TraceSummary[];
}
