-- Migration 0009: Integration Surface (API-1..6, MCP-1..9, ADR-008)
-- Implements tables for API gateway tenancy, API keys, usage metering, webhooks, and MCP tool grants/kill switches.
-- All tables enforce Invariant 4 (tenant_id NOT NULL and forced Row-Level Security).

CREATE TABLE IF NOT EXISTS plat.project (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plat.api_key (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  project_id text REFERENCES plat.project(id),
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  rate_limit_per_min int NOT NULL DEFAULT 60,
  monthly_quota int NOT NULL DEFAULT 10000,
  quota_used int NOT NULL DEFAULT 0,
  expires_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE TABLE IF NOT EXISTS plat.usage_event (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  project_id text,
  meter text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  trace_id text,
  ts timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plat.webhook_endpoint (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  url text NOT NULL,
  secret_token text NOT NULL,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plat.webhook_delivery (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  endpoint_id text NOT NULL REFERENCES plat.webhook_endpoint(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  signature text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('pending', 'delivered', 'failed')),
  response_status int,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gov.tool_grant (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  principal_id text NOT NULL,
  tool_name text NOT NULL,
  grant_type text NOT NULL CHECK (grant_type IN ('allow', 'deny')),
  audit_mode text NOT NULL DEFAULT 'full_hash_chained',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gov.tool_kill_switch (
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  tool_name text NOT NULL,
  is_killed boolean NOT NULL DEFAULT false,
  killed_by text,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, tool_name)
);

-- Force Row-Level Security on all newly created tables (Invariant 4)
ALTER TABLE plat.project ENABLE ROW LEVEL SECURITY;
ALTER TABLE plat.project FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON plat.project;
CREATE POLICY tenant_isolation ON plat.project USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE plat.api_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE plat.api_key FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON plat.api_key;
CREATE POLICY tenant_isolation ON plat.api_key USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE plat.usage_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE plat.usage_event FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON plat.usage_event;
CREATE POLICY tenant_isolation ON plat.usage_event USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE plat.webhook_endpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE plat.webhook_endpoint FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON plat.webhook_endpoint;
CREATE POLICY tenant_isolation ON plat.webhook_endpoint USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE plat.webhook_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE plat.webhook_delivery FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON plat.webhook_delivery;
CREATE POLICY tenant_isolation ON plat.webhook_delivery USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gov.tool_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE gov.tool_grant FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON gov.tool_grant;
CREATE POLICY tenant_isolation ON gov.tool_grant USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE gov.tool_kill_switch ENABLE ROW LEVEL SECURITY;
ALTER TABLE gov.tool_kill_switch FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON gov.tool_kill_switch;
CREATE POLICY tenant_isolation ON gov.tool_kill_switch USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Grant access to :app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON plat.project TO :app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON plat.api_key TO :app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON plat.usage_event TO :app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON plat.webhook_endpoint TO :app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON plat.webhook_delivery TO :app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON gov.tool_grant TO :app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON gov.tool_kill_switch TO :app_user;
