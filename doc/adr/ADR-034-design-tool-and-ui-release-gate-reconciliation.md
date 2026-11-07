---
title: "ADR-034: Formal retirement of Penpot and reconciliation of UI release gates"
status: accepted
edition: community
related:
  - ADR-027-penpot-design-tool.md
  - ADR-028-ui-mvvm-pattern.md
  - ADR-029-expo-universal-app.md
  - ../req/00-requirements.md
  - ../02-ui.md
---

# ADR-034: Formal retirement of Penpot and reconciliation of UI release gates

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-06 |
| Decided by | Chief Architect & Owner |
| Supersedes | UI-1, UI-2, UI-9 Penpot references in REQ; Penpot approval gate in TA-3/TA-4 |
| Amends | ADR-027 |

## Context

In early project planning, Penpot was selected as the UI design tool (ADR-027), with requirement UI-1 mandating that all screens be designed in Penpot and approved before release. 

During implementation, Penpot was discontinued due to high overhead (ADR-027 amendment), and replaced by:
1. Low-fidelity, accessible HTML wireframes (`doc/wireframes/`).
2. A single universal Expo application (`apps/app`) using React Native for Web and Mobile (ADR-029).
3. Strict MVVM architectural separation with pure, testable ViewModel hooks (ADR-028).

However, an independent architectural review on 2026-10-06 revealed lingering references to Penpot across `doc/req/00-requirements.md` (UI-1, UI-2, UI-9), `CLAUDE.md`, and the TA-3/TA-4 exit criteria in `doc/04-architecture-definition.md`, causing specification confusion.

## Decision

1. **Formally retire all Penpot requirements:** Remove Penpot as a mandatory deliverable or gating dependency.
2. **Reconcile UI Release Gate Criteria (UI-1, UI-2, UI-9):**
   - **UI-1:** Replaced with: *"Interactive wireframes in `doc/wireframes/` reviewed and approved by the owner."*
   - **UI-2:** Replaced with: *"Design tokens (`apps/app/src/ui/tokens.ts`) and component library adhering to plant-floor high-contrast (UI-6) and 44px touch targets."*
   - **UI-9:** Replaced with: *"Visual regression and usability checklist verified against Expo web/mobile implementation."*
3. **Align documentation:** Update `CLAUDE.md`, `doc/02-ui.md`, and `doc/04-architecture-definition.md` to reflect Expo + HTML wireframes as the canonical UI source of truth.

## Alternatives considered

| Option | Why not chosen |
|---|---|
| Keep Penpot as an unfulfilled future gate | Blocks release indefinitely for a tool already discarded in development. |
| Replace with Figma | Introduces another external proprietary tool subscription conflicting with the USD $50 budget limit (NFR-C1). |

## Consequences

- Documentation across REQ, 02, 04, and CLAUDE.md is harmonized.
- The UI gating criteria become measurable against the actual Expo application and HTML wireframes.
