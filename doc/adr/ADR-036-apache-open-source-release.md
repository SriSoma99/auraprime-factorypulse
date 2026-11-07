---
title: "ADR-036: Open-source release under Apache License 2.0"
status: accepted
edition: community
related:
  - ../04-architecture-definition.md
  - ../req/00-requirements.md
  - ../06-application-architecture.md
  - ADR-014-licence-posture.md
---

# ADR-036: Open-source release under Apache License 2.0

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-11-02 |
| Decided by | Owner |
| Supersedes | ADR-014 (Business Source License 1.1 for Community; Full edition all rights reserved) |
| Amends | P-10 (04 section 3); AC-6 (REQ section 2.4); IP-2, IP-3, IP-4, IP-6 (REQ section 8.2) |
| Keeps | ADR-007 (ports and adapters remain the extension seam) |

## Context

ADR-014 kept the differentiating engines in a private Full edition and published a source-available Community edition under BSL 1.1. In practice the engines (drift, trust, line impact, causal ranking, policy, learning) were implemented in the main code paths of `apps/intel-core`, `apps/case-svc` and `apps/governance-svc`, so a Community export without them would not stand alone (IP-1). The owner's goal for the public repository is now an open-source showcase, and BSL 1.1 is not an open-source licence.

## Decision

- All source code, tests, the API contract, configuration schema and the design documents cleared for publication are released under the **Apache License 2.0** (SPDX `Apache-2.0`) in a public repository.
- The public repository is produced by the export tool from this repository. Only documents whose front matter says `edition: community` are published; `edition: full` now means **internal** (business model, delivery plan and budget, review records, hosted-demo operations).
- `community` and `full` remain as configuration profiles that select adapters (ADR-007). They no longer mark a licensing boundary.
- Amended 2026-11-07: the public export builds with the `full` profile (`tools/export/manifest.json` `buildEdition`), so the published app shows every engine the README describes. The `community` profile still exists for deployments that want the smaller adapter set.
- Inbound contributions are accepted under the same licence with a Developer Certificate of Origin sign-off (IP-4). `licensing/CLA.md` is retired from the public export.
- This private repository keeps its all-rights-reserved root `LICENSE` until the owner decides to publish it directly; the public export carries `LICENSE` (Apache-2.0) and `NOTICE`.

## Alternatives considered

| Option | Why not chosen |
|---|---|
| Keep BSL 1.1 (ADR-014) | Not open source; conflicts with the owner's goal |
| AGPL-3.0 | Open source, but deters evaluation by client engineering teams |
| MIT | Equivalent intent, but no explicit patent grant or NOTICE convention |
| Open core with a private brain package | Needs a refactor to move the engines out of the main code paths; the owner chose to publish them |

## Consequences

- The differentiating engines become public. P-10 changes from "open core, closed brain" to "open source, governed export": internal material stays out of the export, the code does not.
- AC-6 is superseded. IP-6 still applies to tuned parameters, prompts and datasets that are not in the repository.
- **Publication is irreversible.** IP-5 (counsel on patentability before any public release, because publication can destroy novelty in many jurisdictions) and the employment-terms check from ADR-014 remain pre-publication steps. Open issue OI-11 tracks the owner's decision to complete or waive them.
- IP-8 (trademark and name check) and IP-9 (no employer, client or third-party material) still apply before publication. The source of the reference diagram in 08 must be confirmed under IP-9.
- Documents that describe the Full edition as private are stale after this decision and are corrected in the published set (open issue OI-12).
- This record is a working decision, not legal advice.

## Amendment 2026-11-03: Claude Code skills are published

- Owner decision: the Claude Code role skills (`.agents/skills/`, with an index page) and the agent permission rules (`.claude/settings.json`) are published in the export, as evidence of how the project was engineered.
- `CLAUDE.md`, `AGENTS.md`, `.agents/rules/` and `.mcp.json` stay internal.
- The skills' edition wording was aligned with this ADR. References to internal documents are marked "(internal, not published)" by the export tool, and the QA gate runner tolerates the absent delivery plan.
