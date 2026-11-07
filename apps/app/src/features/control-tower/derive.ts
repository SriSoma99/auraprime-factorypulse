// Pure view-state derivation for W06 Control Tower (ADR-028).
import type { ControlTowerData, ControlTowerScreenState } from "./types";

export function deriveControlTowerState(
  data: ControlTowerData | null | undefined,
  loading: boolean,
  error: boolean
): ControlTowerScreenState {
  if (loading) return "loading";
  if (error || !data) return "error";
  if (data.budgetBurnUsd >= data.budgetCapUsd * 0.8) return "budgetWarning";
  if (data.level !== "L0") return "degraded";
  return "normal";
}

export function deriveBudgetPercent(burn: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(100, Math.round((burn / cap) * 100));
}
