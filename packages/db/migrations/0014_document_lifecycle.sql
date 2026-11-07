-- Migration 0014: document lifecycle for the knowledge base (RAG-10, RAG-12, RAG-13; ADR-041).
-- An uploaded document waits in pending_review and is never retrieved until a second person approves it.
-- A document that was never cited may be deleted; a cited one is withdrawn so the provenance ledger (RAG-8) stays reproducible.
-- verified stays as the retrieval flag and always equals status = 'approved'.

ALTER TABLE know.citation
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS doc_type text,
  ADD COLUMN IF NOT EXISTS asset_id text REFERENCES ref.asset(id),
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS uploaded_by text REFERENCES plat.principal(id),
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by text REFERENCES plat.principal(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_by text REFERENCES plat.principal(id),
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_reason text;

UPDATE know.citation SET status = CASE WHEN verified THEN 'approved' ELSE 'pending_review' END WHERE status IS NULL;
ALTER TABLE know.citation ALTER COLUMN status SET DEFAULT 'approved';
ALTER TABLE know.citation ALTER COLUMN status SET NOT NULL;

ALTER TABLE know.citation DROP CONSTRAINT IF EXISTS citation_status_valid;
ALTER TABLE know.citation ADD CONSTRAINT citation_status_valid CHECK (status IN ('pending_review', 'approved', 'withdrawn'));
ALTER TABLE know.citation DROP CONSTRAINT IF EXISTS citation_verified_matches_status;
ALTER TABLE know.citation ADD CONSTRAINT citation_verified_matches_status CHECK (verified = (status = 'approved'));
ALTER TABLE know.citation DROP CONSTRAINT IF EXISTS citation_withdrawn_complete;
ALTER TABLE know.citation ADD CONSTRAINT citation_withdrawn_complete CHECK (
  (status <> 'withdrawn') OR (withdrawn_at IS NOT NULL AND withdrawn_reason IS NOT NULL));

-- One live copy of the same text per tenant; a withdrawn copy does not block a corrected re-upload.
CREATE UNIQUE INDEX IF NOT EXISTS citation_live_content_unique ON know.citation (tenant_id, content_hash)
  WHERE content_hash IS NOT NULL AND status <> 'withdrawn';
