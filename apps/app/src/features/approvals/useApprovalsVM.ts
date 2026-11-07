// ViewModels for W04 Approvals and M03 Approval. Decisions are human-only (invariant 2); the server enforces it too.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ApiError, newIdempotencyKey, unwrap, type Approval } from "@fp/sdk-ts";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { untilText, roleLabel } from "@/lib/format";
import { useStatusVM } from "@/features/shell/useStatusVM";

import {
  deriveApprovalScreenState,
  deriveCanDecide,
  deriveApprovalListItems,
  type ApprovalScreenState,
  type ApprovalListItemVM,
} from "./derive";

export { deriveApprovalScreenState, deriveCanDecide, deriveApprovalListItems };
export type { ApprovalScreenState, ApprovalListItemVM };

export function useApprovalListVM() {
  const status = useStatusVM();
  const q = useQuery({ queryKey: ["approvals"], refetchInterval: env.pollIntervalMs, queryFn: async () => unwrap(await api.GET("/v1/approvals", { params: { query: { status: "pending" } } })) });
  const items = deriveApprovalListItems(q.data ?? [], status.now);
  return { state: q.isLoading ? "loading" : q.isError ? "error" : items.length === 0 ? "empty" : "pending", items, open: (id: string) => router.push(`/approvals/${id}`) };
}

export function useApprovalVM(id: string) {
  const qc = useQueryClient();
  const status = useStatusVM();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per decision attempt, reused if the same attempt is retried (UI-AC-10).
  const attemptKey = useRef<string | null>(null);
  const q = useQuery({ queryKey: ["approval", id], refetchInterval: env.pollIntervalMs, queryFn: async () => unwrap(await api.GET("/v1/approvals/{approvalId}", { params: { path: { approvalId: id } } })) });
  const decide = useMutation({
    mutationFn: async (decision: "approve" | "reject") => {
      attemptKey.current ??= newIdempotencyKey();
      return unwrap(await api.POST("/v1/approvals/{approvalId}/decision", { params: { path: { approvalId: id }, header: { "Idempotency-Key": attemptKey.current } }, body: { decision, ...(reason.trim() ? { reason: reason.trim() } : {}) } }));
    },
    onSuccess: (a: Approval) => { attemptKey.current = null; setError(null); qc.setQueryData(["approval", id], a); void qc.invalidateQueries(); },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.problem.detail ?? e.problem.title : "Could not send the decision. It will be retried with the same key."),
  });
  const a = q.data;
  const decided = a && a.status !== "pending";
  const { canSubmit, canReject } = deriveCanDecide(a, reason, decide.isPending);
  return {
    state: deriveApprovalScreenState(a, q.isLoading, q.isError),
    approval: a,
    tierText: a ? `${a.tier} · ${roleLabel(a.requiredRole)}` : "",
    timer: a ? (decided ? "decided" : untilText(a.expiresAt, status.now)) : "",
    reason, setReason, error, busy: decide.isPending,
    canSubmit,
    canReject,
    approve: () => decide.mutate("approve"),
    reject: () => decide.mutate("reject"),
    openIncident: () => { if (a) router.push(`/incidents/${a.incidentId}`); },
    openWorkOrder: () => { if (a) router.push(`/work-orders/${a.workOrderId}`); },
  };
}
