---
title: "RB-03 LLM outage or degradation (L1 and L2)"
status: draft
edition: community
related:
  - ../03-technical-design.md
---

# RB-03 LLM outage or degradation (L1 and L2)

**Symptoms:** Model gateway errors or timeouts, narration failures, banner showing L1 or L2.

**Impact:** Diagnoses continue from the causal engine. Narrative becomes a smaller local model (L1) or a template with citations (L2).

## Diagnose
- Check the model gateway for provider errors, rate limits and latency.
- Confirm the fallback controller changed level automatically and logged it.
- Confirm restricted data is only routed to local models.

## Mitigate
- Do nothing to force a level up; the controller recovers automatically with hysteresis (FBK-4).
- If the local model is down, confirm L2 templates are in use.
- Notify users if the outage is long.

## Recover
- Level returns to L0 automatically after health checks pass.

## Verify
- Banner clears, narrative citations verified, evaluation gate results unchanged.

## Escalate
Escalate to the project owner if the cause is unclear after the diagnose steps or if the incident affects safety invariants. Record what was done and when.

## Related
doc/03-technical-design.md fallback controller and model gateway; FBK-1 to FBK-4

> Commands and dashboard names will be added when the services exist (verify).
