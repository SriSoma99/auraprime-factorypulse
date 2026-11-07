---
title: "ADR-033: Safety Invariant 3 enforcement via database function gov.append_audit as single writer"
status: accepted
edition: community
related:
  - ../req/00-requirements.md
  - ../04-architecture-definition.md
  - ../05-data-architecture.md
---

# ADR-033: Safety Invariant 3 enforcement via database function gov.append_audit as single writer

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-06 |
| Decided by | Chief Architect & Owner |
| Clarifies | Safety Invariant 3, APP-20 (Audit Writer), Migration 0001 / 0003 |

## Context

Safety Invariant 3 states:
> *"Only the audit writer (APP-20) appends to the hash-chained audit log."*

In early design concepts, APP-20 was envisioned as a standalone network service daemon consuming Kafka audit events. In the implemented PostgreSQL schema (Migration 0001, Migration 0003), the hash chain calculation, sequence ordering, advisory lock serialization, and tamper detection are implemented as a PostgreSQL `SECURITY DEFINER` function: `gov.append_audit(actor, action, object, payload)`.

The table `gov.audit_event` has strict privileges: direct `INSERT`, `UPDATE`, and `DELETE` are revoked for `:app_user`; only the definer function `gov.append_audit` possesses the ability to append rows. However, multiple application services (`governance-svc`, `agent-orchestrator`, `case-svc`, `mcp-server`) call `SELECT gov.append_audit(...)` directly over SQL connections.

An independent review on 2026-10-06 questioned whether this satisfies Invariant 3 or violates the "single writer" rule.

## Decision

1. **Clarify that the PostgreSQL stored function `gov.append_audit` is the architectural single writer for the audit log:**
   - Table-level security guarantees that no client or service can directly write to `gov.audit_event`.
   - The cryptographic hash calculation (`sha256(prev_hash || canonical_payload)`), transaction serialization (`pg_advisory_xact_lock`), and sequence incrementing occur strictly inside `gov.append_audit`.
2. **Authorize authorized services to invoke `gov.append_audit` directly:**
   - Calling `SELECT gov.append_audit(...)` within atomic transactional operations is recognized as delegating to the single writer engine.
3. **Stand-alone Audit Exporter (APP-20 runtime):**
   - In `apps/governance-svc`, the audit verification engine (`gov.verify_audit()`) and cryptographic evidence pack exporter serve as the user-facing interface of APP-20 for verifying chain integrity.

## Alternatives considered

| Option | Why not chosen |
|---|---|
| Force all audit events through an asynchronous Kafka queue to an external APP-20 daemon | Loses transactional atomicity (e.g., if a work order status update succeeds but the audit message drops or lags, the audit log and state diverge). |
| Remove Invariant 3 | Invariant 3 is a non-negotiable safety invariant that guarantees tamper-evident auditability. |

## Consequences

- The single-writer invariant is formally satisfied at the database privilege boundary.
- Transactional atomicity between business operations and audit events is preserved.
