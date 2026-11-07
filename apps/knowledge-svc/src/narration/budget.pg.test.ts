// The CostLedger and the published fallback level in PostgreSQL (APP-26; 03 sections 13.3 and 13.4; FBK-3, invariants 3 and 4).
// Uses the dedicated test tenant 't-test' (migration 0011) and restores its platform state afterwards.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { config, appPool, adminPool } from "@fp/db";
import { configSchema } from "@fp/config";
import { GATEWAY_REASON_TAG, ModelGuard, PgLevelPublisher, PgSpendStore } from "./budget.js";

const TENANT = "t-test";
const OTHER = "t-demo";
const cfg = config();
const app = appPool(cfg);
const admin = adminPool(cfg);
const model = configSchema.parse({}).model;

async function setState(level: string, reason: string | null, sinceMsAgo: number) {
  await admin.query("UPDATE ops.platform_state SET fallback_level = $1, reason = $2, since = now() - make_interval(secs => $3 / 1000.0) WHERE tenant_id = $4",
    [level, reason, sinceMsAgo, TENANT]);
}
const state = async () => (await admin.query<{ fallback_level: string; reason: string | null }>(
  "SELECT fallback_level, reason FROM ops.platform_state WHERE tenant_id = $1", [TENANT])).rows[0]!;
const auditCount = async () => Number((await admin.query<{ n: string }>(
  "SELECT count(*) AS n FROM gov.audit_event WHERE tenant_id = $1 AND action = 'fallback.level'", [TENANT])).rows[0]!.n);

beforeEach(async () => {
  await admin.query("DELETE FROM ops.cost_ledger WHERE tenant_id IN ($1, $2)", [TENANT, OTHER]);
  await setState("L0", null, 0);
});
afterAll(async () => {
  await admin.query("DELETE FROM ops.cost_ledger WHERE tenant_id IN ($1, $2)", [TENANT, OTHER]);
  await setState("L0", null, 0);
  await app.end(); await admin.end();
});

describe("PgSpendStore", () => {
  it("sums today's and total spend for the tenant only (row-level security, invariant 4)", async () => {
    const store = new PgSpendStore(app);
    await store.record(TENANT, { provider: "anthropic", modelId: "claude-opus-5-5", usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 0.25, purpose: "narration" });
    await store.record(OTHER, { provider: "anthropic", modelId: "claude-opus-5-5", usage: { inputTokens: 10, outputTokens: 5 }, costUsd: 9, purpose: "narration" });
    await admin.query("INSERT INTO ops.cost_ledger (tenant_id, at, provider, model_id, input_tokens, output_tokens, cost_usd, purpose) VALUES ($1, now() - interval '3 days', 'anthropic', 'claude-opus-5-5', 1, 1, 1.5, 'narration')", [TENANT]);
    expect(await store.spend(TENANT)).toEqual({ todayUsd: 0.25, totalUsd: 1.75 });
  });
  it("cannot write a row for another tenant", async () => {
    const c = await app.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.tenant_id', $1, true)", [TENANT]);
      await expect(c.query("INSERT INTO ops.cost_ledger (tenant_id, provider, model_id, input_tokens, output_tokens, cost_usd, purpose) VALUES ($1, 'x', 'y', 0, 0, 0, 'z')", [OTHER])).rejects.toThrow();
    } finally { await c.query("ROLLBACK"); c.release(); }
  });
});

describe("PgLevelPublisher", () => {
  it("escalates at once, tags the reason, and appends one audit event through APP-20 (invariant 3)", async () => {
    const before = await auditCount();
    await new PgLevelPublisher(app, () => model.breaker.recovery_hysteresis_ms).reconcile(TENANT, "L2", "daily model budget spent");
    expect(await state()).toEqual({ fallback_level: "L2", reason: `${GATEWAY_REASON_TAG} daily model budget spent` });
    expect(await auditCount()).toBe(before + 1);
  });
  it("never lowers a level it did not set", async () => {
    await setState("L3", "retrieval index stale", 10 * model.breaker.recovery_hysteresis_ms);
    await new PgLevelPublisher(app, () => model.breaker.recovery_hysteresis_ms).reconcile(TENANT, "L0", "model budgets healthy");
    expect((await state()).fallback_level).toBe("L3");
  });
  it("recovers its own level one step at a time, only after the hysteresis window", async () => {
    const p = new PgLevelPublisher(app, () => model.breaker.recovery_hysteresis_ms);
    await setState("L2", `${GATEWAY_REASON_TAG} total model budget spent`, 0);
    await p.reconcile(TENANT, "L0", "model budgets healthy");
    expect((await state()).fallback_level).toBe("L2");
    await setState("L2", `${GATEWAY_REASON_TAG} total model budget spent`, model.breaker.recovery_hysteresis_ms);
    await p.reconcile(TENANT, "L0", "model budgets healthy");
    expect((await state()).fallback_level).toBe("L1");
  });
});

describe("ModelGuard on PostgreSQL", () => {
  it("refuses a paid call once the tenant's ledger reaches the total budget, and publishes L2", async () => {
    const guard = new ModelGuard(() => model, new PgSpendStore(app), new PgLevelPublisher(app, () => model.breaker.recovery_hysteresis_ms));
    await new PgSpendStore(app).record(TENANT, { provider: "anthropic", modelId: "claude-opus-5-5", usage: { inputTokens: 1, outputTokens: 1 }, costUsd: model.budget.total_usd, purpose: "narration" });
    expect(await guard.admit(TENANT, "anthropic")).toMatchObject({ allowed: false, level: "L2", refusal: "budget_exhausted" });
    expect((await state()).fallback_level).toBe("L2");
  });
});
