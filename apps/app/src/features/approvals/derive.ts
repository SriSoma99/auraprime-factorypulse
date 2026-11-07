// Pure view-state derivation for W04 Approvals and M03 Approval (ADR-028).
import type { Approval } from "@fp/sdk-ts";
import { untilText } from "../../lib/format";

export type ApprovalScreenState =
  | "loading"
  | "error"
  | "decided"
  | "escalated"
  | "expired"
  | "cannotDecide"
  | "pending";

export interface ApprovalListItemVM {
  id: string;
  title: string;
  incidentId: string;
  tier: number;
  timer: string;
  soon: boolean;
  canDecide: boolean;
}

export function deriveApprovalScreenState(
  a: Approval | null | undefined,
  loading: boolean,
  error: boolean
): ApprovalScreenState {
  if (loading) return "loading";
  if (error || !a) return "error";
  if (a.status === "approved" || a.status === "rejected") return "decided";
  if (a.status === "escalated") return "escalated";
  if (a.status === "expired") return "expired";
  if (!a.canDecide) return "cannotDecide";
  return "pending";
}

export function deriveCanDecide(
  a: Approval | null | undefined,
  reason: string,
  busy: boolean
): { canSubmit: boolean; canReject: boolean } {
  const canDecide = !!a?.canDecide && !busy;
  return {
    canSubmit: canDecide,
    canReject: canDecide && reason.trim().length > 0,
  };
}

export function deriveApprovalListItems(
  approvals: Approval[],
  now: string
): ApprovalListItemVM[] {
  const nowMs = Date.parse(now);
  return approvals.map(a => ({
    id: a.id,
    title: a.title,
    incidentId: a.incidentId,
    tier: a.tier,
    timer: untilText(a.expiresAt, now),
    soon: Date.parse(a.expiresAt) - nowMs < 60 * 60_000,
    canDecide: a.canDecide,
  }));
}
