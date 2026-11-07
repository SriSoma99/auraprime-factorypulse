// Contract tests for the APP-26 narration port (ADR-038) against a local mock HTTP endpoint; no network, no real key.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { configSchema, type Config } from "@fp/config";
import type { RetrievedChunk } from "../types.js";
import { describeModel, narrate, NO_MODEL_LEVELS, redact } from "./gateway.js";
import { LOCAL_MODEL_ID } from "./local.js";
import { ModelGuard, type Spend, type SpendStore } from "./budget.js";

const KEY = "test-key-not-real-0123456789";
interface Seen { method: string; url: string; headers: IncomingMessage["headers"]; body: Record<string, unknown> }
let server: Server; let base = ""; let seen: Seen[] = [];
let reply: (s: Seen) => { status: number; body: unknown; delayMs?: number };

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", d => (raw += d));
    req.on("end", () => {
      const s: Seen = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: raw ? JSON.parse(raw) : {} };
      seen.push(s);
      const r = reply(s);
      setTimeout(() => { if (!res.destroyed) { res.writeHead(r.status, { "content-type": "application/json" }); res.end(JSON.stringify(r.body)); } }, r.delayMs ?? 0);
    });
  });
  await new Promise<void>(ok => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(ok => { server.closeAllConnections(); server.close(() => ok()); }));
beforeEach(() => { seen = []; reply = () => ({ status: 200, body: claudeMessage("Clean the strainer [CIT-1 · section 4.2].") }); });

const claudeMessage = (text: string, stop = "end_turn") => ({
  id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text }],
  stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 },
});
const cfg = (provider: Config["model"]["provider"], extra: Record<string, unknown> = {}): Config["model"] =>
  configSchema.parse({ model: { provider, timeout_ms: 1000, anthropic: { base_url: base }, gemini: { base_url: base }, ...extra } }).model;
const chunk = (over: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  citation_id: "CIT-1", chunk_id: "CIT-1-chk-1", title: "Weld Transformer Manual", section: "section 4.2", version: "v3", effective_from: "2025-03-01",
  content: "Inspect the strainer. Questions to ops@plant.example or 192.0.2.10.", score: 0.9, classification: "internal", ...over,
});
// An in-memory ledger and level sink, so these contract tests need no database; the PostgreSQL store has its own test.
let spend: Spend; let recorded: { modelId: string; costUsd: number; inputTokens: number; outputTokens: number }[]; let published: string[];
const memStore: SpendStore = {
  spend: async () => spend,
  record: async (_t, e) => { recorded.push({ modelId: e.modelId, costUsd: e.costUsd, ...e.usage }); spend = { todayUsd: spend.todayUsd + e.costUsd, totalUsd: spend.totalUsd + e.costUsd }; },
};
let guard: ModelGuard;
beforeEach(() => {
  spend = { todayUsd: 0, totalUsd: 0 }; recorded = []; published = [];
  guard = new ModelGuard(() => configSchema.parse({}).model, memStore, { reconcile: async (_t, level) => { published.push(level); } });
});
const withKey = { readSecret: (n: string) => (n === "ANTHROPIC_API_KEY" || n === "GEMINI_API_KEY" ? KEY : undefined), get guard() { return guard; } };
const ask = { question: "How do I clean the strainer?", chunks: [chunk()], level: "L0", tenantId: "t-test" };

describe("guards shared by every provider", () => {
  it("answers with the local template and calls nothing when the provider is local (the default)", async () => {
    const r = await narrate(configSchema.parse({}).model, ask, withKey);
    expect(r).toMatchObject({ model: LOCAL_MODEL_ID, fallback: true, fallbackReason: "provider_local", citationHandles: ["CIT-1"] });
    expect(seen).toHaveLength(0);
  });
  it("keeps restricted chunks on the local template", async () => {
    const r = await narrate(cfg("anthropic"), { ...ask, chunks: [chunk(), chunk({ citation_id: "CIT-9", classification: "restricted" })] }, withKey);
    expect(r.fallbackReason).toBe("restricted_data");
    expect(seen).toHaveLength(0);
  });
  it("calls no model from L2 to L5 (03 section 13)", async () => {
    expect([...NO_MODEL_LEVELS]).toEqual(["L2", "L3", "L4", "L5"]);
    for (const level of NO_MODEL_LEVELS) expect((await narrate(cfg("anthropic"), { ...ask, level }, withKey)).fallbackReason).toBe("degraded_level");
    expect(seen).toHaveLength(0);
  });
  it("does not ask a model to answer without evidence", async () => {
    const r = await narrate(cfg("anthropic"), { ...ask, chunks: [] }, withKey);
    expect(r).toMatchObject({ fallbackReason: "no_evidence", citationHandles: [] });
    expect(r.answer).toMatch(/do not answer this/);
    expect(seen).toHaveLength(0);
  });
  it("falls back when the API key is not in the environment", async () => {
    expect((await narrate(cfg("anthropic"), ask, { readSecret: () => undefined })).fallbackReason).toBe("no_api_key");
    expect(describeModel(cfg("anthropic"), () => undefined)).toEqual({ provider: "anthropic", modelId: LOCAL_MODEL_ID, live: false });
    expect(describeModel(cfg("anthropic"), withKey.readSecret)).toEqual({ provider: "anthropic", modelId: "claude-opus-5-5", live: true });
  });
  it("redacts contact details and addresses before any provider sees them", () => {
    expect(redact("mail ops@plant.example, host 192.0.2.10, call +44 20 7946 0958")).toBe("mail [REDACTED_EMAIL], host [REDACTED_IP], call [REDACTED_PHONE]");
  });
});

describe("anthropic adapter", () => {
  it("sends one Messages API request with the configured model, effort, instructions and fallback, and returns the text", async () => {
    const r = await narrate(cfg("anthropic"), ask, withKey);
    expect(r).toEqual({ answer: "Clean the strainer [CIT-1 · section 4.2].", model: "claude-opus-5-5", fallback: false, fallbackReason: null, citationHandles: ["CIT-1"] });
    expect(seen).toHaveLength(1);
    const s = seen[0]!;
    expect(s.method).toBe("POST");
    expect(s.url).toMatch(/^\/v1\/messages/);
    // The SDK sends the key as x-api-key or as a bearer token, depending on its version.
    expect([s.headers["x-api-key"], s.headers.authorization]).toContain(s.headers["x-api-key"] ? KEY : `Bearer ${KEY}`);
    expect(String(s.headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(s.body).toMatchObject({ model: "claude-opus-5-5", max_tokens: 16000, output_config: { effort: "medium" }, fallbacks: "default", system: configSchema.parse({}).model.system_prompt });
    const user = JSON.stringify(s.body.messages);
    expect(user).toContain('document=\\"CIT-1\\"');
    expect(user).toContain("[REDACTED_EMAIL]");
    expect(user).not.toContain("ops@plant.example");
    expect(s.body).not.toHaveProperty("temperature");
  });
  it("leaves out the fallback beta when it is switched off", async () => {
    await narrate(cfg("anthropic", { anthropic: { base_url: base, server_side_fallback: false } }), ask, withKey);
    expect(seen[0]!.headers["anthropic-beta"]).toBeUndefined();
    expect(seen[0]!.body).not.toHaveProperty("fallbacks");
  });
  it("maps a provider error to the local template without logging the key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reply = () => ({ status: 500, body: { type: "error", error: { type: "api_error", message: "boom" } } });
    const r = await narrate(cfg("anthropic"), ask, withKey);
    expect(r).toMatchObject({ fallback: true, fallbackReason: "provider_error", model: LOCAL_MODEL_ID });
    expect(seen).toHaveLength(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY);
    warn.mockRestore();
  });
  it("maps a timeout to the local template", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    reply = () => ({ status: 200, body: claudeMessage("late"), delayMs: 2500 });
    const started = Date.now();
    expect((await narrate(cfg("anthropic"), ask, withKey)).fallbackReason).toBe("provider_error");
    expect(Date.now() - started).toBeLessThan(2400);
    vi.restoreAllMocks();
  }, 10000);
  it("maps a refusal to the local template", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    reply = () => ({ status: 200, body: claudeMessage("", "refusal") });
    expect((await narrate(cfg("anthropic"), ask, withKey)).fallbackReason).toBe("provider_error");
    vi.restoreAllMocks();
  });
  it("maps an empty answer to the local template", async () => {
    reply = () => ({ status: 200, body: claudeMessage("   ") });
    expect((await narrate(cfg("anthropic"), ask, withKey)).fallbackReason).toBe("empty_answer");
  });
});

describe("gemini adapter", () => {
  it("sends the key in a header, never the URL, with the configured model and temperature", async () => {
    reply = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: "Clean it [CIT-1 · section 4.2]." }] } }] } });
    const r = await narrate(cfg("gemini"), ask, withKey);
    expect(r).toMatchObject({ answer: "Clean it [CIT-1 · section 4.2].", model: "gemini-3.8-flash", fallback: false });
    const s = seen[0]!;
    expect(s.url).toBe("/models/gemini-3.8-flash:generateContent");
    expect(s.url).not.toContain(KEY);
    expect(s.headers["x-goog-api-key"]).toBe(KEY);
    expect(s.body).toMatchObject({ generationConfig: { temperature: 0.2, maxOutputTokens: 16000 }, systemInstruction: { parts: [{ text: configSchema.parse({}).model.system_prompt }] } });
  });
  it("maps an error status to the local template", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    reply = () => ({ status: 404, body: { error: { message: "model not found" } } });
    expect((await narrate(cfg("gemini"), ask, withKey)).fallbackReason).toBe("provider_error");
    vi.restoreAllMocks();
  });
});

describe("budget breaker and provider circuit (FBK-3, AGT-6, NFR-C1; 03 sections 13.4 and 14)", () => {
  it("records each paid call in the ledger at the price of the model that served it", async () => {
    await narrate(cfg("anthropic"), ask, withKey);
    // claude-opus-5-5 at the default USD 4 / 20 per million tokens; the mock reports 10 input and 5 output tokens.
    expect(recorded).toEqual([{ modelId: "claude-opus-5-5", inputTokens: 10, outputTokens: 5, costUsd: (10 * 4 + 5 * 20) / 1e6 }]);
  });
  it("calls no paid model without a guard or a tenant, so spend can never go unrecorded", async () => {
    expect((await narrate(cfg("anthropic"), ask, { readSecret: withKey.readSecret })).fallbackReason).toBe("budget_check_failed");
    expect((await narrate(cfg("anthropic"), { ...ask, tenantId: undefined }, withKey)).fallbackReason).toBe("budget_check_failed");
    expect(seen).toHaveLength(0);
  });
  it("fails closed when the budget cannot be read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = new ModelGuard(() => configSchema.parse({}).model, { ...memStore, spend: async () => { throw new Error("db down"); } }, { reconcile: async () => {} });
    expect((await narrate(cfg("anthropic"), ask, { readSecret: withKey.readSecret, guard: broken })).fallbackReason).toBe("budget_check_failed");
    expect(seen).toHaveLength(0);
    vi.restoreAllMocks();
  });
  it("moves to L1 with a shorter output ceiling at the warning share of the daily budget", async () => {
    const b = configSchema.parse({}).model.budget;
    spend = { todayUsd: b.daily_usd * b.warn_fraction, totalUsd: b.daily_usd * b.warn_fraction };
    await narrate(cfg("anthropic"), ask, withKey);
    expect(seen[0]!.body).toMatchObject({ max_tokens: b.l1_max_output_tokens });
    expect(published[0]).toBe("L1");
  });
  it("forces L2 and calls nothing once a budget is spent", async () => {
    spend = { todayUsd: 0, totalUsd: configSchema.parse({}).model.budget.total_usd };
    const r = await narrate(cfg("anthropic"), ask, withKey);
    expect(r).toMatchObject({ model: LOCAL_MODEL_ID, fallbackReason: "budget_exhausted" });
    expect(seen).toHaveLength(0);
    expect(published).toContain("L2");
  });
  it("opens the provider circuit after repeated failures, then lets one trial call through after the timeout", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let t = 0;
    const timed = new ModelGuard(() => configSchema.parse({}).model, memStore, { reconcile: async (_t, level) => { published.push(level); } }, () => t);
    const opts = { readSecret: withKey.readSecret, guard: timed };
    const { failure_threshold, reset_timeout_ms } = configSchema.parse({}).model.breaker;
    reply = () => ({ status: 503, body: { type: "error", error: { type: "overloaded_error", message: "busy" } } });
    for (let i = 0; i < failure_threshold; i++) expect((await narrate(cfg("anthropic"), ask, opts)).fallbackReason).toBe("provider_error");
    expect(published.at(-1)).toBe("L2");
    const callsWhenOpen = seen.length;
    expect((await narrate(cfg("anthropic"), ask, opts)).fallbackReason).toBe("provider_circuit_open");
    expect(seen).toHaveLength(callsWhenOpen);
    t += reset_timeout_ms;
    reply = () => ({ status: 200, body: claudeMessage("Back [CIT-1 · section 4.2].") });
    expect((await narrate(cfg("anthropic"), ask, opts)).fallback).toBe(false);
    expect(published.at(-1)).toBe("L0");
    vi.restoreAllMocks();
  });
  it("charges an unpriced model at the deliberately high fallback price", async () => {
    reply = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: "Clean it [CIT-1]." }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } } });
    await narrate(cfg("gemini"), ask, withKey);
    const p = configSchema.parse({}).model.unknown_model_price;
    expect(recorded[0]).toMatchObject({ inputTokens: 100, outputTokens: 20, costUsd: (100 * p.input_usd_per_mtok + 20 * p.output_usd_per_mtok) / 1e6 });
  });
});
