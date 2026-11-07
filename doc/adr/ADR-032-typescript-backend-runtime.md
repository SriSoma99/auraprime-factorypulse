---
title: "ADR-032: TypeScript backend runtime adoption across all microservices"
status: accepted
edition: community
related:
  - ../req/00-requirements.md
  - ../04-architecture-definition.md
  - ../07-technology-architecture.md
---

# ADR-032: TypeScript backend runtime adoption across all microservices

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-06 |
| Decided by | Chief Architect & Owner |
| Supersedes | AC-5 (Python language requirement in REQ), ADR-013 (Python backend runtime) |
| Impacted Deployable Units | DU-02 (Ingest Gateway), DU-03 (Stream Processor), DU-04 (Intel Core), DU-05 (Knowledge Service), DU-06 (Agent Orchestrator), DU-07 (Case Service), DU-08 (Governance Service), DU-11 (API Gateway), DU-12 (MCP Server) |

## Context

Requirement AC-5 and early design ADR-013 specified Python for real backend microservices. During the development of Transition Architectures TA-1 through TA-4, all services, schemas, and shared libraries were implemented in TypeScript (Node 22, pnpm monorepo) to share:
1. The layered configuration schema (`@fp/config` using Zod).
2. The database connection pools, tenant row-level security (RLS) policies, and migrations (`@fp/db`).
3. The OpenAPI contract types (`@fp/sdk-ts`).
4. The deterministic synthetic data generator (`@fp/synthetic-data`).
5. Unified end-to-end tooling, linting, typechecking, and Vitest testing across frontend and backend.

An independent architectural review on 2026-10-06 identified that while the entire codebase runs in TypeScript, AC-5 and ADR-013 still formally stated Python, creating a governance specification drift.

## Decision

1. **Adopt TypeScript as the official backend service runtime:** All microservices (ingest gateway, stream processor, intel core, knowledge service, orchestrator, governance, case service, API gateway, MCP server) use TypeScript (Node 22 / Fastify / pg / kafkajs).
2. **Python retained for offline ML research only:** Python is retained solely for offline model training pipelines, benchmark datasets, and deep learning experiments (e.g. Isolation Forest, transformer fine-tuning) if deployed in future phases.
3. **Supersede AC-5 and ADR-013:** Formally mark AC-5 and ADR-013 as superseded by ADR-032.

## Alternatives considered

| Option | Why not chosen |
|---|---|
| Rewrite all 12 backend services in Python | Massive disruption, loses end-to-end type sharing with `@fp/config` and Expo MVVM front-end, delays project significantly. |
| Hybrid split (some Python, some TypeScript) | Increases operational footprint, multi-runtime Docker images, breaks monorepo toolchain simplicity. |

## Consequences

- All production backend services continue on TypeScript.
- `req/00-requirements.md` note added to AC-5 pointing to ADR-032.
- `doc/07-technology-architecture.md` aligns with TypeScript runtime.
