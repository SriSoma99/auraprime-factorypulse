-- Service role: no RLS bypass, read and write only where the UI needs it; audit is append-only via function.
GRANT USAGE ON SCHEMA plat, ref, intel, know, "case", gov, ops TO :app_user;
GRANT SELECT ON ALL TABLES IN SCHEMA plat, ref, intel, know, "case", ops TO :app_user;
GRANT UPDATE (status, steps, approved_by, approved_at) ON "case".work_order TO :app_user;
GRANT UPDATE (status, decided_by, decided_at, decision_reason, audit_event_id) ON "case".approval TO :app_user;
GRANT UPDATE (state, outcome) ON "case".incident TO :app_user;
GRANT UPDATE (fallback_level, reason, since) ON ops.platform_state TO :app_user;
GRANT INSERT ON ops.idempotency_record TO :app_user;
GRANT SELECT ON gov.audit_event TO :app_user;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON gov.audit_event FROM :app_user;
GRANT EXECUTE ON FUNCTION plat.resolve_principal(text), gov.append_audit(text, text, text, jsonb) TO :app_user;
