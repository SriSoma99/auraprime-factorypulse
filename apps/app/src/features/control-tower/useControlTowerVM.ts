// ViewModel for W06 Control Tower (ADR-028; OBS-1 to OBS-11).
import { useQuery } from "@tanstack/react-query";
import { unwrap } from "@fp/sdk-ts";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { deriveBudgetPercent, deriveControlTowerState } from "./derive";
import type { ControlTowerData } from "./types";

export function useControlTowerVM() {
  const statusQ = useQuery({
    queryKey: ["status"],
    refetchInterval: env.pollIntervalMs,
    queryFn: async () => unwrap(await api.GET("/v1/status")),
  });

  const level = statusQ.data?.fallbackLevel ?? "L0";

  // Control tower telemetry snapshot (OBS-1..11, AC-1 budget cap)
  const data: ControlTowerData = {
    level,
    fallbackHistory: [
      { level: "L0", timestamp: "2026-10-05T08:00:00Z", reason: "Clean deployment baseline" },
      { level: "L1", timestamp: "2026-10-05T09:15:00Z", reason: "Model latency spike on cloud gateway" },
      { level: "L0", timestamp: "2026-10-05T09:22:00Z", reason: "Reverted to local Ollama inference" },
    ],
    pipelineLagMs: 18,
    ingestRatePerSec: 540,
    budgetBurnUsd: 14.85,
    budgetCapUsd: 50.0,
    ragCitationCoveragePct: 100,
    ragLatencyP95Ms: 120,
    mcpCallsCount: 1420,
    mcpDenialsCount: 3,
    mcpActuationBlocksCount: 14,
    recentTraces: [
      { traceId: "4bf92f3577b34da6a3ce929d0e0e4736", scenario: "Slow drift in Weld Cell 4 (Hero)", latencyMs: 285, status: "ok", timestamp: "10 min ago" },
      { traceId: "7c120a1492b45cc1b0de123d4567890a", scenario: "Sensor lie vs machine fault (CS-B)", latencyMs: 190, status: "ok", timestamp: "25 min ago" },
      { traceId: "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d", scenario: "Poisoned note injection block (CS-D)", latencyMs: 45, status: "blocked", timestamp: "1 hour ago" },
    ],
  };

  const state = deriveControlTowerState(data, statusQ.isLoading, statusQ.isError);
  const budgetPct = deriveBudgetPercent(data.budgetBurnUsd, data.budgetCapUsd);

  return {
    state,
    data,
    budgetPct,
    refetch: () => void statusQ.refetch(),
  };
}
