---
title: "ADR-029: One Expo (React Native) app for web and mobile"
status: accepted
edition: community
related:
  - ../02-ui.md
  - ../06-application-architecture.md
  - ../07-technology-architecture.md
  - ADR-028-ui-mvvm-pattern.md
---

# ADR-029: One Expo (React Native) app for web and mobile

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-04 |
| Decided by | Owner |
| Changes | Web framework in 02 section 16 and 07 section 3.1 (was Next.js); scope item "Web and mobile UI" in REQ section 2.1; UI-3 |
| Applies to | APP-22 Web App, APP-23 Mobile App; DU-14, DU-15 |

## Context

The plan had two front-end apps: Next.js for web (APP-22) and Expo for mobile (APP-23), sharing components, ViewModels and the SDK in one monorepo. The owner wants one implementation that serves both, so the complete UI can be built and tested against mock data before the backend, with one developer (R-9).

## Decision

- Build **one universal Expo (React Native) app** in TypeScript with Expo Router, compiled to **web** (React Native Web, static export) and to **iOS and Android**.
- APP-22 and APP-23 stay as separate application components and deployable units: DU-14 is the web build and DU-15 the native builds, both from the same codebase (`apps/app/`).
- ADR-028 (MVVM via hooks) applies unchanged. ViewModels, the SDK, tokens and almost all Views are shared. Platform-specific Views (`*.web.tsx`) are used where UX differs, mainly dense tables and charts on desktop web (02 section 16, cross-platform code).
- Any public marketing or documentation site that needs search-engine-friendly server rendering is a separate static site, not part of this app.

## Alternatives considered

| Option | Why not chosen |
|---|---|
| Next.js web plus Expo mobile (previous plan) | Two apps, two routing models and two build pipelines for one developer; slower to get the whole UI testable |
| Next.js with responsive mobile web, no native app | Loses native camera, QR, offline storage and push behaviour needed by UI-5 |
| Vue (Nuxt) | No shared native mobile path; would rework ADR-028 |

## Consequences

- One codebase, one router and one component library for web, iOS and Android.
- The web build is a single-page app without server rendering; acceptable for a signed-in operations tool.
- Charting, table and styling libraries must support web and native. The TO-5 styling spike is narrowed to options that do (for example NativeWind or Tamagui, verify).
- Dense desktop screens (W02, W06, W08) may need web-specific Views; budget for this in WP-9 estimates.
- Wireframes, the component inventory and acceptance criteria in 02 are unaffected.
