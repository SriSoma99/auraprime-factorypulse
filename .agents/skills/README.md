# Claude Code role skills

These are the project skills Claude Code worked under while building AuraPrime FactoryPulse. Each one is a `SKILL.md` file: front matter with a name and a description (Claude Code uses the description to decide when the skill applies), then the rules for one role. `.claude/skills` is a symlink to this folder, which is how Claude Code finds them.

| Skill | Role | What it makes the agent do |
|---|---|---|
| [fp-chief-architect](fp-chief-architect/SKILL.md) | Owns the end-to-end architecture and scope | Place every task in the scope, requirements and phase plan; on any deviation, stop and raise a hand to the owner with options and a recommendation |
| [fp-architecture-guardian](fp-architecture-guardian/SKILL.md) | Checks a single change against the design | Hold the safety invariants and design rules; draft a superseding ADR instead of deviating silently |
| [fp-engineering-principles](fp-engineering-principles/SKILL.md) | Applies to every task | Zero hardcoding (values are schema-validated config keys) and every architecture artifact in `doc/` |
| [fp-docs-sync](fp-docs-sync/SKILL.md) | Keeps the design set consistent | Propagate a decision through every affected document, keep IDs valid, run a cross-check before finishing |
| [fp-qa-lead](fp-qa-lead/SKILL.md) | Owns testing and the go or no-go | Traceability from requirements to tests; verdicts only from observed runs, via the gate runner [`verify.sh`](fp-qa-lead/verify.sh) |
| [fp-human-eye-review](fp-human-eye-review/SKILL.md) | Independent reviewer | Run it, look at it, report evidence; say what was not checked |
| [fp-ux-designer](fp-ux-designer/SKILL.md) | Owns the UI design | Screens tied to requirement IDs and ViewModel states; safety-critical UX rules |
| [fp-project-manager](fp-project-manager/SKILL.md) | Owns delivery tracking | Estimates, budget and hours from recorded data only; scope and quality are never traded for schedule |
| [fp-v1-code-review](fp-v1-code-review/SKILL.md) | Reviews the v1 code base | Read-only review with a defect log and a reuse decision per module |

Some skills refer to the delivery plan and the business architecture, which are internal documents and are not published here.

## How they fit together

- The skills hand work to each other by name. Anything that touches scope, an ADR or a safety invariant goes to the owner through the chief architect, never resolved by the agent.
- Claims need evidence. The QA lead and the human-eye reviewer report only what was run and observed, and "not run" is never reported as "passed".
- [`.claude/settings.json`](../../.claude/settings.json) backs the rules with permissions: the agent may run the build, tests and local git commits, and is denied `git push`, `git tag`, the cloud CLI, `rm -rf` and reading local secret files. Pushes stay with the owner.
