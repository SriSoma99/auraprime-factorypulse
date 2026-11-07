---
title: "ADR-035: Cloud LLM Gateway Adapter, Server-Side Secret Resolution, and Data Classification Filter"
status: accepted
edition: community
related:
  - ../req/00-requirements.md
  - ../04-architecture-definition.md
  - ../06-application-architecture.md
  - ../07-technology-architecture.md
---

# ADR-035: Cloud LLM Gateway Adapter, Server-Side Secret Resolution, and Data Classification Filter

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-18 |
| Decided by | Chief Architect & Owner |
| Supersedes | None (Formalizes cloud adapter architecture for APP-26) |
| Impacted Deployable Units | DU-05 (Knowledge Service), DU-11 (API Gateway), DU-14 (Web App), DU-15 (Mobile App) |
| Impacted Requirements | Invariant 7, APP-26, RAG-1..11, AGT-6, FBK-3, NFR-S2, NFR-C4 |

## Context

AuraPrime FactoryPulse v2 incorporates multi-modal and generative capabilities for root cause analysis (RCA), SOP retrieval augmented generation (RAG), and technician copilot suggestions.

During Transition Architecture TA-4 and release auditing (2026-10-18), three critical security and resilience gaps were identified in the knowledge service and client layers:
1. **Secret Exposure (Invariant 7):** The OpenAPI contract (`/knowledge/query`) and client UI components accepted a client-supplied `gemini_api_key`. Invariant 7 strictly mandates that clients must never handle, transmit, or store root API credentials.
2. **Data Boundary Leaks:** Highly proprietary machine telemetry and sensitive plant operations could be inadvertently transmitted to third-party cloud LLMs without classification verification.
3. **Resilience & Fallback:** Cloud API outages, network partitions, or missing credentials must never crash or block operator decision-making on the factory floor.

## Decision

1. **Strict Server-Side Secret Resolution:**
   - All cloud LLM credentials (including `GEMINI_API_KEY`) must be resolved exclusively on the server side via environment variables, container secrets, or secret managers.
   - Client applications (web, mobile, CLI) and external API contracts (`doc/api/openapi.yaml`) must never accept or forward API keys. Any `gemini_api_key` parameter in client request bodies is deprecated and removed.

2. **Data Classification Gateway Filter:**
   - APP-26 (Model Gateway adapter within `apps/knowledge-svc`) enforces data classification boundaries before dispatching any prompt or context payload to external cloud APIs.
   - Any document or chunk classified as `classification: "restricted"` (or containing proprietary machine blueprints / PII) is strictly prohibited from leaving the on-premise perimeter.
   - When restricted chunks are present, APP-26 either redacts them prior to dispatch or diverts the query to the local deterministic fallback engine.

3. **Deterministic Fallback Ladder (L0-L5 Alignment):**
   - Cloud LLM invocation is treated as an optional enhancement. If credentials are missing, API quotas are exhausted, network connectivity fails, or data is restricted, the service degrades gracefully to deterministic local synthesis (BM25 search, knowledge graph navigation, and rule-based template generation).
   - Responses generated via fallback must explicitly disclose their synthetic or deterministic generation mode.

4. **Distributed Traceability & Telemetry:**
   - Incoming W3C `traceparent` headers must be propagated through all adapter calls to downstream LLM endpoints.
   - Token consumption, latency, and model identifiers are recorded in OpenTelemetry metrics, while raw secret tokens are strictly masked in logs.

## Alternatives Considered

| Option | Why not chosen |
|---|---|
| Client-side Bring-Your-Own-Key (BYOK) | Violates Invariant 7; exposes API keys in browser memory and local storage; bypasses enterprise data loss prevention (DLP). |
| Cloud-only LLM without offline fallback | Violates plant edge availability requirements (NFR-R1); causes total knowledge outage during network partitions. |
| Unfiltered transmission of all SOP chunks | Risk of intellectual property leakage and compliance violation under ISO 27001 / SOC 2. |

## Consequences

- Invariant 7 compliance is restored across all API contracts and UI ViewModels.
- Knowledge service operates seamlessly in offline, hybrid, and fully-connected cloud environments.
- Automated release gates (G-2, G-7, G-9) verify server-side credential isolation and deterministic fallback paths.
