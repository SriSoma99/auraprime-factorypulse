-- Migration 0007: Grants for intelligence services (APP-05 Trust, APP-06 Line Impact, APP-08 Causal).
-- Invariant 4 preserved: all tables enforce row-level security through :app_user (NOBYPASSRLS).

GRANT INSERT, UPDATE, SELECT, DELETE ON intel.trust_assessment, intel.line_impact TO :app_user;
