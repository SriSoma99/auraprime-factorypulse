-- DS-01 schema for the UI-first mock backend (ADR-030 item 3), a subset of doc/05 section 4.
-- Invariant 4: every tenant table has tenant_id NOT NULL and forced row-level security.
-- Invariant 3: gov.audit_event is append-only through gov.append_audit (the APP-20 writer).
-- The role name :app_user and its password are supplied by the migration runner from config.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS plat;
CREATE SCHEMA IF NOT EXISTS ref;
CREATE SCHEMA IF NOT EXISTS intel;
CREATE SCHEMA IF NOT EXISTS know;
CREATE SCHEMA IF NOT EXISTS "case";
CREATE SCHEMA IF NOT EXISTS gov;
CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE plat.tenant (
  id text PRIMARY KEY,
  tenant_id text NOT NULL GENERATED ALWAYS AS (id) STORED,
  name text NOT NULL,
  edition text NOT NULL CHECK (edition IN ('community','full'))
);
CREATE TABLE plat.principal (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('operator','technician','shift_lead','reliability_engineer','operations_manager','admin')),
  session_type text NOT NULL CHECK (session_type IN ('human','api_key','agent_token')),
  token_sha256 text NOT NULL UNIQUE,
  site_id text NOT NULL
);
CREATE TABLE ref.site (id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES plat.tenant(id), name text NOT NULL);
CREATE TABLE ref.line (id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES plat.tenant(id), site_id text NOT NULL REFERENCES ref.site(id), name text NOT NULL);
CREATE TABLE ref.station (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES plat.tenant(id), line_id text NOT NULL REFERENCES ref.line(id),
  name text NOT NULL, position int NOT NULL, cycle_time_s numeric NOT NULL, is_bottleneck boolean NOT NULL DEFAULT false,
  last_reading_at timestamptz NOT NULL
);
CREATE TABLE ref.station_link (
  tenant_id text NOT NULL REFERENCES plat.tenant(id), from_station_id text NOT NULL REFERENCES ref.station(id),
  to_station_id text NOT NULL REFERENCES ref.station(id), buffer_minutes numeric, PRIMARY KEY (from_station_id, to_station_id)
);
CREATE TABLE ref.asset (id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES plat.tenant(id), station_id text NOT NULL REFERENCES ref.station(id), name text NOT NULL);
CREATE TABLE ref.sensor (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES plat.tenant(id), asset_id text NOT NULL REFERENCES ref.asset(id),
  name text NOT NULL, unit text NOT NULL, meta text NOT NULL
);
CREATE TABLE know.citation (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES plat.tenant(id), title text NOT NULL, section text NOT NULL,
  version text NOT NULL, effective_from date NOT NULL, verified boolean NOT NULL
);
CREATE TABLE intel.line_impact (
  line_id text PRIMARY KEY REFERENCES ref.line(id), tenant_id text NOT NULL REFERENCES plat.tenant(id),
  cascade jsonb, station_impact jsonb
);
CREATE TABLE intel.trust_assessment (
  sensor_id text PRIMARY KEY REFERENCES ref.sensor(id), tenant_id text NOT NULL REFERENCES plat.tenant(id),
  score numeric, level text NOT NULL, verdict text NOT NULL, verdict_text text NOT NULL,
  checks jsonb NOT NULL, series jsonb NOT NULL, history jsonb NOT NULL, sensor_work_order_id text
);
CREATE TABLE "case".incident (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES plat.tenant(id), title text NOT NULL, state text NOT NULL,
  opened_at timestamptz NOT NULL, rank int, impact text, lead_time jsonb, summary_text text NOT NULL, template_summary text NOT NULL,
  hypotheses jsonb NOT NULL, evidence jsonb NOT NULL, citation_blocked boolean NOT NULL DEFAULT false,
  what_would_change jsonb NOT NULL, citation_ids jsonb NOT NULL, trust_sensor_ids jsonb NOT NULL,
  abstention jsonb, outcome jsonb, trace_id text NOT NULL
);
CREATE TABLE intel.alert_group (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES plat.tenant(id), title text NOT NULL, likely_causes int NOT NULL,
  incident_id text REFERENCES "case".incident(id)
);
CREATE TABLE intel.alert (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES plat.tenant(id), sensor_id text NOT NULL REFERENCES ref.sensor(id),
  line_id text NOT NULL REFERENCES ref.line(id), signal_name text NOT NULL, detail text NOT NULL, status text NOT NULL,
  status_note text, rank int, impact text, lead_time jsonb, group_id text REFERENCES intel.alert_group(id),
  incident_id text REFERENCES "case".incident(id), arrived_at timestamptz NOT NULL, is_synthetic boolean NOT NULL DEFAULT true
);
CREATE TABLE "case".work_order (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES plat.tenant(id), incident_id text NOT NULL REFERENCES "case".incident(id),
  title text NOT NULL, asset_id text NOT NULL REFERENCES ref.asset(id), type text NOT NULL, status text NOT NULL,
  is_draft boolean NOT NULL DEFAULT true CHECK (is_draft), steps jsonb NOT NULL,
  approved_by text, approved_at timestamptz
);
CREATE TABLE "case".approval (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES plat.tenant(id), work_order_id text NOT NULL REFERENCES "case".work_order(id),
  tier int NOT NULL CHECK (tier >= 1), required_role text NOT NULL, rationale text NOT NULL, rule_ids jsonb NOT NULL,
  policy_version text NOT NULL, requested_by text NOT NULL, expires_at timestamptz NOT NULL, status text NOT NULL,
  evidence_summary jsonb NOT NULL, decided_by text, decided_at timestamptz, decision_reason text, audit_event_id text
);
CREATE TABLE gov.audit_event (
  seq bigserial PRIMARY KEY, id text NOT NULL UNIQUE, tenant_id text NOT NULL REFERENCES plat.tenant(id),
  at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL, action text NOT NULL, object text NOT NULL,
  payload jsonb NOT NULL, prev_hash text NOT NULL, hash text NOT NULL
);
CREATE TABLE ops.idempotency_record (
  key text NOT NULL, tenant_id text NOT NULL REFERENCES plat.tenant(id), scope text NOT NULL, response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, scope, key)
);
CREATE TABLE ops.platform_state (
  tenant_id text PRIMARY KEY REFERENCES plat.tenant(id), fallback_level text NOT NULL CHECK (fallback_level IN ('L0','L1','L2','L3','L4','L5')),
  reason text, since timestamptz NOT NULL
);

-- Row-level security on every tenant table (invariant 4).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('plat','ref','intel','know','case','gov','ops') LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I.%I USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true))$p$, t.schemaname, t.tablename);
  END LOOP;
END $$;

-- Token lookup happens before the tenant is known, so it runs as the definer with a narrow result.
CREATE FUNCTION plat.resolve_principal(p_token_sha256 text)
RETURNS TABLE (id text, tenant_id text, display_name text, role text, session_type text, site_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = plat, pg_temp AS $$
  SELECT id, tenant_id, display_name, role, session_type, site_id FROM plat.principal WHERE token_sha256 = p_token_sha256
$$;

-- The only way to append to the audit chain (invariant 3). hash = sha256(prev_hash || canonical payload).
CREATE FUNCTION gov.append_audit(p_actor text, p_action text, p_object text, p_payload jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = gov, pg_temp AS $$
DECLARE
  v_tenant text := current_setting('app.tenant_id', true);
  v_prev text;
  v_id text;
  v_hash text;
BEGIN
  IF v_tenant IS NULL OR v_tenant = '' THEN RAISE EXCEPTION 'tenant context required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('audit:' || v_tenant));
  SELECT hash INTO v_prev FROM gov.audit_event WHERE tenant_id = v_tenant ORDER BY seq DESC LIMIT 1;
  v_prev := coalesce(v_prev, repeat('0', 64));
  v_id := 'AUD-' || lpad((SELECT count(*) + 1 FROM gov.audit_event WHERE tenant_id = v_tenant)::text, 4, '0');
  v_hash := encode(digest(v_prev || p_actor || p_action || p_object || p_payload::text, 'sha256'), 'hex');
  INSERT INTO gov.audit_event (id, tenant_id, actor, action, object, payload, prev_hash, hash)
  VALUES (v_tenant || ':' || v_id, v_tenant, p_actor, p_action, p_object, p_payload, v_prev, v_hash);
  RETURN v_id;
END $$;
