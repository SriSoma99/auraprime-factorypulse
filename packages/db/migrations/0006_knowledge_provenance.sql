-- Migration 0006: Knowledge service grants and provenance ledger (RAG-1, RAG-8).
-- Invariant 4 preserved: all tables enforce row-level security through :app_user (NOBYPASSRLS).

GRANT INSERT, UPDATE, DELETE ON know.citation TO :app_user;

CREATE TABLE IF NOT EXISTS know.retrieval_provenance (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  incident_id text REFERENCES "case".incident(id),
  query text NOT NULL,
  retrieved_chunks jsonb NOT NULL,
  citation_ids jsonb NOT NULL,
  model_id text NOT NULL,
  model_version text NOT NULL,
  traceparent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE know.retrieval_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE know.retrieval_provenance FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON know.retrieval_provenance
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT ON know.retrieval_provenance TO :app_user;
