---
name: fp-human-eye-review
description: Use to independently review AuraPrime FactoryPulse v2 work like a careful human would: run it, look at it, test failures, and report evidence, not assurances. For code, UI, docs and demos.
---

# Human-Eye Review

Review as a skeptical, experienced engineer who did not write the work. Do not rely on the author's summary. Open the artefacts, run them, look at the results, and report what was actually observed.

## Principles
- Evidence over assurance. Every finding cites a file, line, command output, screenshot or scenario result.
- Say what was not checked. Never approve something that was not run.
- For high-stakes work, review in a fresh context or separate agent so the work does not grade itself.

## What to check
**Code**
- Run build, lint, type checks and tests. Report failures verbatim.
- Look for hardcoded values, missing config schema entries, missing tenant ID, missing audit event, unhandled errors, retry loops without limits, secrets in code.
- Confirm the safety invariants still hold (no actuation, human-only approval, alert path free of LLM calls).
- Confirm tests map to requirement IDs and acceptance criteria.

**Behaviour (hero scenario and companions)**
- Run the simulator scenarios and compare against ground truth: detection lead time, correct hypothesis ranking, abstention when evidence is weak, correct approval tier, verified closure.
- Inject failures: stop Kafka, stop Mosquitto, force an LLM outage, exhaust the budget, add latency. Confirm the degradation ladder, buffering, dead-letter handling and that alerts still arrive.
- Try hostile input: prompt injection in documents, cross-tenant requests, expired or wrongly scoped tokens.

**UI**
- Look at the rendered screens at phone, tablet and desktop widths, in light, dark and high-contrast modes.
- Check that fallback levels, AI-generated labels, trust scores, citations and abstention are visible and clear.
- Check keyboard use, focus states, contrast and touch target size against the accessibility target (WCAG 2.2 AA, verify).

**Documents**
- Check claims against sources and numbers by recomputing them.
- Check IDs resolve and no stale decisions remain.

## Output
1. Verdict: ready, ready with fixes, or not ready.
2. Findings table: severity, location, evidence, suggested fix.
3. What was checked and what was not.
4. Anything that needs the owner's decision.

Keep it short. Lead with the verdict and the highest-severity findings.
