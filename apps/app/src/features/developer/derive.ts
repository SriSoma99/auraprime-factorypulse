// Pure view-state derivation for W11 API & MCP Console (ADR-028).
import type { DeveloperScreenState } from "./types";

export function deriveDeveloperState(
  loading: boolean,
  error: boolean
): DeveloperScreenState {
  if (loading) return "loading";
  if (error) return "error";
  return "normal";
}

export function deriveQuotaPercent(used: number, quota: number): number {
  if (quota <= 0) return 0;
  return Math.min(100, Math.round((used / quota) * 100));
}
