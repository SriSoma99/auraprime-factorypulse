// Budget breaker and provider circuit breaker of the Model Gateway (APP-26; 03 sections 13.4 and 14; FBK-3, AGT-6, NFR-C1).
// Spend comes from the CostLedger in PostgreSQL, so a restart cannot reset it. Budget warning moves narration to L1,
// exhaustion or an open provider circuit to L2. The breaker only touches narration: detection and alerting never call it.
import type pg from "pg";
import type { Config } from "@fp/config";
import type { TokenUsage } from "./types.js";

type ModelCfg = Config["model"];
export type GatewayLevel = "L0" | "L1" | "L2";

const RANK: Record<string, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4, L5: 5 };
const STEP_UP: Record<string, GatewayLevel> = { L2: "L1", L1: "L0" };
/** Marks a fallback level the Model Gateway set, so it recovers only what it set and never a level set by people or other services. */
export const GATEWAY_REASON_TAG = "[model-gateway]";

export interface Spend { todayUsd: number; totalUsd: number }

/** Cost of one call at the price of the model that served it; an unpriced model is charged the deliberately high fallback price. */
export function costOf(cfg: ModelCfg, modelId: string, usage: TokenUsage): number {
  const price = cfg.pricing[modelId] ?? cfg.unknown_model_price;
  return (usage.inputTokens * price.input_usd_per_mtok + usage.outputTokens * price.output_usd_per_mtok) / 1_000_000;
}

/** Usage to charge when a provider does not report it: the whole output ceiling, and the prompt at one token per two characters. */
export function conservativeUsage(promptChars: number, maxOutputTokens: number): TokenUsage {
  return { inputTokens: Math.ceil(promptChars / 2), outputTokens: maxOutputTokens };
}

/** The level the budgets allow (03 section 13.4): L2 once any budget is spent, L1 from the warning share, else L0. */
export function budgetLevel(b: ModelCfg["budget"], spend: Spend): { level: GatewayLevel; reason: string } {
  const usd = (n: number) => `USD ${n.toFixed(2)}`;
  if (spend.totalUsd >= b.total_usd) return { level: "L2", reason: `total model budget spent (${usd(spend.totalUsd)} of ${usd(b.total_usd)})` };
  if (spend.todayUsd >= b.daily_usd) return { level: "L2", reason: `daily model budget spent (${usd(spend.todayUsd)} of ${usd(b.daily_usd)})` };
  if (spend.totalUsd >= b.total_usd * b.warn_fraction) return { level: "L1", reason: `total model budget at warning (${usd(spend.totalUsd)} of ${usd(b.total_usd)})` };
  if (spend.todayUsd >= b.daily_usd * b.warn_fraction) return { level: "L1", reason: `daily model budget at warning (${usd(spend.todayUsd)} of ${usd(b.daily_usd)})` };
  return { level: "L0", reason: "model budgets healthy" };
}

/** Per-provider circuit (03 section 14): closed, open after repeated failures, half-open for one trial call after the timeout. */
export class ProviderCircuit {
  private failures = 0;
  private openedAt: number | null = null;
  private trialInFlight = false;

  constructor(private readonly cfg: () => ModelCfg["breaker"], private readonly now: () => number = Date.now) {}

  state(): "closed" | "open" | "half-open" {
    if (this.openedAt === null) return "closed";
    return this.now() - this.openedAt >= this.cfg().reset_timeout_ms ? "half-open" : "open";
  }

  /** Whether a call may go out now. In half-open state only one trial call is let through at a time. */
  tryAcquire(): boolean {
    const s = this.state();
    if (s === "closed") return true;
    if (s === "open" || this.trialInFlight) return false;
    this.trialInFlight = true;
    return true;
  }

  success(): void { this.failures = 0; this.openedAt = null; this.trialInFlight = false; }

  failure(): void {
    this.trialInFlight = false;
    this.failures += 1;
    if (this.openedAt !== null || this.failures >= this.cfg().failure_threshold) this.openedAt = this.now();
  }
}

/** Where spend is kept. The PostgreSQL store is the real one; tests may use another. */
export interface SpendStore {
  spend(tenantId: string): Promise<Spend>;
  record(tenantId: string, entry: { provider: string; modelId: string; usage: TokenUsage; costUsd: number; purpose: string }): Promise<void>;
}

/** Publishes the gateway's level to the tenant's platform state, the UI banner and the audit chain (03 section 13.3). */
export interface LevelPublisher {
  reconcile(tenantId: string, wanted: GatewayLevel, reason: string): Promise<void>;
}

async function inTenant<T>(pool: pg.Pool, tenantId: string, work: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const out = await work(c);
    await c.query("COMMIT");
    return out;
  } catch (err) {
    await c.query("ROLLBACK");
    throw err;
  } finally {
    c.release();
  }
}

export class PgSpendStore implements SpendStore {
  constructor(private readonly pool: pg.Pool) {}

  spend(tenantId: string): Promise<Spend> {
    return inTenant(this.pool, tenantId, async c => {
      const r = await c.query<{ today: string | null; total: string | null }>(
        `SELECT coalesce(sum(cost_usd) FILTER (WHERE at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 0) AS today,
                coalesce(sum(cost_usd), 0) AS total
           FROM ops.cost_ledger`);
      return { todayUsd: Number(r.rows[0]?.today ?? 0), totalUsd: Number(r.rows[0]?.total ?? 0) };
    });
  }

  async record(tenantId: string, e: { provider: string; modelId: string; usage: TokenUsage; costUsd: number; purpose: string }): Promise<void> {
    await inTenant(this.pool, tenantId, c => c.query(
      `INSERT INTO ops.cost_ledger (tenant_id, provider, model_id, input_tokens, output_tokens, cost_usd, purpose)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, e.provider, e.modelId, e.usage.inputTokens, e.usage.outputTokens, e.costUsd, e.purpose]));
  }
}

export class PgLevelPublisher implements LevelPublisher {
  constructor(private readonly pool: pg.Pool, private readonly hysteresisMs: () => number, private readonly now: () => number = Date.now) {}

  /**
   * Escalation is immediate. Recovery happens only for a level this gateway set, one step at a time, after the hysteresis window.
   * A level set by an operator or another service (L3 to L5, or an untagged reason) is never lowered here.
   */
  reconcile(tenantId: string, wanted: GatewayLevel, reason: string): Promise<void> {
    return inTenant(this.pool, tenantId, async c => {
      const r = await c.query<{ fallback_level: string; reason: string | null; since: Date }>(
        "SELECT fallback_level, reason, since FROM ops.platform_state WHERE tenant_id = $1 FOR UPDATE", [tenantId]);
      const cur = r.rows[0];
      if (!cur) return;
      let next: string | null = null;
      if (RANK[wanted]! > RANK[cur.fallback_level]!) next = wanted;
      else if (RANK[wanted]! < RANK[cur.fallback_level]! && (cur.reason ?? "").startsWith(GATEWAY_REASON_TAG)
        && this.now() - cur.since.getTime() >= this.hysteresisMs()) next = STEP_UP[cur.fallback_level] ?? null;
      if (!next) return;
      const text = `${GATEWAY_REASON_TAG} ${next === "L0" ? "recovered" : reason}`;
      await c.query("UPDATE ops.platform_state SET fallback_level = $1, reason = $2, since = now() WHERE tenant_id = $3", [next, text, tenantId]);
      // Invariant 3: the audit chain is appended only through the APP-20 database function (ADR-033).
      await c.query("SELECT gov.append_audit($1, $2, $3, $4::jsonb)",
        ["APP-26 model gateway", "fallback.level", next, JSON.stringify({ from: cur.fallback_level, to: next, reason })]);
    });
  }
}

/** What the gateway decides before a paid call. */
export interface Admission { allowed: boolean; level: GatewayLevel; maxOutputTokens: number; refusal?: "budget_exhausted" | "provider_circuit_open" }

/** Combines the budgets, the per-provider circuits, the ledger and the published level for every paid narration call. */
export class ModelGuard {
  private readonly circuits = new Map<string, ProviderCircuit>();

  constructor(
    private readonly cfg: () => ModelCfg,
    private readonly store: SpendStore,
    private readonly publisher: LevelPublisher,
    private readonly now: () => number = Date.now,
  ) {}

  private circuit(provider: string): ProviderCircuit {
    let c = this.circuits.get(provider);
    if (!c) { c = new ProviderCircuit(() => this.cfg().breaker, this.now); this.circuits.set(provider, c); }
    return c;
  }

  private async settle(tenantId: string, provider: string): Promise<{ level: GatewayLevel; reason: string }> {
    const budget = budgetLevel(this.cfg().budget, await this.store.spend(tenantId));
    const open = this.circuit(provider).state() === "open";
    const wanted = open && budget.level !== "L2" ? { level: "L2" as const, reason: `${provider} provider failing; circuit open` } : budget;
    await this.publisher.reconcile(tenantId, wanted.level, wanted.reason);
    return wanted;
  }

  async admit(tenantId: string, provider: string): Promise<Admission> {
    const cfg = this.cfg();
    const { level } = await this.settle(tenantId, provider);
    if (level === "L2") {
      return { allowed: false, level, maxOutputTokens: 0, refusal: this.circuit(provider).state() === "open" ? "provider_circuit_open" : "budget_exhausted" };
    }
    if (!this.circuit(provider).tryAcquire()) return { allowed: false, level: "L2", maxOutputTokens: 0, refusal: "provider_circuit_open" };
    return { allowed: true, level, maxOutputTokens: level === "L1" ? Math.min(cfg.max_output_tokens, cfg.budget.l1_max_output_tokens) : cfg.max_output_tokens };
  }

  async succeeded(tenantId: string, provider: string, modelId: string, usage: TokenUsage, purpose: string): Promise<void> {
    this.circuit(provider).success();
    await this.store.record(tenantId, { provider, modelId, usage, costUsd: costOf(this.cfg(), modelId, usage), purpose });
    await this.settle(tenantId, provider);
  }

  async failed(tenantId: string, provider: string): Promise<void> {
    this.circuit(provider).failure();
    await this.settle(tenantId, provider);
  }
}

export function pgModelGuard(cfg: () => ModelCfg, pool: pg.Pool): ModelGuard {
  return new ModelGuard(cfg, new PgSpendStore(pool), new PgLevelPublisher(pool, () => cfg().breaker.recovery_hysteresis_ms));
}
