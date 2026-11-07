import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, readSecret } from "./load.ts";

function root(profiles: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "fpcfg-"));
  mkdirSync(join(dir, "config", "editions"), { recursive: true });
  mkdirSync(join(dir, "config", "environments"), { recursive: true });
  for (const [rel, body] of Object.entries(profiles)) writeFileSync(join(dir, "config", rel), JSON.stringify(body));
  return dir;
}

describe("loadConfig", () => {
  it("returns schema defaults with no profiles", () => {
    const cfg = loadConfig({ rootDir: root(), env: {} });
    expect(cfg.edition).toBe("community");
    expect(cfg.mock.controls_enabled).toBe(false);
  });
  it("applies environment profile then env-var overrides", () => {
    const cfg = loadConfig({ rootDir: root({ "environments/local.json": { api: { port: 5000 } } }), env: { FP_CFG__api__port: "5001" } });
    expect(cfg.api.port).toBe(5001);
  });
  it("rejects out-of-range values", () => {
    expect(() => loadConfig({ rootDir: root(), env: { FP_CFG__api__port: "70000" } })).toThrow(/api.port/);
  });
  it("rejects unknown keys", () => {
    expect(() => loadConfig({ rootDir: root({ "environments/local.json": { nope: 1 } }), env: {} })).toThrow(/invalid configuration/);
  });
  it("refuses mock controls outside local", () => {
    expect(() => loadConfig({ rootDir: root(), env: { FP_CFG__environment: "public-demo", FP_CFG__mock__controls_enabled: "true" } })).toThrow(/only allowed in the local/);
  });
  it("rejects a secret written as a value instead of a name", () => {
    expect(() => loadConfig({ rootDir: root(), env: { FP_CFG__db__app_password_secret: "hunter2" } })).toThrow(/environment variable name/);
  });
  it("refuses to lower the minimum approval tier at a degraded level", () => {
    expect(() => loadConfig({ rootDir: root(), env: { FP_CFG__policy__min_tier_by_level: JSON.stringify({ L0: 1, L1: 1, L2: 1, L3: 1, L4: 2, L5: 2 }) } })).toThrow(/may not be lowered/);
  });
  it("reads secrets by name", () => {
    expect(readSecret("X_SECRET", { X_SECRET: "v" })).toBe("v");
    expect(() => readSecret("MISSING", {})).toThrow(/not set/);
  });
});
