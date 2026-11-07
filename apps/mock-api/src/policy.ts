// Approval policy as used by the mock: tiers come from config (policy.*), invariants stay in code.
import type { Config } from "@fp/config";
import type { Level, Principal } from "./context.ts";

export interface Decidability { effectiveTier: number; requiredRole: Principal["role"]; canDecide: boolean; reason: string | null }

/** Lowest role whose max tier covers the effective tier, for display as the required role. */
function roleFor(cfg: Config, tier: number): Principal["role"] {
  const ranked = Object.entries(cfg.policy.role_max_tier).filter(([, t]) => t >= tier).sort((a, b) => a[1] - b[1]);
  return (ranked[0]?.[0] ?? "reliability_engineer") as Principal["role"];
}

export function decidability(cfg: Config, p: Principal, baseTier: number, level: Level, status: string): Decidability {
  const effectiveTier = Math.max(baseTier, cfg.policy.min_tier_by_level[level]);
  const requiredRole = roleFor(cfg, effectiveTier);
  // Invariant 2: only a human session can approve or reject. Not configurable.
  if (p.sessionType !== "human") return { effectiveTier, requiredRole, canDecide: false, reason: "Approval needs a signed-in person. API keys and agent tokens cannot approve or reject." };
  if (status !== "pending") return { effectiveTier, requiredRole, canDecide: false, reason: `This approval is ${status}.` };
  if (cfg.policy.role_max_tier[p.role] < effectiveTier) {
    const raised = effectiveTier > baseTier ? ` (raised by ${level})` : "";
    return { effectiveTier, requiredRole, canDecide: false, reason: `Your role cannot decide tier ${effectiveTier}${raised}. A ${requiredRole.replace("_", " ")} has been notified.` };
  }
  return { effectiveTier, requiredRole, canDecide: true, reason: null };
}
