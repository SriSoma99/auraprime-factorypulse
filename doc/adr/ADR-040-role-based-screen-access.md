---
title: "ADR-040: Role-based screen access with a tenant Admin module"
status: accepted
edition: community
related:
  - ../04-architecture-definition.md
  - ../req/00-requirements.md
  - ../02-ui.md
  - ../10-configuration.md
  - ADR-039-equipment-registry-sensor-health-otlp.md
---

# ADR-040: Role-based screen access with a tenant Admin module

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-11-05 |
| Decided by | Owner (2026-11-05: "the menu and features are RBAC"; role matrix approved as proposed; an admin module grants the permissions) |
| Implements | NFR-S6; adds UI-10 |
| Keeps | Invariant 2 (only human sessions approve), invariant 3 (audit writer), invariant 4 (tenant isolation); approval tiers stay in `policy.role_max_tier` (POL-2) |
| Components | UI API (`/v1/session`, `/v1/admin/*`, a check on every route), W09 Admin, the app navigation |

## Context

Every role saw every screen and the API served every route to any signed-in user. Approval decisions were already limited by tier, but screens, menus and the other features were not, which breaks NFR-S6 and the personas in 02 section 3.

## Decision

1. **Screens are the unit of access.** Thirteen screens and features (plant, line, alerts, approvals, field, knowledge, trust, learning, control tower, compliance, developer, admin, settings). Each role has `none` (hidden, and its API refused), `view` (read) or `use` (read and act).
2. **Defaults in configuration.** `rbac.screens` holds the approved matrix (02 section 4.4). The schema refuses a configuration that removes the admin role's own Admin access.
3. **Tenant overrides in the database.** `plat.role_permission` (migration 0013, forced row-level security) holds a tenant's changes. Effective access = config default, then tenant override, then the edition (Full-only screens resolve to `none` in Community).
4. **The API enforces it on every route.** A route table maps each `/v1` route to the screens that grant it and the level needed. A route without a rule is refused (default deny), and a test fails if a route is added without a rule. Responses are 403 with the reason.
5. **The app follows the same permissions.** `/v1/session` returns them; the sidebar, the phone tab bar, More and direct URLs follow them (a path the role may not view goes to its first permitted screen); view-only screens disable their actions.
6. **W09 Admin module.** Users with admin `use` assign roles to human users of their tenant and set or reset any role's screen access. Guards: no one changes their own role; API keys and agent tokens keep their issued role; the admin role's Admin access is locked. Every change is written through `gov.append_audit` (`rbac.role_assigned`, `rbac.permission_changed`) and needs an idempotency key.
7. **Approval rights are not screen access.** `use` on approvals lets a role open the decision controls; whether it may decide a tier is still `policy.role_max_tier` and invariant 2. The Admin module cannot grant approval authority.

## Alternatives considered

| Option | Why not chosen |
|---|---|
| Hide menu items only | Any user could still call the API or open the URL |
| Fixed matrix in code | Tenants could not adapt roles to their plant; a change would need a release |
| Admin edits approval tiers too | Approval authority is a safety policy (POL-2, invariant 2), owned by the chief architect in config, not a tenant screen setting |

## Consequences

- Demo users exist for every role, including a line operator and a tenant admin.
- Screens without their own API (control tower, compliance, learning, developer) are enforced in the app; their APIs get rules when they are built.
- Role changes take effect on the user's next request, because the role is read with each token.
