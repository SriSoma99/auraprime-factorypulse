---
title: "ADR-014: Community licence posture - Business Source License 1.1"
status: superseded
edition: community
related:
  - ../04-architecture-definition.md
  - ../req/00-requirements.md
  - ../01-business.md
---

# ADR-014: Community licence posture - Business Source License 1.1

| Field | Value |
|---|---|
| Status | Superseded 2026-11-02 by [ADR-036](ADR-036-apache-open-source-release.md) (was Accepted) |
| Date | 2026-10-03 |
| Decided by | Owner |
| Resolves | OQ-1, BO-2; satisfies IP-3 |
| Requirements affected | IP-1 to IP-9 (REQ section 8.2); AC-6 |

## Context

The Community edition is public so that potential clients can see the design, documentation, tests and working stack (01 section 11.1: adoption, credibility, portfolio). The owner wants to protect commercial interest in the work while showing it. The differentiating parts stay in the private Full edition and are never published (AC-6, IP-6).

## Decision

- **Community edition:** Business Source License 1.1 (SPDX `BUSL-1.1`).
  - Licensor: the owner.
  - Additional Use Grant: **None**. Anyone may copy, modify, redistribute and make non-production use; any production use, including a hosted or managed service, needs a commercial licence from the owner.
  - Change Date: four years after each version is first published.
  - Change License: Apache License 2.0.
- **Full edition and this private repository:** all rights reserved; no licence granted.
- Licence files: `licensing/community/LICENSE` and `licensing/community/NOTICE` are copied to the root of the public export; the private repository root carries an all-rights-reserved `LICENSE`. Header conventions are in `licensing/README.md`.
- The IP-3 option of a permissive licence for SDKs, instrumentation and the MCP skeleton is not taken now. It can be revisited when the SDKs exist (WP-8) if adoption needs it.

## Alternatives considered

| Option | Why not chosen |
|---|---|
| MIT or Apache-2.0 | Allows anyone to use the work commercially; does not protect the owner's interest |
| AGPL-3.0 | Open source and blocks closed SaaS forks, but still allows commercial use by others |
| PolyForm Noncommercial | Strong, but less familiar to client engineering teams and never converts to open source |
| No licence (all rights reserved, public) | Protects rights but looks unfinished and blocks legitimate evaluation |

## Consequences

- BSL 1.1 is source-available, not open source. Public material must not call the Community edition "open source".
- Each published version becomes Apache-2.0 four years after publication; the Full edition is unaffected because it is never published.
- Commercial licences are offered case by case; a commercial licensing page is needed before the first public release.
- External contributions need a contributor agreement first (IP-4) so the owner keeps the right to license commercially.
- Before release: verify the licence text against the official template, counsel review (IP-5, OQ-9), trademark check (IP-8), and confirm the owner's employment terms do not claim the work.
- This record is a working decision, not legal advice.
