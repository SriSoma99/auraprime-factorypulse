---
name: fp-engineering-principles
description: Use for any AuraPrime FactoryPulse v2 coding, design or review work: think config-first with zero hardcoding, and keep every architecture artifact in the doc folder at the repository root.
---

# AuraPrime FactoryPulse v2 Engineering Principles

Two habits apply to every task: nothing that can change is hardcoded, and every architecture artifact lives in `doc/`.

## 1. Zero hardcoding

Before writing any literal value, ask: could an operator, tenant, environment, edition or test reasonably want a different value? If yes, it is configuration, not code.

Typical offenders: thresholds, window sizes, retry counts and backoff, timeouts, hostnames, URLs, ports, topic names, MQTT namespaces, QoS levels, queue sizes, retention periods, model names and providers, prompt text, budgets, rate limits, approval tiers, feature switches, labels shown to users.

When a value is configurable:
1. Add a key to the config schema with type, range, safe default, description and owner.
2. Mark it hot-reloadable or restart-required.
3. Read it through the config layer (defaults, edition, environment, site, tenant, runtime override). Never read it from a literal or a stray environment variable.
4. Record changes in the audit log and the config hash on each run.
5. Document the key in `doc/` (configuration reference).
6. Tests load a config profile instead of embedding values.

Secrets are not configuration. They come from the secrets manager by name and are never stored in config files or the repository.

The only values allowed in code are the named safety invariants: no equipment actuation, human-only approval, audit chain written only by the audit writer, tenant ID on every record, alerts never dropped, no model calls on the real-time alert path, no secrets in files. Config may tighten these, never loosen them. If a task seems to require loosening one, stop and ask.

Self-check before finishing: search the change for numbers, URLs, hostnames, topic names and model names. Each hit is either a config key, a test fixture, or a named invariant.

## 2. Architecture artifacts live in doc/

`doc/` at the repository root is the single home for architecture artifacts. Use forward slashes in paths so they work in WSL, Linux and macOS.

Suggested layout:
- `doc/` numbered design documents: requirements, business, UI, technical design, architecture definition (principles and ADR log), data, application, technology, reference mapping, messaging, configuration
- `doc/adr/` one file per decision if the ADR log grows too large for the architecture definition document
- `doc/diagrams/` diagram sources (Mermaid or similar) and exports
- `doc/config/` configuration schema reference and key catalog
- `doc/api/` API contracts (OpenAPI, event schemas, MCP tool catalog)
- `doc/runbooks/` operational runbooks

Rules:
- Architecture decisions, diagrams, schemas and catalogs are written in `doc/`, not in chat, README files, wikis or long code comments. Code comments link to a document ID instead.
- Decide in the document first, then change the code. Code and documentation changes ship together.
- Use existing IDs (APP, INT, ADR, requirement groups). Never invent an ID that is not defined in `doc/`. New IDs are defined in `doc/` before they are cited.
- Each document has front matter: title, status, edition (community or full), related documents. Only documents marked community are published in the public export; `full` marks internal documents (ADR-036), and the export build check keeps them out.
- Keep working scratch files out of `doc/` and out of the repository unless the owner asks.

## 3. Definition of done for any change
- No new hardcoded values; new config keys are in the schema and documented.
- Relevant `doc/` files updated in the same change; IDs resolve.
- Tests cover the change and use config profiles.
- Safety invariants still hold.
- Anything unverified is marked verify, not stated as fact.
