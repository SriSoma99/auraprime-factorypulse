-- Migration 0013: per-tenant role screen access and role assignment by tenant admins (NFR-S6, ADR-040).
-- Defaults come from config rbac.screens; a row here overrides one role's access to one screen for one tenant.
-- Approval rights are not stored here: they stay with config policy.role_max_tier and invariant 2.

CREATE TABLE IF NOT EXISTS plat.role_permission (
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  role text NOT NULL CHECK (role IN ('operator','technician','shift_lead','reliability_engineer','operations_manager','admin')),
  screen text NOT NULL,
  access text NOT NULL CHECK (access IN ('none','view','use')),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, role, screen),
  -- No lockout: the admin role always keeps use access to the admin screen.
  CHECK (NOT (role = 'admin' AND screen = 'admin' AND access <> 'use'))
);

ALTER TABLE plat.role_permission ENABLE ROW LEVEL SECURITY;
ALTER TABLE plat.role_permission FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON plat.role_permission;
CREATE POLICY tenant_isolation ON plat.role_permission
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON plat.role_permission TO :app_user;

-- Tenant admins assign roles to their own users; only the role column, and row-level security keeps it in the tenant.
GRANT UPDATE (role) ON plat.principal TO :app_user;
