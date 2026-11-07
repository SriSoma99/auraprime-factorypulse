-- Use the built-in sha256() so the writer does not depend on an extension outside its locked search path.
CREATE OR REPLACE FUNCTION gov.append_audit(p_actor text, p_action text, p_object text, p_payload jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = gov, pg_catalog, pg_temp AS $$
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
  v_hash := encode(sha256(convert_to(v_prev || p_actor || p_action || p_object || p_payload::text, 'UTF8')), 'hex');
  INSERT INTO gov.audit_event (id, tenant_id, actor, action, object, payload, prev_hash, hash)
  VALUES (v_tenant || ':' || v_id, v_tenant, p_actor, p_action, p_object, p_payload, v_prev, v_hash);
  RETURN v_id;
END $$;
