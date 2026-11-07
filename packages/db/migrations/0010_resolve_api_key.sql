-- Migration 0010: SECURITY DEFINER function for API key resolution across tenants before tenant_id context is established.
-- Follows identical pattern as plat.resolve_principal in 0001_schema.sql.

CREATE OR REPLACE FUNCTION plat.resolve_api_key(p_key_hash text)
RETURNS TABLE (
  id text,
  tenant_id text,
  project_id text,
  name text,
  key_prefix text,
  scopes jsonb,
  rate_limit_per_min int,
  monthly_quota int,
  quota_used int,
  expires_at timestamptz,
  revoked boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = plat, pg_temp AS $$
  SELECT id, tenant_id, project_id, name, key_prefix, scopes, rate_limit_per_min, monthly_quota, quota_used, expires_at, revoked
  FROM plat.api_key
  WHERE key_hash = p_key_hash
$$;

GRANT EXECUTE ON FUNCTION plat.resolve_api_key(text) TO :app_user;
