-- Migration 0016: CostLedger (05 data architecture, ops group; 03 section 14). One row per paid model call, per tenant.
-- The Model Gateway (APP-26) sums it for the budget breaker (FBK-3, NFR-C1); rows are appended, never updated.

CREATE TABLE IF NOT EXISTS ops.cost_ledger (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL,
  model_id text NOT NULL,
  input_tokens integer NOT NULL CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL CHECK (output_tokens >= 0),
  cost_usd numeric(12, 6) NOT NULL CHECK (cost_usd >= 0),
  purpose text NOT NULL
);
CREATE INDEX IF NOT EXISTS cost_ledger_tenant_at ON ops.cost_ledger (tenant_id, at);

ALTER TABLE ops.cost_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.cost_ledger FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON ops.cost_ledger;
CREATE POLICY tenant_isolation ON ops.cost_ledger
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT ON ops.cost_ledger TO :app_user;
GRANT USAGE ON SEQUENCE ops.cost_ledger_id_seq TO :app_user;
