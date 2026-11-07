// Knowledge Service runtime (APP-07 / DU-05 / WP-4).
// Ingestion, pgvector hybrid retrieval, citation verification, and provenance ledger.
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { Config } from "@fp/config";
import { LocalEmbedder, EMBEDDING_MODEL_ID, EMBEDDING_MODEL_VERSION } from "./embedder.js";
import { scanDocumentSecurity } from "./security.js";
import { narrate } from "./narration/gateway.js";
import { pgModelGuard, type ModelGuard } from "./narration/budget.js";
import type {
  IngestDocumentRequest,
  IngestDocumentResult,
  RetrievalOptions,
  RetrievedChunk,
  CitationVerificationRequest,
  CitationVerificationResult,
  RAGQueryRequest,
  RAGQueryResult,
} from "./types.js";

export class KnowledgeService {
  private readonly embedder = new LocalEmbedder();
  /** Budget breaker and provider circuit for paid narration (APP-26; FBK-3). One per service, so circuits persist across requests. */
  private readonly guard: ModelGuard;

  constructor(
    private readonly config: Config,
    private readonly pool: pg.Pool
  ) {
    this.guard = pgModelGuard(() => this.config.model, pool);
  }

  /**
   * Ingest a document (SOP, manual, procedure) with metadata and vector embeddings (RAG-1, RAG-10).
   */
  public async ingestDocument(req: IngestDocumentRequest): Promise<IngestDocumentResult> {
    // 1. Security scan: prevent prompt injection attacks (RAG-10)
    const scan = scanDocumentSecurity(req.content);
    if (!scan.safe) {
      throw new Error(
        `Document rejected (RAG-10): prompt injection detected: [${scan.threats.join(", ")}]`
      );
    }

    // 2. Chunking (RAG-1)
    const chunks = this.chunkText(req.content, req.chunkSize ?? this.config.knowledge.chunk_chars);
    if (chunks.length === 0) {
      throw new Error("Document content is empty after chunking");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [req.tenant_id]);

      // 3. Upsert citation header
      await client.query(
        `INSERT INTO know.citation (id, tenant_id, title, section, version, effective_from, verified, status,
                                    doc_type, asset_id, content_hash, uploaded_by, uploaded_at, classification)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 THEN 'approved' ELSE 'pending_review' END,
                 $8, $9, $10, $11, CASE WHEN $11::text IS NULL THEN NULL ELSE now() END, $12)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           section = EXCLUDED.section,
           version = EXCLUDED.version,
           effective_from = EXCLUDED.effective_from,
           verified = EXCLUDED.verified,
           status = EXCLUDED.status,
           classification = EXCLUDED.classification`,
        [
          req.id,
          req.tenant_id,
          req.metadata.title,
          req.metadata.section,
          req.metadata.version,
          req.metadata.effective_from,
          req.metadata.verified ?? true,
          req.metadata.doc_type ?? null,
          req.metadata.asset_id ?? null,
          req.metadata.content_hash ?? null,
          req.metadata.uploaded_by ?? null,
          req.metadata.classification ?? "internal",
        ]
      );

      // Clean existing chunks for this citation on re-ingestion
      await client.query("DELETE FROM know.chunk_embedding WHERE citation_id = $1", [req.id]);

      // 4. Generate embeddings and insert chunks
      for (let i = 0; i < chunks.length; i++) {
        const chunkContent = chunks[i]!;
        const vector = this.embedder.embedText(chunkContent);
        const vectorSql = `[${vector.join(",")}]`;
        const chunkId = `${req.id}-chk-${i + 1}`;

        await client.query(
          `INSERT INTO know.chunk_embedding (
             id, tenant_id, citation_id, chunk_index, content, model_id, model_version, embedding
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)`,
          [
            chunkId,
            req.tenant_id,
            req.id,
            i,
            chunkContent,
            this.embedder.modelId,
            this.embedder.modelVersion,
            vectorSql,
          ]
        );
      }

      await client.query("COMMIT");

      return {
        citation_id: req.id,
        total_chunks: chunks.length,
        model_id: this.embedder.modelId,
        model_version: this.embedder.modelVersion,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Hybrid vector similarity search in PostgreSQL with tenant RLS (RAG-2, RAG-4, RAG-9).
   */
  public async retrieve(opts: RetrievalOptions): Promise<RetrievedChunk[]> {
    // Check model version compatibility (RAG-9)
    if (opts.model_id && opts.model_version) {
      this.embedder.checkCompatibility(opts.model_id, opts.model_version);
    }

    const queryVector = this.embedder.embedText(opts.query);
    const vectorSql = `[${queryVector.join(",")}]`;
    const limit = opts.top_k ?? this.config.knowledge.retrieval.top_k;
    const minScore = opts.min_score ?? this.config.knowledge.retrieval.min_score;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [opts.tenant_id]);

      const res = await client.query<{
        citation_id: string;
        chunk_id: string;
        title: string;
        section: string;
        version: string;
        effective_from: string;
        content: string;
        classification: "public" | "internal" | "restricted";
        distance: number;
      }>(
        `SELECT
           c.id AS citation_id,
           ce.id AS chunk_id,
           c.title,
           c.section,
           c.version,
           c.effective_from::text,
           ce.content,
           c.classification,
           (ce.embedding <=> $1::vector) AS distance
         FROM know.chunk_embedding ce
         JOIN know.citation c ON c.id = ce.citation_id
         WHERE c.verified = true
         ORDER BY distance ASC
         LIMIT $2`,
        [vectorSql, limit]
      );

      const chunks: RetrievedChunk[] = [];
      for (const row of res.rows) {
        const score = Number((1 - row.distance).toFixed(4));
        if (score >= minScore) {
          chunks.push({
            citation_id: row.citation_id,
            chunk_id: row.chunk_id,
            title: row.title,
            section: row.section,
            version: row.version,
            effective_from: row.effective_from,
            content: row.content,
            classification: row.classification,
            score,
          });
        }
      }

      // Record retrieval provenance ledger (RAG-8)
      const provenanceId = `prov-${randomUUID()}`;
      await client.query(
        `INSERT INTO know.retrieval_provenance (
           id, tenant_id, incident_id, query, retrieved_chunks, citation_ids, model_id, model_version, traceparent
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          provenanceId,
          opts.tenant_id,
          opts.incident_id ?? null,
          opts.query,
          JSON.stringify(chunks),
          JSON.stringify(chunks.map((c) => c.citation_id)),
          this.embedder.modelId,
          this.embedder.modelVersion,
          opts.traceparent ?? null,
        ]
      );

      await client.query("COMMIT");
      return chunks;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Citation verification: ensures every claim in a diagnosis links to an active retrieved chunk (RAG-6, RAG-7).
   */
  public verifyCitations(req: CitationVerificationRequest): CitationVerificationResult {
    const unsupportedClaims: string[] = [];
    const citationHandles = new Set<string>();

    for (const claim of req.claims) {
      const claimTokens = this.extractKeywords(claim);
      let supported = false;

      for (const chunk of req.retrievedChunks) {
        const chunkLower = chunk.content.toLowerCase();
        // Check for meaningful keyword overlap
        const matchedTokens = claimTokens.filter((token) => chunkLower.includes(token));
        if (matchedTokens.length >= Math.min(2, claimTokens.length)) {
          supported = true;
          citationHandles.add(chunk.citation_id);
          break;
        }
      }

      if (!supported) {
        unsupportedClaims.push(claim);
      }
    }

    const allSupported = unsupportedClaims.length === 0;
    return {
      allSupported,
      supportedCount: req.claims.length - unsupportedClaims.length,
      unsupportedClaims,
      citationHandles: Array.from(citationHandles),
      abstainReason: allSupported
        ? undefined
        : `Citation verification failed (RAG-6): ${unsupportedClaims.length} claim(s) lack supporting evidence in retrieved citations.`,
    };
  }

  /**
   * End-to-end Industrial RAG Query (RAG-1..10):
   * Retrieves semantically relevant manual chunks via pgvector, narrates through the configured model port (ADR-038),
   * and verifies citations.
   */
  public async queryRAG(req: RAGQueryRequest): Promise<RAGQueryResult> {
    const startTime = Date.now();
    const chunks = await this.retrieve({
      tenant_id: req.tenant_id,
      query: req.question,
      top_k: req.top_k ?? this.config.knowledge.retrieval.top_k,
      min_score: req.min_score ?? this.config.knowledge.retrieval.min_score,
      traceparent: req.traceparent,
    });

    // APP-26 narration (ADR-038): the model only words the answer; citations are verified below either way.
    const synthesis = await narrate(this.config.model, { question: req.question, chunks, level: req.fallback_level ?? "L0", tenantId: req.tenant_id }, { guard: this.guard });

    // Verify citations against retrieved chunks (RAG-6, RAG-7)
    const verification = this.verifyCitations({
      claims: [synthesis.answer],
      retrievedChunks: chunks,
    });

    return {
      question: req.question,
      answer: synthesis.answer,
      model: synthesis.model,
      fallback: synthesis.fallback,
      fallback_reason: synthesis.fallbackReason,
      retrieved_chunks: chunks,
      citation_handles: synthesis.citationHandles,
      citations_verified: verification.allSupported,
      latency_ms: Date.now() - startTime,
    };
  }

  private chunkText(text: string, maxChunkLength: number): string[] {
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
    const chunks: string[] = [];
    let current = "";

    for (const para of paragraphs) {
      if ((current + "\n" + para).length > maxChunkLength && current.length > 0) {
        chunks.push(current.trim());
        current = para;
      } else {
        current = current ? current + "\n\n" + para : para;
      }
    }
    if (current.trim().length > 0) {
      chunks.push(current.trim());
    }

    return chunks;
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set(["the", "and", "for", "with", "this", "that", "from", "into", "over", "under", "after", "before"]);
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w));
  }
}
