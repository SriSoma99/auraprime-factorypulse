// Connection helpers. Credentials come from secrets named in config (invariant 7).
import pg from "pg";
import { loadConfig, readSecret, findRepoRoot, type Config } from "@fp/config";
import { loadLocalEnv } from "./env.ts";

export function config(): Config {
  const root = findRepoRoot(process.cwd());
  loadLocalEnv(root);
  return loadConfig({ rootDir: root });
}
export function adminPool(cfg: Config): pg.Pool {
  return new pg.Pool({ host: cfg.db.host, port: cfg.db.port, database: cfg.db.name, user: cfg.db.admin_user, password: readSecret(cfg.db.admin_password_secret), max: 2 });
}
export function appPool(cfg: Config): pg.Pool {
  return new pg.Pool({ host: cfg.db.host, port: cfg.db.port, database: cfg.db.name, user: cfg.db.app_user, password: readSecret(cfg.db.app_password_secret), max: cfg.db.pool_max });
}
