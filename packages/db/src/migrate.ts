import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { readSecret, type Config } from "@fp/config";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const ident = (s: string) => `"${s.replaceAll('"', '""')}"`;
const literal = (s: string) => `'${s.replaceAll("'", "''")}'`;

export async function migrate(pool: pg.Pool, cfg: Config): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS meta; CREATE TABLE IF NOT EXISTS meta.schema_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const appUser = cfg.db.app_user; const appPassword = readSecret(cfg.db.app_password_secret);
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${literal(appUser)}) THEN
        CREATE ROLE ${ident(appUser)} LOGIN NOBYPASSRLS PASSWORD ${literal(appPassword)};
      ELSE
        ALTER ROLE ${ident(appUser)} LOGIN NOBYPASSRLS PASSWORD ${literal(appPassword)};
      END IF; END $$`);
    const done = new Set((await client.query<{ name: string }>("SELECT name FROM meta.schema_migration")).rows.map(r => r.name));
    for (const file of readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) {
      if (done.has(file)) continue;
      const sql = readFileSync(join(dir, file), "utf8").replaceAll(":app_user", ident(appUser));
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO meta.schema_migration (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (e) { await client.query("ROLLBACK"); throw new Error(`migration ${file} failed: ${(e as Error).message}`); }
    }
  } finally { client.release(); }
  return applied;
}
