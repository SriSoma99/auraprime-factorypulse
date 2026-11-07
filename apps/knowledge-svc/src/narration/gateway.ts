// APP-26 narration gateway (ADR-038): the guards every provider shares, applied before and after the adapter.
// Restricted chunks, degraded levels, missing evidence, a missing key or any provider failure all give the local template.
import type { Config } from "@fp/config";
import { AnthropicNarration } from "./anthropic.js";
import { GeminiNarration } from "./gemini.js";
import { localAnswer, LOCAL_MODEL_ID } from "./local.js";
import { conservativeUsage, type ModelGuard } from "./budget.js";
import type { FallbackReason, NarrationModel, NarrationRequest, NarrationResult } from "./types.js";

/** Levels at which no model is called: L2 to L5 all narrate with the cited template (03 section 13). */
export const NO_MODEL_LEVELS: ReadonlySet<string> = new Set(["L2", "L3", "L4", "L5"]);

/** Redaction at the model boundary (cross-cutting rule): contact details and addresses never leave. */
export function redact(text: string): string {
  return text
    .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, "[REDACTED_EMAIL]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[REDACTED_IP]")
    .replace(/\+?\d[\d ()-]{8,}\d/g, "[REDACTED_PHONE]");
}

export function buildUserTurn(req: NarrationRequest): string {
  const excerpts = req.chunks.map((c, i) =>
    `<excerpt index="${i + 1}" document="${c.citation_id}" title="${redact(c.title)}" section="${redact(c.section)}" version="${c.version}">\n${redact(c.content)}\n</excerpt>`).join("\n");
  return `<excerpts>\n${excerpts}\n</excerpts>\n\nQuestion: ${redact(req.question)}`;
}

export type SecretReader = (name: string) => string | undefined;
const envSecret: SecretReader = name => process.env[name] || undefined;

/** The configured adapter, or the reason none can be used. The key is read by name at call time and never logged (invariant 7). */
export function selectModel(cfg: Config["model"], readSecret: SecretReader = envSecret): NarrationModel | "provider_local" | "no_api_key" {
  if (cfg.provider === "local") return "provider_local";
  const settings = cfg.provider === "anthropic" ? cfg.anthropic : cfg.gemini;
  const key = readSecret(settings.api_key_secret);
  if (!key) return "no_api_key";
  return cfg.provider === "anthropic" ? new AnthropicNarration(cfg.anthropic, key, cfg.timeout_ms) : new GeminiNarration(cfg.gemini, key);
}

/** One line for status screens: which model would answer now. */
export function describeModel(cfg: Config["model"], readSecret: SecretReader = envSecret): { provider: Config["model"]["provider"]; modelId: string; live: boolean } {
  const m = selectModel(cfg, readSecret);
  return typeof m === "string" ? { provider: cfg.provider, modelId: LOCAL_MODEL_ID, live: false } : { provider: m.provider, modelId: m.modelId, live: true };
}

/**
 * A paid model is called only through a guard (budget breaker and provider circuit, 03 sections 13.4 and 14) for a known tenant.
 * Without both, the local template answers: spend can never go unrecorded.
 */
export async function narrate(cfg: Config["model"], req: NarrationRequest, opts: { readSecret?: SecretReader; model?: NarrationModel; guard?: ModelGuard } = {}): Promise<NarrationResult> {
  const citationHandles = [...new Set(req.chunks.map(c => c.citation_id))];
  const local = (reason: FallbackReason): NarrationResult => ({ answer: localAnswer(req.chunks), model: LOCAL_MODEL_ID, fallback: true, fallbackReason: reason, citationHandles });

  if (req.chunks.length === 0) return local("no_evidence");
  // Restricted data goes only to local models (doc/10, cross-cutting redaction rule).
  if (req.chunks.some(c => c.classification === "restricted")) return local("restricted_data");
  if (NO_MODEL_LEVELS.has(req.level)) return local("degraded_level");
  const model = opts.model ?? selectModel(cfg, opts.readSecret);
  if (typeof model === "string") return local(model);
  if (!opts.guard || !req.tenantId) return local("budget_check_failed");
  const { guard } = opts; const tenantId = req.tenantId;

  let maxOutputTokens: number;
  try {
    const admission = await guard.admit(tenantId, model.provider);
    if (!admission.allowed) return local(admission.refusal ?? "budget_exhausted");
    maxOutputTokens = admission.maxOutputTokens;
  } catch (err) {
    // Fail closed: if spend cannot be checked, no paid call is made.
    console.warn(`[narration] budget check failed, using the local template: ${(err as Error).name}`);
    return local("budget_check_failed");
  }

  const user = buildUserTurn(req);
  let out: Awaited<ReturnType<NarrationModel["narrate"]>>;
  try {
    out = await model.narrate({ system: cfg.system_prompt, user, maxOutputTokens, timeoutMs: cfg.timeout_ms });
  } catch (err) {
    // The message only: SDK errors can carry request details, and the key must never reach a log.
    console.warn(`[narration] ${model.provider} failed, using the local template: ${(err as Error).name}`);
    await guard.failed(tenantId, model.provider).catch(e => console.warn(`[narration] could not record the failure: ${(e as Error).name}`));
    return local("provider_error");
  }
  // A paid call is recorded even when its answer is empty: the spend happened.
  const usage = out.usage ?? conservativeUsage(cfg.system_prompt.length + user.length, maxOutputTokens);
  await guard.succeeded(tenantId, model.provider, out.modelId, usage, "narration")
    .catch(e => console.warn(`[narration] could not record spend: ${(e as Error).name}`));
  if (!out.text) return local("empty_answer");
  return { answer: out.text, model: out.modelId, fallback: false, fallbackReason: null, citationHandles };
}
