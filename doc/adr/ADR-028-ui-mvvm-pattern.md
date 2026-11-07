---
title: "ADR-028: MVVM via hooks as the front-end architecture pattern"
status: accepted
edition: community
related:
  - ../02-ui.md
  - ../04-architecture-definition.md
  - ../06-application-architecture.md
  - ADR-027-penpot-design-tool.md
---

# ADR-028: MVVM via hooks as the front-end architecture pattern

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-03 |
| Decided by | Owner |
| Applies to | APP-22 Web, APP-23 Mobile; one Expo app since ADR-029 |
| Requirements affected | UI-1 to UI-9; 02 section 16 (front-end architecture) |

## Context

02 section 16 fixed the stack (Next.js and Expo at the time, one Expo app since ADR-029; generated TypeScript SDK, query cache for server state, small client store, SSE, offline action queue) but names no structural pattern. Without one, screen logic tends to collect inside components, which makes the screen states in 02 section 10 (loading, abstained, degraded, stale, synthetic) hard to test and hard to share between web and mobile. The edition split also needs a seam on the client: Full-only screens and adapters must load only in the private build.

## Decision

Use **MVVM implemented with hooks**, organised by feature, with one-way data flow.

| Layer | What it holds | Rules |
|---|---|---|
| View | Presentational components from `packages/ui-kit` and screen layouts | No data fetching, no business rules; renders only what the ViewModel gives it; every state has a Storybook story (UI-9) |
| ViewModel | One hook per screen or panel, for example `useIncidentDetailVM` | Combines server state, live updates and UI state into a typed view state; derives screen states (abstained, degraded by fallback level, stale stream, synthetic); exposes intent actions (for example request approval); platform-neutral so web and mobile share it |
| Model | Generated SDK (`packages/sdk-ts`), query cache, SSE client, offline action queue, shared schemas | The only layer that talks to the API; validates responses at runtime; no UI knowledge |
| Ports | Client-side interfaces for edition-specific behaviour (`packages/ports`) | Community adapters are public; Full adapters live in the private package and are selected by config, never imported directly |

Data flows View → ViewModel → Model → API for actions, and back as state through the query cache. Views never call the Model directly.

Code layout per app: `features/<screen>/view/` and `features/<screen>/model/`, with shared packages as listed in 02 section 16.

## Alternatives considered

| Option | Why not chosen |
|---|---|
| Classic MVC | Controllers map poorly onto React and React Native component trees and one-way data flow |
| Redux-style Flux store for all state | Heavy when most state is server data that the query cache already manages |
| Feature-Sliced Design | Strict multi-layer import rules add ceremony beyond what a solo build needs; the feature folders above keep its main benefit |

## Consequences

- ViewModels can be unit-tested without rendering, and every screen state in 02 section 10 maps to a ViewModel output that a test can assert.
- Web and mobile share ViewModels and differ only in Views where UX differs (02 section 16, cross-platform code).
- Safety rules sit in the ViewModel and stay testable there: approval actions are available only in a human session (invariant 2), AI text always carries a label and citations or abstention (UI-8), and the fallback banner is derived from `fallback.level`.
- Wireframes (ADR-027 amendment 2026-10-03) and Penpot frames name the ViewModel state they show, so design, stories and tests use the same state names.
