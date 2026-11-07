---
title: "ADR-027: Penpot as the design tool (supersedes ADR-016)"
status: accepted
edition: community
related:
  - ../04-architecture-definition.md
  - ../02-ui.md
  - ../req/00-requirements.md
---

# ADR-027: Penpot as the design tool (supersedes ADR-016)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-10-01 |
| Decided by | Owner |
| Supersedes | ADR-016 (Figma-first UI with a variables-to-tokens pipeline) |
| Resolves | OQ-7, OI-7, UO-1 |
| Requirements affected | UI-1, UI-2, UI-9; scope item "Web and mobile UI" in REQ section 2.1 |

## Context

ADR-016 chose Figma first, with a pipeline from Figma variables to tokens. Its status recorded an open question on plan limits (OQ-7): Figma features the pipeline depends on, such as variables through the API and Dev Mode, can require a paid plan. The project has a spend cap (AC-1), and the owner has decided not to pay for design tooling.

The design-first principle of ADR-016 is still wanted: the design is approved before UI code starts (UI-1), tokens flow from the design into code (UI-2), and code is checked against the design (UI-9).

## Decision

Use **Penpot** (open source) as the design tool for the web and mobile UI, on the free Penpot cloud workspace. Self-hosting Penpot with Docker is the fallback if cloud terms, limits or availability change.

- The design-first principle from ADR-016 stays: design approved before UI implementation (UI-1).
- Tokens are defined as Penpot design tokens (W3C Design Tokens Community Group draft format), with themes for the light, dark and high-contrast modes, and exported as JSON into the Style Dictionary pipeline (UI-2).
- Claude works in the design files through Penpot's hosted MCP server (remote mode), authenticated with the owner's personal MCP key. The local server (`@penpot/mcp`) with the Penpot MCP plugin is the fallback. Amended 2026-10-02 by the owner; see Consequences.
- Visual regression baselines are frames exported from the approved Penpot version (UI-9).

## Alternatives considered

| Option | Why not chosen |
|---|---|
| Keep Figma (ADR-016) on a paid plan | Recurring cost against the spend cap (AC-1) |
| Keep Figma on the free plan | Plan limits on variables and dev features weaken the token pipeline (OQ-7) |
| Excalidraw or draw.io | Wireframes only; no tokens, components with variants, or prototypes |
| HTML wireframes in code | Not a design file; mixes design with implementation before UI-1 |

## Consequences

- No design-tool spend. The token pipeline stays, with the source changing from Figma variables to Penpot token JSON.
- Penpot's handoff ecosystem is smaller than Figma's. There is no Code Connect equivalent, so components link to their Storybook story and repository path through annotations instead.
- The Penpot MCP server lets the agent run arbitrary code inside the owner's design files. In remote mode it is hosted by Penpot and reached with a personal MCP key. The key is a secret: it is held in an environment variable on the owner's machine and referenced by name in the project MCP client config (`.mcp.json`), never written to the repository or to chat. Only one key exists per user; rotate it in Penpot (Your account, Integrations, MCP Server) if it is exposed. If the local fallback is used, it runs only on the owner's machine, is started on demand and is never exposed outside that machine.
- Remote mode needs the MCP plugin connected in a design file open in a browser tab. Penpot's documentation (help.penpot.app/mcp) says so, and there is no headless mode. Observed 2026-10-02: the connection dropped within minutes once the tab was no longer active.
- Designs are kept on the Penpot cloud. They hold UI layouts and synthetic sample data only (ADR-019), never secrets or private algorithms. Self-hosting is available if that changes.
- Version support to verify: named versions for the "approved for build" milestone, and token JSON export details in the Penpot version in use.

## Amendment 2026-10-03 (owner): diagrams as code; agent use of Penpot paused

- Unattended agent work in Penpot failed: the remote MCP connection depends on a live browser tab, and a headless browser keeper could not sign in because the account uses Google sign-in, which rejects automated browsers. The owner decided not to spend more time on it.
- Architecture and other diagrams are written as code in `doc/diagrams/` (Mermaid in the documents, rendered HTML and SVG views beside them), as 02-ui TA-1 already allows. The first is the application architecture view, `diagrams/application-architecture.html`.
- Penpot stays the design tool for the UI (UI-1, UI-2, UI-9). The owner works in it directly; agent access through MCP is used only in sessions where the owner has the file open with the plugin connected.
- Options if unattended access is needed later: Penpot's RPC API with a personal access token (headless, low-level), or self-hosting with email and password sign-in. Both need a spike before use.

## Amendment 2026-10-03 (owner): low-fidelity HTML wireframes

- Low-fidelity wireframes of the screens in 02 section 6 are drawn as static HTML pages in `doc/wireframes/`, with synthetic data only (ADR-019). They are design references, not application code, and nothing in `apps/` may import them.
- They replace the ASCII sketches in 02 section 7 as the structure reference for each screen, and name the ViewModel state they show (ADR-028).
- Penpot stays the source of the hi-fi design and of the tokens. UI-1 ("design approved for build") is still met only by the approved Penpot version; the wireframes are an input to it.
- This narrows the "HTML wireframes in code" alternative rejected above: what was rejected was using code as the design file and mixing it with implementation. These pages are neither.

## Amendment 2026-10-05 (owner): Penpot replaced by Interactive HTML Wireframes and Code-First Expo Prototype ($0 budget)

- Penpot adoption discontinued: the owner evaluated Penpot directly and determined it did not work well for wireframing, while maintaining strict $0 design-tool spend (AC-1).
- Design reference & structure: interactive HTML wireframes in `doc/wireframes/` serve as the design specification. They capture layout structure, semantic copy, responsive behavior, dark/light themes, and interactive ViewModel state switching (`normal`, `loading`, `partial_data`, `alerting`, `permission_denied`, and degradation levels L0–L5).
- High-fidelity & styling: implemented directly in the Expo universal app (`apps/app`, ADR-029) against the contract-driven mock API (ADR-030). Optional high-fidelity canvas work may use Figma's free starter tier ($0) if needed.
- UI-1 gate ("design approved for build") is satisfied by owner sign-off on the interactive HTML wireframes in `doc/wireframes/` and working Expo screens, removing any external Penpot dependency.

