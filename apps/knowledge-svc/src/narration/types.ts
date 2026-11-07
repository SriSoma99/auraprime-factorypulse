// The NarrationModel port of APP-26 (ADR-038): words an answer from approved, cited chunks. It never decides (AP-3).
import type { RetrievedChunk } from "../types.js";

/** What every adapter receives: instructions and a user turn already built and redacted by the gateway. */
export interface NarrationPrompt { system: string; user: string; maxOutputTokens: number; timeoutMs: number }

/** Token usage as the provider reports it; absent when the provider did not say, and the gateway then charges conservatively. */
export interface TokenUsage { inputTokens: number; outputTokens: number }
export interface NarrationOutput { text: string; modelId: string; usage?: TokenUsage }

export interface NarrationModel {
  readonly provider: "anthropic" | "gemini";
  readonly modelId: string;
  /** Returns the answer text, or throws; the gateway turns any failure into the local template. */
  narrate(prompt: NarrationPrompt): Promise<NarrationOutput>;
}

export type FallbackReason = "provider_local" | "restricted_data" | "degraded_level" | "no_evidence" | "no_api_key" | "provider_error" | "budget_exhausted" | "provider_circuit_open" | "budget_check_failed" | "empty_answer";

export interface NarrationResult {
  answer: string;
  model: string;
  fallback: boolean;
  fallbackReason: FallbackReason | null;
  citationHandles: string[];
}

/** tenantId scopes the budget and the CostLedger (invariant 4); without it no paid model is called. */
export interface NarrationRequest { question: string; chunks: RetrievedChunk[]; level: string; tenantId?: string }
