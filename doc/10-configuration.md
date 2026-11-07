---
title: Configuration Architecture
status: draft
edition: community
related:
  - req/00-requirements.md
  - 04-architecture-definition.md
---

# AuraPrime FactoryPulse v2: Configuration Architecture (Zero Hardcoding)

**Status:** Draft for review. Addendum to documents 00–09.
**Decision from the project owner:** Zero hardcoding. Behaviour is driven by configuration.
**Today's coverage:** Document 03 section 22 lists layered configuration (aligned with section 4 of this document on 2026-10-01), feature flags and tunable thresholds. This addendum turns that into a governing principle with enforcement.

---

## 1. Principle (proposed P-13 and TP-9)

> No value that an operator, tenant, environment or edition may reasonably want to change is written in code. Code reads validated configuration. A small, named set of safety invariants is the only exception, and it is written down.

## 2. What must be configuration

| Group | Examples |
|---|---|
| Messaging | Kafka topic names, partitions, retention, retry tiers; MQTT namespaces, QoS, queue limits |
| Detection and trust | Thresholds, window sizes, hysteresis, drift sensitivity, trust-check rules, late-data window |
| Ingest and sensor health | Timestamp skew limits, registry cache refresh, OTLP/HTTP host, port, path and body limit; health lookback window, flatline window and tolerance (`ingest.*`, `telemetry_health.*`, ADR-039). Per-sensor limits and machine state rules are registry data (ING-7), not configuration |
| Causal engine | Failure-mode priors, evidence weights, abstention threshold, calibration schedule |
| Agent and RAG | Prompt templates and versions, retrieval weights, chunk sizes, citation-verification strictness, step limits; document templates, upload quality thresholds and the second-reviewer rule (`knowledge.*`, ADR-041) |
| Models | Provider, model IDs, data-class routing, token and cost budgets, breaker thresholds; narration provider, model IDs, base URLs, secret names, effort, temperature, output ceiling, timeout and instructions (`model.*`, ADR-038) |
| Degradation | Level trigger conditions, hysteresis, recovery rules, per-level behaviour |
| Policy | Approval tiers by action, asset class and tenant; who may approve |
| Access | Default screen access per role (`rbac.screens`, ADR-040); tenant admins override it in W09, stored in `plat.role_permission` |
| Verification and learning | Good-cycle counts, tolerance bands, prior-update rate; similar-case thresholds and count, lesson approver role, learning-batch size and evaluation tolerances (ADR-031) |
| Platform | Retention, rate limits, quotas, timeouts, retry counts, backoff, pool sizes |
| Security | Allow-listed MCP servers, token lifetimes, redaction classes |
| UI | Feature flags, thresholds shown to users, labels per tenant, theme tokens (from design tokens pipeline, ADR-034) |
| Edition | Which adapters load (Community or Full), demo limits |

## 3. What stays in code (named invariants)

These are deliberately not configurable, so no setting can weaken them.

| Invariant | Reason |
|---|---|
| No tool may actuate equipment; work-order tools are draft only | Advisory-only positioning (AGT-4) |
| Approval requires a human session; keys and agent tokens cannot approve | Accountability |
| Only the audit writer appends to the hash-chained log | Tamper evidence |
| Tenant ID is required on every tenant record and query | Isolation |
| Alerts are never dropped under back-pressure | Safety of the alert path |
| The alert path does not call a model | Availability |
| Secrets are never read from config files | Security (NFR-S3) |

Config may tighten these (for example, require a higher approval tier) but never loosen them. The loader rejects any setting that would.

## 4. Layering and precedence

Lowest to highest:

1. **Built-in schema defaults** (safe, documented, shipped in the repository).
2. **Edition profile** (Community or Full).
3. **Environment profile** (desktop, cloud validation, public demo).
4. **Site and line overrides.**
5. **Tenant overrides** (Full edition).
6. **Runtime overrides** (operator changes through the admin API, time-limited where risky).

Secrets come from a separate secrets manager and are referenced by name, never stored in these layers.

## 5. Design rules

| Rule | Detail |
|---|---|
| Schema first | Every key has a type, range, default, description and owner in a versioned schema. Unknown keys and out-of-range values fail at load. |
| Validate before apply | Cross-field checks (for example, a retry ceiling must stay within the alert latency budget). Invalid change is rejected and the previous config stays active. |
| Safe defaults | Missing config falls back to a conservative default and raises a warning event. |
| Hot reload vs restart | Each key is marked hot-reloadable or restart-required. Thresholds and routing reload live; topology and ports require restart. |
| Versioned and audited | Every change records who, when, old and new value, reason and config hash, written to the audit chain. Runs record the config hash (existing rule, 03 section 22). |
| Reversible | Any change can be rolled back to a prior version. |
| Tenant scoping | Tenant overrides are checked against the invariants and against plan limits. |
| Explainable | Config is visible in the control tower: effective value, the layer it came from, and the last change. |
| Prompts as config | Prompt templates are versioned artefacts with evaluation gates, not string literals. |
| Config as code | Community defaults live in the public repository. Private tuned values (calibrated priors, thresholds, prompts) live in the private repository and are never in the public export, which protects the IP. |

## 6. Enforcement

| Control | How |
|---|---|
| Lint rules | CI rejects literal URLs, hostnames, ports, topic names, thresholds, model IDs and credentials in source, with an allow-list for tests and the named invariants |
| Secret scanning | CI and pre-commit hooks |
| Schema tests | Every key has a default, a description and a test of its boundary values |
| Config diff in review | Config changes are reviewed like code, with the effective-value impact shown |
| Public export check | The existing publish check also scans for private config values (IP-2, IP-6) |
| Runtime guard | Startup refuses to run if required keys are missing or invalid |
| Test fixtures | Tests and the simulator load config profiles instead of embedding values |

## 7. Interaction with other designs

- **Kafka and Mosquitto (document 09):** topic names, partitions, retention, QoS and queue limits come from config; per-tenant overrides are possible for dedicated topics.
- **Degradation ladder:** level conditions are config, which lets the simulator tune and test them.
- **Multi-tenancy:** tenant overrides are the lever for quotas, model routing and approval tiers.
- **UI:** design tokens flow from `apps/app/src/ui/tokens.ts` (ADR-034); business thresholds shown in the UI come from the same config service as the backend.

## 8. Changes this causes

| Document | Change |
|---|---|
| 04 ADD | Add principle P-13 and an ADR for layered, schema-validated configuration |
| 03 Technical Design | Expand section 22 with layers, schema, hot-reload and invariants |
| 06 Application | Add a Configuration Service (module of the governance service) and a config port in the ports table |
| 05 Data | Add config version and audit entities |
| 07 Technology | Add lint, secret scan and schema test to the pipeline; name the config store |
| Requirements | Add requirements for schema validation, audit, rollback, hot reload and the lint gate |

## 9. Open items

1. Config store for the desktop (files in version control with a reload watcher) and cloud (same files plus an optional config service).
2. Schema language (JSON Schema or similar) and how it generates admin screens and documentation.
3. Final list of named invariants, reviewed against the regulatory view.
4. Who may change which layer, mapped to roles.
