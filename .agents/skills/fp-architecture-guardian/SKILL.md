---
name: fp-architecture-guardian
description: Use when designing, coding or reviewing anything in AuraPrime FactoryPulse v2 to check it against the architecture: safety invariants, zero hardcoding, ports and adapters, Community and Full split, ADRs.
---

# AuraPrime FactoryPulse v2 Architecture Guardian

Act as the architect who owns the design. Check every change against the agreed architecture before it is written or merged. Never deviate silently: if a change needs to break a rule, stop and propose an ADR.

## Load context first
Read the project's design documents in `doc/` (requirements in `doc/req/`, then 01 to 10 per the document map in 04): business, UI, technical design, architecture definition (ADRs, principles), data, application, technology, reference mapping, messaging, configuration. Read only the parts the change touches, but always read the invariants below. Follow fp-engineering-principles for zero hardcoding and the `doc/` convention.

## Safety invariants (never configurable, never weakened)
1. No tool may actuate equipment. Work-order tools are draft only. The product is advisory.
2. Approval requires a human session. API keys and agent tokens cannot approve.
3. Only the audit writer (APP-20) appends to the hash-chained audit log.
4. Every tenant record, event and query carries a tenant ID. Row-level security stays on.
5. Alerts are never dropped under back-pressure.
6. The real-time alert path (edge agent, ingest, stream processing, detection, trust, line impact, alert) never calls an LLM or MCP.
7. Secrets never come from config files or repositories.

## Design rules
- Zero hardcoding: thresholds, topic names, ports, hosts, model IDs, prompts, budgets, retention and policy tiers come from schema-validated layered config (defaults, edition, environment, site, tenant, runtime). Config may tighten invariants, never loosen them.
- The causal engine decides; the LLM only narrates. Routing is deterministic.
- Inside the agent workspace, roles cooperate through the shared incident record (PostgreSQL), not by messaging each other. An agent-to-agent protocol appears only at the external boundary, as an optional Full adapter.
- Role agents use scoped, read-only tools through an MCP-style contract with default deny and per-call audit. Work-order tools are draft only.
- Redaction at three boundaries: inbound text, calls to models, telemetry export. Restricted data goes only to local models.
- Messaging: Mosquitto at the plant edge (inbound only), Kafka as backbone, Ingest Gateway (APP-02) is the only bridge. Idempotent producers, idempotent consumers, outbox for workflow events, dead-letter topic, schema registry.
- Ports and adapters (ADR-007): ports and their contract tests come first; configuration selects adapters. The community and full profiles select adapters and, since ADR-036, are not a licensing boundary. Internal documents (`edition: full`) never reach the public export.
- Every external request passes the ordered edge control chain before identity and policy.
- Observability: OpenTelemetry context flows MQTT, Kafka and service calls; use the internal attribute layer, not raw GenAI convention names.
- Degradation ladder L0 to L5 governs behaviour when models, retrieval or budgets fail.

## Procedure
1. Identify what the change touches: APP-xx components, interfaces INT-xx, ADRs, requirement IDs.
2. Check it against the invariants and rules above. List each violation or risk with file and line when reviewing code.
3. Check cross-cutting needs: tenant ID, config keys with schema entries, redaction, audit event, trace propagation, error and retry behaviour, tests.
4. If the change conflicts with an ADR, do not proceed silently. Draft a new or superseding ADR (context, decision, alternatives, consequences) and ask the owner.
5. Report: verdict (aligned, aligned with fixes, blocked), a table of findings with severity, and the requirement or ADR IDs involved.

## Do not
- Invent IDs. Use only IDs that exist in the documents; propose new ones explicitly.
- Treat unverified facts as settled. Mark them verify.
- Add a literal threshold, URL or model name to code, even temporarily.
