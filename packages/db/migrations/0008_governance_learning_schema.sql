-- Migration 0008: Governance, Case Memory & Self-Improving Learning Loop (POL-1..4, LRN-1..7, REG-1..8, ADR-031).
-- Enforces Invariant 3 (tamper-evident audit verification) and Invariant 4 (forced RLS).

CREATE SCHEMA IF NOT EXISTS learn;

-- LRN-1: Outcome capture against incidents
CREATE TABLE IF NOT EXISTS "case".outcome (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  incident_id text NOT NULL REFERENCES "case".incident(id),
  technician_id text NOT NULL,
  finding text NOT NULL,
  readings jsonb NOT NULL,
  action_taken text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  good_cycle_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- LRN-5: Episodic case memory for verified closures (ADR-031)
CREATE TABLE IF NOT EXISTS learn.case_record (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  incident_id text NOT NULL REFERENCES "case".incident(id),
  asset_id text NOT NULL REFERENCES ref.asset(id),
  asset_class text NOT NULL,
  signal_pattern jsonb NOT NULL,
  trust_verdicts jsonb NOT NULL,
  hypotheses jsonb NOT NULL,
  discriminating_check jsonb,
  confirmed_failure_mode text NOT NULL,
  action_taken text NOT NULL,
  outcome jsonb NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  embedding vector(384)
);

CREATE INDEX IF NOT EXISTS case_record_embedding_idx
  ON learn.case_record USING hnsw (embedding vector_cosine_ops);

-- LRN-6: Human-gated reusable lesson synthesis (ADR-031)
CREATE TABLE IF NOT EXISTS learn.lesson (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  case_id text NOT NULL REFERENCES learn.case_record(id),
  text text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'approved', 'rejected')),
  is_ai_generated boolean NOT NULL DEFAULT true,
  drafted_by_model text NOT NULL,
  decided_by text,
  decided_at timestamptz,
  decision_reason text,
  audit_event_id text
);

-- LRN-7: Staged learning batch and evaluation gate (ADR-031)
CREATE TABLE IF NOT EXISTS learn.learning_batch (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  status text NOT NULL CHECK (status IN ('staged', 'active', 'rejected', 'reverted')),
  updates jsonb NOT NULL,
  benchmark_result jsonb,
  golden_set_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by text,
  audit_event_id text
);

-- REG-1..8 / AC-H9: Cryptographic Audit Verification function
-- Traverses the tenant audit chain from genesis to tip, verifying mathematical hash integrity.
CREATE OR REPLACE FUNCTION gov.verify_audit()
RETURNS TABLE (
  valid boolean,
  verified_count bigint,
  broken_seq bigint,
  expected_hash text,
  actual_hash text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = gov, pg_catalog, pg_temp AS $$
DECLARE
  v_tenant text := current_setting('app.tenant_id', true);
  rec record;
  v_prev text := repeat('0', 64);
  v_computed text;
  v_count bigint := 0;
BEGIN
  IF v_tenant IS NULL OR v_tenant = '' THEN
    RAISE EXCEPTION 'tenant context required';
  END IF;

  FOR rec IN
    SELECT seq, id, actor, action, object, payload, prev_hash, hash
    FROM gov.audit_event
    WHERE tenant_id = v_tenant
    ORDER BY seq ASC
  LOOP
    v_count := v_count + 1;

    -- Verify prev_hash link
    IF rec.prev_hash <> v_prev THEN
      RETURN QUERY SELECT false, v_count, rec.seq, v_prev, rec.prev_hash;
      RETURN;
    END IF;

    -- Recompute SHA-256 hash using the canonical payload
    v_computed := encode(sha256(convert_to(rec.prev_hash || rec.actor || rec.action || rec.object || rec.payload::text, 'UTF8')), 'hex');
    IF rec.hash <> v_computed THEN
      RETURN QUERY SELECT false, v_count, rec.seq, v_computed, rec.hash;
      RETURN;
    END IF;

    v_prev := rec.hash;
  END LOOP;

  RETURN QUERY SELECT true, v_count, NULL::bigint, NULL::text, NULL::text;
END $$;

-- Row-Level Security for new tables (Invariant 4)
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT schemaname, tablename FROM pg_tables
    WHERE (schemaname = 'learn' AND tablename IN ('case_record', 'lesson', 'learning_batch'))
       OR (schemaname = 'case' AND tablename = 'outcome')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    EXECUTE format(
      $p$DROP POLICY IF EXISTS tenant_isolation ON %I.%I;
         CREATE POLICY tenant_isolation ON %I.%I
         USING (tenant_id = current_setting('app.tenant_id', true))
         WITH CHECK (tenant_id = current_setting('app.tenant_id', true))$p$,
      t.schemaname, t.tablename, t.schemaname, t.tablename
    );
  END LOOP;
END $$;

-- Grant permissions to :app_user
GRANT USAGE ON SCHEMA learn TO :app_user;
GRANT INSERT, UPDATE, SELECT, DELETE ON
  "case".outcome,
  learn.case_record,
  learn.lesson,
  learn.learning_batch
TO :app_user;

GRANT EXECUTE ON FUNCTION gov.verify_audit() TO :app_user;
