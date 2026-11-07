// Layered loader (doc/10 section 4): schema defaults -> edition -> environment -> runtime (env vars).
// Unknown keys and out-of-range values fail at load (doc/10 section 5, "Schema first").
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { configSchema, type Config } from "./schema.ts";

type Json = Record<string, unknown>;
const ENV_PREFIX = "FP_CFG__"; // FP_CFG__api__port=4011 overrides api.port

function isObject(v: unknown): v is Json { return typeof v === "object" && v !== null && !Array.isArray(v); }
function merge(a: Json, b: Json): Json {
  const out: Json = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObject(v) && isObject(out[k]) ? merge(out[k] as Json, v) : v;
  return out;
}
function readProfile(path: string): Json {
  if (!existsSync(path)) return {};
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isObject(parsed)) throw new Error(`config profile ${path} must be a JSON object`);
  return parsed;
}
function envOverrides(env: NodeJS.ProcessEnv): Json {
  let out: Json = {};
  for (const [name, raw] of Object.entries(env)) {
    if (!name.startsWith(ENV_PREFIX) || raw === undefined) continue;
    const path = name.slice(ENV_PREFIX.length).split("__");
    let value: unknown;
    try { value = JSON.parse(raw); } catch { value = raw; }
    const leaf = path.reduceRight<unknown>((acc, part) => ({ [part]: acc }), value);
    out = merge(out, leaf as Json);
  }
  return out;
}

export interface LoadOptions { rootDir: string; env?: NodeJS.ProcessEnv }

export function loadConfig({ rootDir, env = process.env }: LoadOptions): Config {
  const runtime = envOverrides(env);
  const base = configSchema.parse({});
  // config/build.json names the edition this repository builds (private repo: full; Community export: community).
  const build = readProfile(join(rootDir, "config", "build.json"));
  const edition = (runtime.edition as string | undefined) ?? (build.edition as string | undefined) ?? base.edition;
  const environment = (runtime.environment as string | undefined) ?? base.environment;
  const layered = [
    build,
    readProfile(join(rootDir, "config", "editions", `${edition}.json`)),
    readProfile(join(rootDir, "config", "environments", `${environment}.json`)),
    runtime,
  ].reduce(merge, {} as Json);
  const result = configSchema.safeParse(layered);
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`invalid configuration: ${issues}`);
  }
  const cfg = result.data;
  // Invariant guard: mock controls exist only in the local environment (doc/10 section 3: config may tighten, never loosen).
  if (cfg.mock.controls_enabled && cfg.environment !== "local") {
    throw new Error("invalid configuration: mock.controls_enabled is only allowed in the local environment");
  }
  // Invariant guard: degraded levels may raise the minimum approval tier but never lower it below the shipped default.
  const floor = configSchema.parse({}).policy.min_tier_by_level;
  for (const level of Object.keys(floor) as Array<keyof typeof floor>) {
    if (cfg.policy.min_tier_by_level[level] < floor[level]) {
      throw new Error(`invalid configuration: policy.min_tier_by_level.${level} may not be lowered below ${floor[level]}`);
    }
  }
  return cfg;
}

/** Resolve a secret by the environment variable name held in config (invariant 7). */
export function readSecret(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (!value) throw new Error(`secret ${name} is not set in the environment`);
  return value;
}
