---
title: Documentation Index
status: draft
edition: community
related: []
---

# Documentation Index

New documents default to `edition: full` (internal). Change to `community` only for documents cleared for the public export (ADR-036).

| No. | Document |
|---|---|
| 00 | [Requirements](req/00-requirements.md) |
| 01 | Business Architecture (internal, not published) |
| 02 | [UI Design](02-ui.md) |
| 03 | [Technical Design](03-technical-design.md) |
| 04 | [Architecture Definition](04-architecture-definition.md) |
| 05 | [Data Architecture](05-data-architecture.md) |
| 06 | [Application Architecture](06-application-architecture.md) |
| 07 | [Technology Architecture](07-technology-architecture.md) |
| 08 | [Reference Mapping](08-reference-mapping.md) |
| 09 | [Messaging Architecture](09-messaging.md) |
| 10 | [Configuration Architecture](10-configuration.md) |
| 11 | Project Plan and Delivery Tracking (internal, not published) |

## Folders

- `req/` requirements and scope (requirement IDs, NFRs, regulatory, IP, risks, open questions)
- `adr/` one file per decision, once the ADR log in 04 grows too large
- `diagrams/` rendered views of the Mermaid diagrams in the documents (ADR-027 amendment 2026-10-03): application, agent, messaging, data, technology and alert path
- `wireframes/` low-fidelity HTML screen wireframes (ADR-027 amendment 2026-10-03); design references, not application code
- `config/` configuration schema reference and key catalog
- `api/` API contracts: OpenAPI, event schemas, MCP tool catalog
- `reviews/` dated review reports (architecture guardian, QA gate, release claims validation)
- `runbooks/` operational runbooks
