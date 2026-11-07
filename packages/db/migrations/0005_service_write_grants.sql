-- Migration 0005: Service write grants for backend detection and agent workflows.
-- Invariant 4 preserved: all tables enforce row-level security through :app_user (NOBYPASSRLS).

GRANT INSERT, UPDATE, SELECT ON intel.alert, intel.alert_group TO :app_user;
GRANT INSERT, UPDATE, SELECT ON "case".incident, "case".work_order, "case".approval TO :app_user;
