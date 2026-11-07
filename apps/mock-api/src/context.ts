// Shared request context: config, pools, mock clock, and the tenant-scoped transaction helper (invariant 4).
import type pg from "pg";
import type { Config } from "@fp/config";

export interface Principal { id: string; tenantId: string; displayName: string; role: Role; sessionType: "human" | "api_key" | "agent_token"; siteId: string }
export type Role = "operator" | "technician" | "shift_lead" | "reliability_engineer" | "operations_manager" | "admin";
export type Level = "L0" | "L1" | "L2" | "L3" | "L4" | "L5";

export interface Ctx {
  cfg: Config;
  app: pg.Pool;
  admin: pg.Pool;
  /** Mock clock: fixed at synthetic.reference_time so screens and tests are stable. */
  now(): Date;
  /** Wall clock for live telemetry health: readings arrive in real time from the simulator or OTLP replay (ING-12). */
  telemetryNow(): Date;
}

/** Runs fn in a transaction with app.tenant_id set, so row-level security scopes every query. */
export async function withTenant<T>(ctx: Ctx, tenantId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await ctx.app.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}

/** RFC 9457 problem details. */
export class ProblemError extends Error {
  /** extra adds members to the problem body, such as the list of upload problems (RFC 9457 extension members). */
  constructor(readonly status: number, readonly title: string, readonly detail?: string, readonly extra?: Record<string, unknown>) { super(detail ?? title); }
}
