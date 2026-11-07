// ViewModel for W07 Knowledge (ADR-028; RAG-1, RAG-10, RAG-12, RAG-13; ADR-041). Everything shown comes from the API;
// nothing is invented on the client when a call fails.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, unwrap } from "@fp/sdk-ts";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { canUse } from "@/features/shell/access";
import { countByStatus, deriveKnowledgeState, documentActions, filterDocuments, problemsByField, samplesFor } from "./derive";
import type { DocumentFilter, KnowledgeDocument, KnowledgeSearchHit, RAGAnswerState, UploadDraft, UploadProblem } from "./types";

const EMPTY_DRAFT: UploadDraft = { docType: "", assetId: "", title: "", version: "", effectiveFrom: "", content: "", classification: "internal" };
type Message = { tone: "ok" | "bad"; text: string } | null;
const problemText = (e: unknown) => (e instanceof ApiError ? e.problem.detail ?? e.problem.title : String(e));

export function useKnowledgeVM() {
  const qc = useQueryClient();
  const { session } = useSession();
  const mayUse = canUse(session?.permissions, "knowledge");

  const stats = useQuery({ queryKey: ["knowledge", "stats"], queryFn: async () => unwrap(await api.GET("/v1/knowledge/stats")) });
  const docs = useQuery({ queryKey: ["knowledge", "documents"], queryFn: async () => unwrap(await api.GET("/v1/knowledge/documents")) });
  const templates = useQuery({ queryKey: ["knowledge", "templates"], queryFn: async () => unwrap(await api.GET("/v1/knowledge/templates")) });
  // Local mock controls only (ADR-030); absent in any other build, so the sample buttons disappear.
  const samples = useQuery({ queryKey: ["mock-knowledge-samples"], retry: false, queryFn: async () => unwrap(await api.GET("/mock/knowledge/samples")) });

  const [filter, setFilter] = useState<DocumentFilter>("all");
  const [draft, setDraft] = useState<UploadDraft>(EMPTY_DRAFT);
  const [problems, setProblems] = useState<UploadProblem[]>([]);
  const [uploadMessage, setUploadMessage] = useState<Message>(null);
  const [docMessage, setDocMessage] = useState<Message>(null);
  const [removing, setRemoving] = useState<{ id: string; reason: string } | null>(null);

  const [answer, setAnswer] = useState<RAGAnswerState | null>(null);
  const [hits, setHits] = useState<KnowledgeSearchHit[]>([]);
  const [queryError, setQueryError] = useState<string | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["knowledge"] });

  const upload = useMutation({
    mutationFn: async (d: UploadDraft) => unwrap(await api.POST("/v1/knowledge/upload", { body: d })),
    onSuccess: r => {
      setProblems([]);
      setDraft(EMPTY_DRAFT);
      setUploadMessage({ tone: "ok", text: `${r.document.title} indexed as ${r.document.id} (${r.chunks ?? r.document.chunkCount} chunks). It waits for another person to approve it before answers can use it. Audit ${r.auditId}.` });
      refresh();
    },
    onError: e => {
      setProblems(e instanceof ApiError ? e.problem.problems ?? [] : []);
      setUploadMessage({ tone: "bad", text: problemText(e) });
    },
  });

  const approve = useMutation({
    mutationFn: async (documentId: string) => unwrap(await api.POST("/v1/knowledge/documents/{documentId}/approve", { params: { path: { documentId } } })),
    onSuccess: r => { setDocMessage({ tone: "ok", text: `${r.document.title} approved; answers can now cite it. Audit ${r.auditId}.` }); refresh(); },
    onError: e => setDocMessage({ tone: "bad", text: problemText(e) }),
  });

  const remove = useMutation({
    mutationFn: async (v: { id: string; reason: string }) => unwrap(await api.DELETE("/v1/knowledge/documents/{documentId}", { params: { path: { documentId: v.id } }, body: { reason: v.reason } })),
    onSuccess: r => {
      setRemoving(null);
      setDocMessage({ tone: "ok", text: `${r.document.title} ${r.outcome === "deleted" ? "deleted with its chunks" : "withdrawn; it stays on record but is never retrieved"}. Audit ${r.auditId}.` });
      refresh();
    },
    onError: e => setDocMessage({ tone: "bad", text: problemText(e) }),
  });

  const ask = useMutation({
    mutationFn: async (question: string) => ({ started: Date.now(), r: unwrap(await api.POST("/v1/knowledge/query", { body: { question } })) }),
    onSuccess: ({ started, r }) => {
      setQueryError(null);
      setAnswer({ question: r.question, answer: r.answer, model: r.model, fallback: r.fallback, citationHandles: r.citation_handles, citationsVerified: r.citations_verified, latencyMs: r.latency_ms ?? Date.now() - started });
      setHits((r.retrieved_chunks as { chunk_id: string; title: string; section: string; content: string; score: number }[]).map(c => ({ chunkId: c.chunk_id, docId: c.title, section: c.section, text: c.content, similarity: c.score })));
    },
    onError: e => { setQueryError(problemText(e)); setAnswer(null); setHits([]); },
  });

  const list: KnowledgeDocument[] = docs.data ?? [];
  const rules = templates.data?.rules;
  const me = { principalId: session?.principalId, canUse: mayUse, requireSecondReviewer: rules?.requireSecondReviewer ?? true };
  const chosen = templates.data?.templates.find(t => t.docType === draft.docType);

  return {
    state: deriveKnowledgeState(docs.data, docs.isLoading, docs.isError),
    canUse: mayUse,
    stats: stats.data,

    // Ask
    ask: (q: string) => { if (q.trim()) ask.mutate(q.trim()); },
    asking: ask.isPending,
    answer, hits, queryError,

    // Upload
    templates: templates.data?.templates ?? [],
    equipment: templates.data?.equipment ?? [],
    rules,
    chosenTemplate: chosen,
    draft,
    setField: <K extends keyof UploadDraft>(k: K, v: UploadDraft[K]) => setDraft(d => ({ ...d, [k]: v })),
    /** Fill the body with the chosen template's headings and hints. */
    insertTemplate: () => { if (chosen) setDraft(d => ({ ...d, content: chosen.markdown })); },
    samples: samplesFor(samples.data, templates.data?.equipment),
    samplesAvailable: samples.isSuccess,
    loadSample: (i: number) => {
      const s = samplesFor(samples.data, templates.data?.equipment)[i];
      if (s) { setDraft({ docType: s.docType, assetId: s.assetId, title: s.title, version: s.version, effectiveFrom: s.effectiveFrom, content: s.content, classification: "internal" }); setProblems([]); setUploadMessage(null); }
    },
    submit: () => upload.mutate(draft),
    uploading: upload.isPending,
    problems: problemsByField(problems),
    uploadMessage,

    // Catalog
    filter, setFilter,
    counts: countByStatus(list),
    docs: filterDocuments(list, filter).map(d => ({ ...d, actions: documentActions(d, me) })),
    docMessage,
    approve: (id: string) => approve.mutate(id),
    removing,
    startRemove: (id: string) => { setRemoving({ id, reason: "" }); setDocMessage(null); },
    setRemoveReason: (reason: string) => setRemoving(r => (r ? { ...r, reason } : r)),
    cancelRemove: () => setRemoving(null),
    confirmRemove: () => { if (removing) remove.mutate(removing); },
    busy: approve.isPending || remove.isPending,
  };
}
