---
title: "ADR-038: Model provider port with Claude and Gemini adapters for narration"
status: accepted
edition: community
related:
  - ../04-architecture-definition.md
  - ../06-application-architecture.md
  - ../10-configuration.md
  - ADR-035-cloud-llm-gateway-adapter.md
---

# ADR-038: Model provider port with Claude and Gemini adapters for narration

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-11-03 |
| Decided by | Owner, 2026-11-06 ("go ahead") |
| Amends | ADR-035 (the gateway adapter becomes one port with several providers) |
| Keeps | AP-3 (the causal model decides, the LLM narrates); ADR-007; safety invariants 6 and 7 |
| Components | APP-26 (Model Gateway), APP-07 (Knowledge Service), DU-05 |

## Context

The narration step in APP-07 calls one provider through `GeminiRAGClient` (`apps/knowledge-svc/src/gemini.ts`). The model ID, API base URL, prompt text, temperature and output limit are literals in that file, which breaks the config-first rule, and the provider cannot be changed without a code change. The configured model, `gemini-1.5-flash`, is no longer Google's current model; on 2026-11-06 Google's model list named `gemini-3.8-flash` as the current stable Flash model.

The owner wants the public repository to show Claude in the product as well as in the engineering workflow. APP-26 is defined as a provider abstraction (06), so a second provider belongs behind a port, not as a second hardcoded client.

## Decision

1. **One port, several adapters.** APP-26 exposes a `NarrationModel` port: given the question, the classified and redacted context chunks and the fallback level, return an answer with its model ID, citation handles and a fallback flag. Adapters: `anthropic` (Claude, Messages API), `gemini` (the existing client, refactored) and `local` (the deterministic cited template, used today as the fallback).
2. **Configuration selects the adapter.** New schema-validated keys (doc/10, doc/config/keys.md) in a `model` group: provider (`local` by default, so the Community build and CI need no key), model ID, API base URL, request timeout, temperature, maximum output tokens and the prompt template. The name of the secret that holds the API key is configuration; the key itself is resolved server side from the secret store or environment by that name (invariant 7, ADR-035).
3. **Same guards for every provider.** The classification filter (restricted chunks never leave), redaction, the fallback ladder (L2 and above use `local`), citation verification and abstention apply before and after any adapter, in APP-26, not in each adapter.
4. **Narration only.** No adapter is reachable from the real-time alert path (invariant 6); approval, policy and causal ranking never depend on model output (AP-3).
5. **Tests without network.** Each adapter has contract tests against a mocked HTTP endpoint: request shape, secret never logged, timeout and error mapped to the `local` fallback, restricted data never sent.

## Alternatives considered

| Option | Why not chosen |
|---|---|
| Keep Gemini only | Leaves hardcoded values in place and no Claude path |
| Replace Gemini with Claude | Loses provider choice; ADR-035 and APP-26 describe an abstraction |
| A third-party multi-provider SDK | Adds a dependency for two small adapters; guards would still live in our code |

## Consequences

- The default stays `local`: no external call, no key, no cost unless an operator configures a provider.
- A live Claude demo needs an Anthropic API key in the secret store; spend counts against the budget cap (AC-1) and the budget breaker.
- `gemini.ts` literals move to configuration; the Gemini model ID is re-checked against current provider documentation before it is set (verify).
- 06 (APP-26), 10 and the configuration key reference are updated with the code; a row is added to the 04 ADR log.

## Implementation (2026-11-06)

- Port and gateway: `apps/knowledge-svc/src/narration/` (`types.ts`, `gateway.ts`); adapters `anthropic.ts` (official Anthropic TypeScript SDK, Messages API, effort from config, server-side refusal fallback on by default), `gemini.ts` (REST, key in the `x-goog-api-key` header) and `local.ts`. The old `gemini.ts` client is removed.
- Configuration: `model.provider` (default `local`), `model.timeout_ms`, `model.max_output_tokens`, `model.system_prompt`, `model.anthropic.*` (default model `claude-opus-5-5`), `model.gemini.*` (default model `gemini-3.8-flash`; support for the `generateContent` endpoint is still to verify).
- Guards in the gateway: no evidence, restricted chunks, levels L2 to L5 (03 section 13), a missing key, a provider error, timeout, refusal or empty answer all give the local template, with the reason returned as `fallback_reason`. Redaction of contact details and addresses before any provider call. Retries are off so a slow provider falls back at once.
- Two gaps closed while wiring it: document classification is now stored (migration 0015), so the restricted-data guard has data to act on; and the query API takes the degradation level from the platform state instead of the request body. `noModel` in the UI API now includes L3, matching 03 section 13.
- Tests: 14 contract tests against a local mock HTTP endpoint (request shape, key never in a URL or log, timeout, error, refusal, empty answer, every guard) and API tests for the level, classification and stats.
