// Types for W07 Knowledge (02 section 6.1; RAG-1, RAG-10, RAG-12, RAG-13; ADR-041).
import type { components } from "@fp/sdk-ts";

type S = components["schemas"];
export type KnowledgeDocument = S["KnowledgeDocument"];
export type DocumentStatus = S["DocumentStatus"];
export type UploadProblem = S["UploadProblem"];
export type UploadField = UploadProblem["field"];
export type DocumentFilter = "all" | DocumentStatus;
export type KnowledgeScreenState = "loading" | "error" | "empty" | "ready";

export type Classification = NonNullable<S["DocumentUploadRequest"]["classification"]>;
export interface UploadDraft { docType: string; assetId: string; title: string; version: string; effectiveFrom: string; content: string; classification: Classification }

export interface KnowledgeSearchHit { chunkId: string; docId: string; section: string; text: string; similarity: number }

export interface RAGAnswerState {
  question: string;
  answer: string;
  model: string;
  fallback: boolean;
  citationHandles: string[];
  citationsVerified: boolean;
  latencyMs: number;
}
