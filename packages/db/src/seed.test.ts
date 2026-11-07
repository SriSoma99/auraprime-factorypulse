// Reset during live telemetry: seeding while the stream processor inserts readings must not deadlock (found 2026-11-05).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type pg from "pg";
import { config, appPool, adminPool } from "./connect.ts";
import { seed } from "./seed.ts";

const cfg = config();
let app: pg.Pool; let admin: pg.Pool;
beforeAll(() => { app = appPool(cfg); admin = adminPool(cfg); });
afterAll(async () => { await seed(admin, cfg); await app.end(); await admin.end(); });

/** Inserts readings the way APP-03 does (tenant transaction, FK to ref.sensor) until stopped; returns any non-FK error. */
async function writer(stop: { done: boolean }): Promise<Error | null> {
  while (!stop.done) {
    const c = await app.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.tenant_id', 't-demo', true)");
      await c.query("INSERT INTO tel.telemetry_point (tenant_id, sensor_id, ts, value) VALUES ('t-demo', 'S-01-SPD', now(), 5900)");
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      // While the registry is empty mid-reset a reading can fail its foreign key; that is expected and safe.
      if (!/foreign key|violates/.test((e as Error).message)) return e as Error;
    } finally { c.release(); }
  }
  return null;
}

describe("seed", () => {
  it("resets repeatedly while readings are being written, without deadlock", async () => {
    const stop = { done: false };
    const writers = [writer(stop), writer(stop), writer(stop)];
    try {
      for (let k = 0; k < 5; k++) await seed(admin, cfg);
    } finally { stop.done = true; }
    expect(await Promise.all(writers)).toEqual([null, null, null]);
  }, 60_000);
});
