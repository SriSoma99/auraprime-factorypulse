// Pure view-state derivation for W07 Knowledge (ADR-028; RAG-10, RAG-12, RAG-13).
import type { DocumentFilter, DocumentStatus, KnowledgeDocument, KnowledgeScreenState, UploadField, UploadProblem } from "./types";

export function deriveKnowledgeState(docs: readonly KnowledgeDocument[] | undefined, loading: boolean, error: boolean): KnowledgeScreenState {
  if (loading) return "loading";
  if (error || !docs) return "error";
  return docs.length === 0 ? "empty" : "ready";
}

export function filterDocuments(docs: readonly KnowledgeDocument[], filter: DocumentFilter): KnowledgeDocument[] {
  return filter === "all" ? [...docs] : docs.filter(d => d.status === filter);
}

export function countByStatus(docs: readonly KnowledgeDocument[]): Record<DocumentFilter, number> {
  const out: Record<DocumentFilter, number> = { all: docs.length, pending_review: 0, approved: 0, withdrawn: 0 };
  for (const d of docs) out[d.status] += 1;
  return out;
}

export const STATUS_LABEL: Record<DocumentStatus, string> = { pending_review: "Pending review", approved: "Approved", withdrawn: "Withdrawn" };

export interface DocumentActions {
  /** Shown only when the document waits for review. */
  approve: { allowed: boolean; reason: string | null } | null;
  /** Delete when nobody cited it, withdraw when something did (RAG-13); null when nothing can be done. */
  remove: { label: "Delete" | "Withdraw"; allowed: boolean; explain: string } | null;
}

export function documentActions(d: KnowledgeDocument, me: { principalId: string | undefined; canUse: boolean; requireSecondReviewer: boolean }): DocumentActions {
  const approve = d.status !== "pending_review" ? null
    : !me.canUse ? { allowed: false, reason: "View only for your role." }
    : me.requireSecondReviewer && d.uploadedById !== null && d.uploadedById === me.principalId ? { allowed: false, reason: "You uploaded this document; another person must approve it." }
    : { allowed: true, reason: null };
  const remove = d.status === "withdrawn" ? null : {
    label: d.cited ? "Withdraw" as const : "Delete" as const,
    allowed: me.canUse,
    explain: d.cited
      ? "An answer, incident or work order cited this document, so it is withdrawn: kept for the record but never retrieved again."
      : "Nobody has cited this document, so it is deleted with its indexed chunks.",
  };
  return { approve, remove };
}

export function problemsByField(problems: readonly UploadProblem[] | undefined): Partial<Record<UploadField, string[]>> {
  const out: Partial<Record<UploadField, string[]>> = {};
  for (const p of problems ?? []) (out[p.field] ??= []).push(p.message);
  return out;
}

/** Samples only for equipment the signed-in tenant has registered, since the API refuses any other. */
export function samplesFor<T extends { assetId: string }>(samples: readonly T[] | undefined, equipment: readonly { assetId: string }[] | undefined): T[] {
  const ids = new Set((equipment ?? []).map(e => e.assetId));
  return (samples ?? []).filter(s => ids.has(s.assetId));
}
