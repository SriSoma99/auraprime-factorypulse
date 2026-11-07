---
title: "ADR-037: Product name AuraPrime FactoryPulse (amended 2026-11-03)"
status: accepted
edition: community
related:
  - ../04-architecture-definition.md
  - ../req/00-requirements.md
  - ADR-036-apache-open-source-release.md
---

# ADR-037: Product name AuraPrime (brand AuraPrime Labs)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-11-02 |
| Decided by | Owner (delegated to the chief architect role in session) |
| Resolves | IP-8 for the ADR-036 release; OQ-8 |
| Keeps | ADR-036 (Apache-2.0) |

## Context

The IP-8 name screening on 2026-11-02 found that "FactoryPulse" is used by an active commercial manufacturing-software product with an AI copilot (FactoryPulse Digital Ltd, United Kingdom, factorypulse.app), which also holds the `factorypulse` GitHub organisation. The `.com`, `.ai` and `.io` domains and the `FactoryPulseAI` GitHub organisation are taken, and more than fifteen public repositories use the same name for similar predictive-maintenance demos. The only US registration found, FACTORYPULSE (Reg. 2581947), is dead (cancelled 2009). The public repository is a portfolio showcase; a distinct name avoids confusion with an existing product and makes the work findable.

## Decision

- The product is named **AuraPrime**, published under the brand **AuraPrime Labs**. "LLP" is not used until such an entity is registered.
- Public names change: documentation, UI text, NOTICE, README, narration, OpenAPI title, SBOM names, the MCP resource URI scheme (`auraprime://`), the Expo slug and deep-link scheme, container image tags and the cloud smoke-test service names.
- Internal identifiers stay: the `@fp/` package scope, the `fp-` prefixes, the default database name and the local compose project names (renaming them would orphan existing Docker volumes). References to the v1 repository keep its real URL.

## Screening (2026-11-02, not legal clearance)

| Check | Result |
|---|---|
| Web search for "AuraPrime" software | No software company or product found; nearest is "AuroraPrime" (clinical research SaaS), a different spelling and field |
| GitHub | `auraprimelabs` and `AuraPrime-Labs` free; user `auraprime` exists (2017, no public repositories) |
| Domains | `auraprimelabs.com`, `auraprimelabs.ai`, `auraprime.ai`: no DNS records (verify availability with a registrar); `auraprime.com` resolves |
| Trademark registers | USPTO: no "auraprime" mark found by the owner (2026-11-02); EU and UK registers not searched (verify before any filing) |

## Alternatives considered

| Option | Why not chosen |
|---|---|
| Keep FactoryPulse | Same name and field as an active commercial product; crowded namespace |
| Prefix, e.g. "Soma_FactoryPulseAI" | Still contains the conflicting name |

## Consequences

- One-time rename across documents, UI and tooling; the demo video is re-recorded.
- MCP clients must use the `auraprime://` resource URIs.
- This record is a working decision, not legal advice.

## Amendment 2026-11-03: product name AuraPrime FactoryPulse

Owner decision, final:

- The product is named **AuraPrime FactoryPulse**: the owner's name AuraPrime followed by the product name FactoryPulse, in the pattern of a company name followed by a product name. "AuraPrime Labs" and "LLP" are not used until an entity is registered.
- The public repository is `srisoma99/FactoryPulsev2`, published from the export as a single fresh commit. The owner's working repository stays private.
- Display text uses "AuraPrime FactoryPulse"; lowercase identifiers use `auraprime-factorypulse` (package name, app slug and scheme, MCP resource URIs, image and smoke-test names); internal `fp` identifiers are unchanged.
- The owner accepted the screening finding above (an active FactoryPulse product in the same field) as a known risk when making this decision.
- The rows above record the 2026-11-02 decision and are kept as history.
