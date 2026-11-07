---
name: fp-v1-code-review
description: Use to review the v1 code (published as FactoryPulseAI) at the configured legacy path, log its defects, and decide per component what to reuse, adapt, rewrite or discard for v2. Read-only on v1.
---

# v1 (FactoryPulseAI) Code Review and Reuse

Review the existing v1 code as a skeptical senior engineer. Find defects, then decide what v2 should keep. v1 is a reference. Never modify it.

## Where v1 lives (no hardcoded path)
The v1 location is configuration, not text in this skill.
1. Read the key `legacy.v1_path` from the project configuration (see the configuration reference in `doc/config/`). An environment override is allowed.
2. If no value is set, ask the owner for the path once and record it in configuration. Do not guess and do not write a literal path into any skill, document or code.
3. If the path is outside the workspace, the owner may add it as an extra workspace folder or link it into a git-ignored folder inside the workspace. Treat the folder as read-only either way.
4. Confirm the folder exists and is a v1 checkout (look for the expected structure) before reviewing. Record the commit or version reviewed.

## Inputs
- The v1 to v2 migration tables in the application and data architecture documents under `doc/`.
- The requirements, ADRs and the safety invariants (see fp-architecture-guardian and fp-engineering-principles).

## Procedure
1. **Inventory.** List v1 modules and what each does. Map each to the v2 component it feeds (APP IDs) using the migration table. Flag anything unmapped.
2. **Review each module** for:
   - correctness and error handling;
   - resilience: retries without limits, missing timeouts, no idempotency, no back-pressure, lost messages;
   - security: secrets in code, injection, weak auth, unsafe deserialisation, dependency risks;
   - hardcoded values that should be configuration;
   - missing tenant ID and audit events;
   - observability gaps: no trace context, no metrics;
   - tests: missing, flaky or tied to hardcoded data;
   - code quality: duplication, dead code, unclear boundaries.
3. **Run what can be run** (tests, linters, type checks) and capture real output. Do not claim a result that was not observed.
4. **Log defects.** Give each an ID in the form V1-D-001, with severity, location (file and line), evidence, impact and the v2 requirement or invariant it touches.
5. **Decide per module:** reuse as is, adapt (list the changes), rewrite (say why), or discard. State the reason in one line.
6. **Plan the reuse.** For adapted code: copy through a change that adds tests first, removes hardcoding into configuration schema entries, adds tenant ID, audit and tracing, and keeps a provenance note (origin file and commit).
7. **Write results to `doc/`.** Put the defect log and decisions in a legacy review document under `doc/` and update the migration tables where the decision changes. Use existing IDs only; define new IDs in `doc/` before citing them.

## Rules
- Read-only on v1. Never edit, commit to or delete anything in the legacy folder.
- Do not copy secrets, credentials or real data. v1 data is synthetic, but check anyway.
- Check licences of copied third-party code and dependencies.
- A defect that violates a safety invariant is critical and blocks reuse until fixed.
- Mark anything unverified as verify.

## Output
1. Summary: components reviewed, defects by severity, reuse decisions in a table.
2. Defect log and decisions saved under `doc/`.
3. What was run, what was not, and questions for the owner.
