---
title: "ADR-030: UI first against a contract-driven mock backend"
status: accepted
edition: community
related:
  - ../02-ui.md
  - ../04-architecture-definition.md
  - ../11-project-plan.md
  - ADR-027-penpot-design-tool.md
  - ADR-029-expo-universal-app.md
---

# ADR-030: UI first against a contract-driven mock backend

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-04 |
| Decided by | Owner |
| Changes | Sequencing note in 04 section 11 and the design timeline in 02 section 19 (UI code was planned for TA-4 after Penpot approval) |
| Keeps | UI-1 as the release gate; AC-5 (Python for ML, causal and agent services) |

## Context

The owner wants the complete UI built and tested with synthetic data before the backend, both to validate the experience early and to have a working product to show potential clients. The plan had UI code starting in TA-4, after the Penpot design is approved (UI-1) and the backend contracts exist (TA-3).

## Decision

1. **Contract first.** The HTTP and event contracts the UI needs are written as OpenAPI in `doc/api/` before code. The UI SDK (`packages/sdk-ts`) is generated from that contract.
2. **Synthetic data.** A TypeScript generator produces the hero scenario and companion data (tenants, sites, lines, assets, sensors, alerts, incidents, evidence, work orders, approvals, trust results, fallback levels), deterministic from a seed, labelled synthetic (ADR-019, BR-12).
3. **Local PostgreSQL.** The generator seeds a local PostgreSQL in Docker. The schema follows 05 (tenant ID on every row, row-level security on: invariant 4) so it can grow into the real DS-01 schema.
4. **Mock API.** A thin TypeScript service serves the contract from PostgreSQL, enforces the same safety rules as the real system (approval only from a human session: invariant 2; work orders are drafts: invariant 1), and can be switched between fallback levels and states for testing.
5. **UI prototype now.** The Expo app (ADR-029, MVVM per ADR-028) is built now against the mock API, from the wireframes and the 02 screen specs; screens without a wireframe go straight to code. It is tested with component, ViewModel and end-to-end tests.
6. **Gate unchanged.** Penpot hi-fi design and tokens are still approved before release (UI-1); the code is restyled to the approved tokens. The real backend later implements the same contract, so the UI does not change when the mock is replaced.
7. **Language scope.** TypeScript for the app, API gateway and BFF, mock API, data generator and SDK. Python stays for ML, causal and agent services (AC-5).
8. **Configuration and secrets.** Ports, hosts, database names, seeds and feature switches are configuration keys documented in `doc/config/`. The local database password is generated on the developer machine into an untracked file and never committed (invariant 7).

## Alternatives considered

| Option | Why not chosen |
|---|---|
| Keep UI code in TA-4 after Penpot approval | No testable UI until late; nothing working to show clients early |
| Finish all wireframes first, then code | Slower; the working prototype gives better feedback for the remaining screens |
| In-browser mocks only (no database) | Faster start, but no PostgreSQL schema, tenancy or RLS to validate before the backend |

## Consequences

- WP-9 starts before WP-1 to WP-8; the backend work packages consume the contract instead of defining it. The project plan records this as a sequencing change (11 section 8).
- Risk R-1 (scope creep) rises: the mock API must stay thin and must not grow backend logic. The causal engine, detection and agents are never imitated beyond returning seeded results.
- The contract in `doc/api/` becomes a shared baseline; changes to it follow fp-docs-sync.
- Code is developed in the WSL Linux filesystem for performance (TO-10 finding, 2026-10-04).
