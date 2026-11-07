// Knowledge base, hybrid RAG query, and the document lifecycle: upload, review, delete or withdraw (W07; RAG-1..13, ADR-041).
import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import type pg from "pg";
import type { components } from "@fp/sdk-ts";
import { describeModel, EMBEDDING_DIMENSION, KnowledgeService, renderTemplate, validateUpload, type UploadInput } from "@fp/knowledge-svc";
import { withTenant, ProblemError, type Ctx } from "../context.ts";
import { scope } from "../scope.ts";

type S = components["schemas"];
const CLASSIFICATIONS = ["public", "internal", "restricted"] as const;
type Classification = (typeof CLASSIFICATIONS)[number];

export function knowledgeRoutes(app: FastifyInstance, ctx: Ctx): void {
  const knowledgeSvc = new KnowledgeService(ctx.cfg, ctx.app);

  // GET /v1/knowledge/stats - Corpus statistics & model status
  app.get("/v1/knowledge/stats", async (req) =>
    withTenant(ctx, req.principal.tenantId, async (c) => {
      const docCountRes = await c.query<{ count: string }>(
        "SELECT count(*) as count FROM know.citation WHERE status = 'approved'"
      );
      const chunkCountRes = await c.query<{ count: string; avg_length: string }>(
        "SELECT count(*) as count, coalesce(avg(length(content)), 0) as avg_length FROM know.chunk_embedding"
      );
      const provCountRes = await c.query<{ count: string }>(
        "SELECT count(*) as count FROM know.retrieval_provenance"
      );

      const docCount = Number(docCountRes.rows[0]?.count ?? 0);
      const chunkCount = Number(chunkCountRes.rows[0]?.count ?? 0);
      const avgLength = Number(chunkCountRes.rows[0]?.avg_length ?? 0);
      const totalBytes = chunkCount * avgLength;
      const sizeMb = (totalBytes / (1024 * 1024)).toFixed(2);

      const model = describeModel(ctx.cfg.model);

      return {
        totalDocuments: docCount,
        totalChunks: chunkCount,
        corpusSizeBytes: totalBytes,
        corpusSizeMb: `${sizeMb} MB`,
        totalProvenanceQueries: Number(provCountRes.rows[0]?.count ?? 0),
        embeddingDimension: EMBEDDING_DIMENSION,
        vectorIndex: "pgvector HNSW Cosine (<=>)",
        activeModel: model.modelId,
        modelProvider: model.provider,
        liveModel: model.live,
      };
    })
  );

  // GET /v1/knowledge/documents - every document with its lifecycle state (RAG-10, RAG-13)
  app.get("/v1/knowledge/documents", async (req) =>
    withTenant(ctx, req.principal.tenantId, async (c) => {
      const r = await c.query<DocRow>(`${DOC_SELECT} ORDER BY (c.status = 'pending_review') DESC, (c.status = 'withdrawn'), c.title`);
      return r.rows.map(toDocument);
    })
  );

  // GET /v1/knowledge/templates - document types, their required sections and the equipment a document can be for (RAG-12)
  app.get("/v1/knowledge/templates", async (req) =>
    withTenant(ctx, req.principal.tenantId, async (c) => {
      const body: S["KnowledgeTemplates"] = {
        templates: Object.entries(ctx.cfg.knowledge.templates).map(([docType, t]) => ({
          docType, label: t.label, sections: t.sections, markdown: renderTemplate(docType, ctx.cfg.knowledge.templates)!,
        })),
        equipment: await equipment(c),
        rules: {
          maxBytes: ctx.cfg.knowledge.upload.max_bytes, titleMinChars: ctx.cfg.knowledge.upload.title_min_chars,
          contentMinWords: ctx.cfg.knowledge.upload.content_min_words, reasonMinChars: ctx.cfg.knowledge.upload.reason_min_chars,
          requireSecondReviewer: ctx.cfg.knowledge.upload.require_second_reviewer,
        },
      };
      return body;
    })
  );

  // POST /v1/knowledge/documents/:documentId/approve - a second person makes a pending upload retrievable (RAG-10)
  app.post<{ Params: { documentId: string } }>("/v1/knowledge/documents/:documentId/approve", async (req) =>
    withTenant(ctx, req.principal.tenantId, async (c) => {
      if (req.principal.sessionType !== "human") throw new ProblemError(403, "Approval needs a signed-in person", "API keys and agent tokens cannot approve documents.");
      const d = await findDocument(c, req.params.documentId);
      if (d.status !== "pending_review") throw new ProblemError(409, "Only a document waiting for review can be approved", `This document is ${d.status.replace("_", " ")}.`);
      if (ctx.cfg.knowledge.upload.require_second_reviewer && d.uploaded_by === req.principal.id) {
        throw new ProblemError(409, "Another person must approve your upload", "The person who uploaded a document cannot approve it.");
      }
      await c.query("UPDATE know.citation SET status = 'approved', verified = true, reviewed_by = $1, reviewed_at = now() WHERE id = $2", [req.principal.id, d.id]);
      const auditId = await audit(c, req.principal.id, "knowledge.document_approved", d.id, { title: d.title, version: d.version });
      const body: S["DocumentChange"] = { document: toDocument(await row(c, d.id)), outcome: "approved", auditId };
      return body;
    })
  );

  // DELETE /v1/knowledge/documents/:documentId - delete a document nobody cited, otherwise withdraw it (RAG-13)
  app.delete<{ Params: { documentId: string }; Body: { reason?: unknown } }>("/v1/knowledge/documents/:documentId", async (req) =>
    withTenant(ctx, req.principal.tenantId, async (c) => {
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (reason.length < ctx.cfg.knowledge.upload.reason_min_chars) {
        throw new ProblemError(422, "A reason is required", `Say why in at least ${ctx.cfg.knowledge.upload.reason_min_chars} characters; it is kept in the audit log.`);
      }
      const d = await findDocument(c, req.params.documentId);
      if (d.status === "withdrawn") throw new ProblemError(409, "Already withdrawn", "A withdrawn document stays for the provenance ledger (RAG-8) and cannot be deleted.");
      const payload = { title: d.title, version: d.version, status: d.status, reason };
      if (d.cited) {
        await c.query("UPDATE know.citation SET status = 'withdrawn', verified = false, withdrawn_by = $1, withdrawn_at = now(), withdrawn_reason = $2 WHERE id = $3", [req.principal.id, reason, d.id]);
        const auditId = await audit(c, req.principal.id, "knowledge.document_withdrawn", d.id, payload);
        const body: S["DocumentChange"] = { document: toDocument(await row(c, d.id)), outcome: "withdrawn", auditId };
        return body;
      }
      const before = toDocument(d);
      await c.query("DELETE FROM know.chunk_embedding WHERE citation_id = $1", [d.id]);
      await c.query("DELETE FROM know.citation WHERE id = $1", [d.id]);
      const auditId = await audit(c, req.principal.id, "knowledge.document_deleted", d.id, payload);
      const body: S["DocumentChange"] = { document: before, outcome: "deleted", auditId };
      return body;
    })
  );

  // POST /v1/knowledge/query - End-to-end RAG question answering with verified citations
  app.post<{
    Body: {
      question: string;
      top_k?: number;
      min_score?: number;
    };
  }>("/v1/knowledge/query", async (req) =>
    withTenant(ctx, req.principal.tenantId, async (c) => {
      const question = req.body?.question?.trim();
      if (!question) {
        throw new ProblemError(400, "Field 'question' is required");
      }
      const { top_k, min_score } = req.body;
      if (top_k !== undefined && !(Number.isInteger(top_k) && top_k >= 1 && top_k <= 50)) throw new ProblemError(422, "top_k must be a whole number from 1 to 50");
      if (min_score !== undefined && !(typeof min_score === "number" && min_score >= 0 && min_score <= 1)) throw new ProblemError(422, "min_score must be from 0 to 1");
      // The degradation level comes from the platform state, never from the caller (03 section 13).
      const { level } = await scope(ctx, c, req.principal);

      const incomingTrace =
        (req.headers["traceparent"] as string | undefined) ||
        (req.id ? `00-${req.id.padEnd(32, "0")}-0000000000000001-01` : undefined);

      const result = await knowledgeSvc.queryRAG({
        tenant_id: req.principal.tenantId,
        question,
        top_k,
        min_score,
        fallback_level: level,
        traceparent: incomingTrace,
      });

      return result;
    })
  );

  // POST /v1/knowledge/upload - validated against a template (RAG-12), scanned (RAG-10), indexed and left pending review
  app.post<{ Body: UploadInput }>("/v1/knowledge/upload", async (req) =>
    withTenant(ctx, req.principal.tenantId, async (c) => {
      const known = new Set((await equipment(c)).map(e => e.assetId));
      const { problems, value } = validateUpload(req.body ?? {}, ctx.cfg.knowledge.upload, ctx.cfg.knowledge.templates, known);
      const classification = req.body?.classification ?? "internal";
      if (!CLASSIFICATIONS.includes(classification as Classification)) problems.push({ field: "classification", code: "unknown_classification", message: `Classification must be one of ${CLASSIFICATIONS.join(", ")}.` });
      if (!value || problems.length) throw new ProblemError(422, "Document not accepted", `Fix ${problems.length === 1 ? "this problem" : `these ${problems.length} problems`} and upload again.`, { problems });
      // Template hints are comments; they are not part of the document.
      const content = value.content.replace(/<!--[\s\S]*?-->/g, "").trim();
      const contentHash = createHash("sha256").update(content).digest("hex");
      const dup = (await c.query<{ id: string; title: string }>("SELECT id, title FROM know.citation WHERE content_hash = $1 AND status <> 'withdrawn'", [contentHash])).rows[0];
      if (dup) throw new ProblemError(409, "This document is already uploaded", `The same text is ${dup.id} (${dup.title}).`);
      const base = `DOC-${contentHash.slice(0, 10).toUpperCase()}`;
      const taken = Number((await c.query<{ n: string }>("SELECT count(*) AS n FROM know.citation WHERE id = $1 OR id LIKE $2", [base, `${base}-R%`])).rows[0]!.n);
      const docId = taken === 0 ? base : `${base}-R${taken + 1}`;

      let res;
      try {
        res = await knowledgeSvc.ingestDocument({
          id: docId,
          tenant_id: req.principal.tenantId,
          metadata: {
            title: value.title, section: ctx.cfg.knowledge.templates[value.docType]!.label, version: value.version, effective_from: value.effectiveFrom,
            asset_id: value.assetId, classification: classification as Classification, verified: false, doc_type: value.docType, content_hash: contentHash, uploaded_by: req.principal.id,
          },
          content,
        });
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes("prompt injection")) {
          throw new ProblemError(422, "Document not accepted", "It contains instructions aimed at the AI model (RAG-10).", { problems: [{ field: "content", code: "prompt_injection", message: msg }] });
        }
        throw err;
      }
      const auditId = await audit(c, req.principal.id, "knowledge.document_uploaded", docId, { title: value.title, docType: value.docType, assetId: value.assetId, version: value.version, classification, contentHash });
      const body: S["DocumentChange"] = { document: toDocument(await row(c, docId)), outcome: "pending_review", auditId, chunks: res.total_chunks };
      return body;
    })
  );
}

type DocRow = {
  id: string; title: string; section: string; version: string; effective_from: string; status: S["DocumentStatus"]; doc_type: string | null;
  asset_id: string | null; asset_name: string | null; content_hash: string | null; uploaded_by: string | null; uploader: string | null; uploaded_at: Date | null;
  reviewer: string | null; withdrawn_reason: string | null; classification: S["KnowledgeDocument"]["classification"]; chunk_count: string; cited: boolean;
};

// A document counts as cited once any answer, incident or work order step has used it (RAG-8).
const DOC_SELECT = `
  SELECT c.id, c.title, c.section, c.version, c.effective_from::text, c.status, c.doc_type, c.asset_id, a.name AS asset_name, c.content_hash,
         c.uploaded_by, up.display_name AS uploader, c.uploaded_at, rv.display_name AS reviewer, c.withdrawn_reason, c.classification,
         (SELECT count(*) FROM know.chunk_embedding ce WHERE ce.citation_id = c.id) AS chunk_count,
         (EXISTS (SELECT 1 FROM know.retrieval_provenance p WHERE p.citation_ids ? c.id)
          OR EXISTS (SELECT 1 FROM "case".incident i WHERE i.citation_ids ? c.id)
          OR EXISTS (SELECT 1 FROM "case".work_order w, jsonb_array_elements(w.steps) st WHERE st->>'citationId' = c.id)) AS cited
  FROM know.citation c
  LEFT JOIN ref.asset a ON a.id = c.asset_id
  LEFT JOIN plat.principal up ON up.id = c.uploaded_by
  LEFT JOIN plat.principal rv ON rv.id = c.reviewed_by`;

function toDocument(r: DocRow): S["KnowledgeDocument"] {
  return {
    id: r.id, title: r.title, section: r.section, version: r.version, status: r.status, docType: r.doc_type, assetId: r.asset_id, assetName: r.asset_name,
    chunkCount: Number(r.chunk_count), effectiveDate: r.effective_from, uploadedBy: r.uploader, uploadedById: r.uploaded_by, uploadedAt: r.uploaded_at ? r.uploaded_at.toISOString() : null,
    reviewedBy: r.reviewer, withdrawnReason: r.withdrawn_reason, classification: r.classification, hash: r.content_hash, cited: r.cited,
  };
}

async function row(c: pg.PoolClient, id: string): Promise<DocRow> {
  return (await c.query<DocRow>(`${DOC_SELECT} WHERE c.id = $1`, [id])).rows[0]!;
}

async function findDocument(c: pg.PoolClient, id: string): Promise<DocRow> {
  // Row-level security limits this to the caller's tenant (invariant 4).
  const r = (await c.query<DocRow>(`${DOC_SELECT} WHERE c.id = $1`, [id])).rows[0];
  if (!r) throw new ProblemError(404, "Document not found");
  return r;
}

async function equipment(c: pg.PoolClient): Promise<S["KnowledgeEquipment"][]> {
  const r = await c.query<{ id: string; name: string; station: string; line: string }>(
    `SELECT a.id, a.name, s.name AS station, l.name AS line FROM ref.asset a JOIN ref.station s ON s.id = a.station_id JOIN ref.line l ON l.id = s.line_id ORDER BY l.name, s.position, a.name`);
  return r.rows.map(x => ({ assetId: x.id, name: x.name, stationName: x.station, lineName: x.line }));
}

async function audit(c: pg.PoolClient, actor: string, action: string, object: string, payload: Record<string, unknown>): Promise<string> {
  return (await c.query<{ id: string }>("SELECT gov.append_audit($1, $2, $3, $4::jsonb) AS id", [actor, action, object, JSON.stringify(payload)])).rows[0]!.id;
}
