// Idempotent writes: a repeated Idempotency-Key returns the stored response instead of acting twice (UI-AC-10).
import type pg from "pg";
import { ProblemError, type Principal } from "./context.ts";

/** Returns the stored response for a repeated Idempotency-Key, or runs fn and stores its response (UI-AC-10). */
export async function idempotent<T>(c: pg.PoolClient, p: Principal, scopeKey: string, key: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!key || key.length < 8) throw new ProblemError(422, "Idempotency-Key header required");
  const seen = await c.query<{ response: T }>("SELECT response FROM ops.idempotency_record WHERE scope = $1 AND key = $2", [scopeKey, key]);
  if (seen.rows[0]) return seen.rows[0].response;
  const out = await fn();
  await c.query("INSERT INTO ops.idempotency_record (key, tenant_id, scope, response) VALUES ($1, $2, $3, $4)", [key, p.tenantId, scopeKey, JSON.stringify(out)]);
  return out;
}
