-- Migration 0015: document classification is stored, so the narration gateway can keep restricted text on local models (ADR-038).
-- Existing documents are internal, which is what ingestion assumed before.
ALTER TABLE know.citation ADD COLUMN IF NOT EXISTS classification text NOT NULL DEFAULT 'internal';
ALTER TABLE know.citation DROP CONSTRAINT IF EXISTS citation_classification_valid;
ALTER TABLE know.citation ADD CONSTRAINT citation_classification_valid CHECK (classification IN ('public', 'internal', 'restricted'));
