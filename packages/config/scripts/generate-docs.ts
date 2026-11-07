// Generates doc/config/keys.md from the schema so the reference never drifts from code.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { configSchema, configKeyMeta } from "../src/schema.ts";
import { findRepoRoot } from "../src/root.ts";

function describe(schema: z.ZodTypeAny): { type: string; range: string; def: unknown } {
  let s = schema; let def: unknown;
  if (s instanceof z.ZodDefault) { def = s._def.defaultValue(); s = s._def.innerType; }
  if (s instanceof z.ZodNumber) {
    const checks = s._def.checks as Array<{ kind: string; value?: number }>;
    const min = checks.find(c => c.kind === "min")?.value; const max = checks.find(c => c.kind === "max")?.value;
    const int = checks.some(c => c.kind === "int");
    return { type: int ? "integer" : "number", range: `${min ?? "-"} to ${max ?? "-"}`, def };
  }
  if (s instanceof z.ZodEnum) return { type: "enum", range: (s.options as string[]).join(", "), def };
  if (s instanceof z.ZodBoolean) return { type: "boolean", range: "true, false", def };
  if (s instanceof z.ZodArray) return { type: "list of URL", range: "-", def };
  if (s instanceof z.ZodString) {
    const checks = s._def.checks as Array<{ kind: string; regex?: RegExp }>;
    const kinds = checks.map(c => c.kind);
    if (kinds.includes("url")) return { type: "URL", range: "-", def };
    if (kinds.includes("datetime")) return { type: "ISO date-time", range: "-", def };
    const rx = checks.find(c => c.kind === "regex")?.regex;
    return { type: "string", range: rx ? `\`${rx.source}\`` : "non-empty", def };
  }
  return { type: "map", range: "see default", def };
}

function walk(schema: z.ZodTypeAny, prefix: string, rows: string[]): void {
  let s = schema; if (s instanceof z.ZodDefault) s = s._def.innerType;
  if (s instanceof z.ZodObject && !configKeyMeta.has(prefix)) {
    for (const [k, v] of Object.entries(s.shape as Record<string, z.ZodTypeAny>)) walk(v, prefix ? `${prefix}.${k}` : k, rows);
    return;
  }
  const meta = configKeyMeta.get(prefix);
  if (!meta) throw new Error(`config key ${prefix} has no metadata`);
  const d = describe(schema);
  rows.push(`| \`${prefix}\` | ${d.type} | ${d.range} | \`${JSON.stringify(d.def)}\` | ${meta.reload} | ${meta.owner} | ${meta.description} |`);
}

const rows: string[] = []; walk(configSchema, "", rows);
const root = findRepoRoot(process.cwd());
const out = `---
title: Configuration key reference
status: draft
edition: community
related:
  - ../10-configuration.md
  - ../adr/ADR-030-ui-first-mock-backend.md
---

# Configuration key reference

Generated from \`packages/config/src/schema.ts\` by \`pnpm config:docs\`. Do not edit by hand.

Layers, lowest to highest (doc/10 section 4): schema default, \`config/editions/<edition>.json\`, \`config/environments/<environment>.json\`, runtime environment variables named \`FP_CFG__<group>__<key>\`. Secrets are referenced by environment variable name only (invariant 7).

| Key | Type | Range | Default | Reload | Owner | Description |
|---|---|---|---|---|---|---|
${rows.join("\n")}
`;
mkdirSync(join(root, "doc", "config"), { recursive: true });
writeFileSync(join(root, "doc", "config", "keys.md"), out);
console.log(`wrote ${rows.length} keys to doc/config/keys.md`);
