// Types for Knowledge Service (APP-07 / DU-05 / WP-4).

export interface DocumentMetadata {
  title: string;
  section: string;
  version: string;
  effective_from: string; // ISO date YYYY-MM-DD
  asset_id?: string;
  classification?: "public" | "internal" | "restricted";
  verified?: boolean;
  /** Lifecycle fields for uploaded documents (RAG-12, ADR-041); the seeded corpus leaves them empty. */
  doc_type?: string;
  content_hash?: string;
  uploaded_by?: string;
}

export interface IngestDocumentRequest {
  id: string; // citation_id
  tenant_id: string;
  metadata: DocumentMetadata;
  content: string;
  chunkSize?: number;
}

export interface IngestDocumentResult {
  citation_id: string;
  total_chunks: number;
  model_id: string;
  model_version: string;
}

export interface RetrievalOptions {
  tenant_id: string;
  query: string;
  top_k?: number;
  min_score?: number;
  model_id?: string;
  model_version?: string;
  incident_id?: string;
  traceparent?: string;
}

export interface RetrievedChunk {
  citation_id: string;
  chunk_id: string;
  title: string;
  section: string;
  version: string;
  effective_from: string;
  content: string;
  score: number; // 0 to 1 cosine similarity
  classification?: "public" | "internal" | "restricted";
}

export interface CitationVerificationRequest {
  claims: string[];
  retrievedChunks: RetrievedChunk[];
}

export interface CitationVerificationResult {
  allSupported: boolean;
  supportedCount: number;
  unsupportedClaims: string[];
  citationHandles: string[];
  abstainReason?: string;
}

export interface RAGQueryRequest {
  tenant_id: string;
  question: string;
  top_k?: number;
  min_score?: number;
  fallback_level?: string;
  traceparent?: string;
}

export interface RAGQueryResult {
  question: string;
  answer: string;
  model: string;
  fallback: boolean;
  /** Why the local template answered instead of the configured model; null when the model answered. */
  fallback_reason: string | null;
  retrieved_chunks: RetrievedChunk[];
  citation_handles: string[];
  citations_verified: boolean;
  latency_ms: number;
}
