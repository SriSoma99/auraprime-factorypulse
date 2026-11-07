// Integration test against the local database (pnpm local:up && pnpm db:reset first).
// Proves invariant 4 (tenant isolation through RLS) and invariant 3 (audit append-only via the writer function).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type pg from "pg";
import { config, appPool } from "./connect.ts";

let pool: pg.Pool;
async function asTenant<T>(tenant: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    if (tenant) await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
    const r = await fn(c); await c.query("ROLLBACK"); return r;
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}

beforeAll(() => { pool = appPool(config()); });
afterAll(async () => { await pool.end(); });

describe("row-level security (invariant 4)", () => {
  it("shows a tenant only its own alerts", async () => {
    const ids = await asTenant("t-demo", async c => (await c.query<{ id: string }>("SELECT id FROM intel.alert")).rows.map(r => r.id));
    expect(ids).toContain("AL-1001");
    expect(ids).not.toContain("AL-X01");
  });
  it("shows nothing without a tenant context", async () => {
    const n = await asTenant(null, async c => (await c.query("SELECT id FROM intel.alert")).rowCount);
    expect(n).toBe(0);
  });
  it("cannot update another tenant's rows", async () => {
    const n = await asTenant("t-demo", async c => (await c.query("UPDATE \"case\".approval SET status = 'approved' WHERE tenant_id = 't-acme'")).rowCount);
    expect(n).toBe(0);
  });
});

describe("audit chain (invariant 3)", () => {
  it("rejects direct inserts by the service role", async () => {
    await expect(asTenant("t-demo", c => c.query("INSERT INTO gov.audit_event (id, tenant_id, actor, action, object, payload, prev_hash, hash) VALUES ('x','t-demo','a','b','c','{}','0','0')"))).rejects.toThrow(/permission denied/);
  });
  it("links each event to the previous hash", async () => {
    const a1 = `test.one.${Date.now()}`;
    const a2 = `test.two.${Date.now()}`;
    const rows = await asTenant("t-demo", async c => {
      await c.query("SELECT gov.append_audit('tester', $1::text, 'X', '{}'::jsonb)", [a1]);
      await c.query("SELECT gov.append_audit('tester', $1::text, 'X', '{}'::jsonb)", [a2]);
      return (await c.query<{ prev_hash: string; hash: string }>(
        "SELECT prev_hash, hash FROM gov.audit_event WHERE action IN ($1::text, $2::text) ORDER BY seq",
        [a1, a2]
      )).rows;
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]!.prev_hash).toBe(rows[0]!.hash);
  });
});
