---
title: "RB-04 Budget circuit breaker tripped"
status: draft
edition: community
related:
  - ../09-messaging.md
---

# RB-04 Budget circuit breaker tripped

**Symptoms:** Alert that spend limit reached, forced L1 or L2, cost tracker at limit.

**Impact:** Narrative quality reduced; detection and diagnosis continue.

## Diagnose
- Read the tenant's level and reason: `ops.platform_state` (a reason starting `[model-gateway]` was set by the breaker), and the `fallback.level` entries in the audit chain.
- Find what consumed the budget: `ops.cost_ledger` by day, provider, model and purpose, for the tenant.
- Check for runaway loops, retry storms or an abnormal alert flood.

## Mitigate
- Fix the cause first (loop, flood, wrong model route).
- Change the budget only through configuration with an audit reason; never bypass the breaker.

## Recover
- The daily budget renews at 00:00 UTC; the total budget only by an approved config change. The level then recovers one step at a time after `model.breaker.recovery_hysteresis_ms`.

## Verify
- Spend per role back inside budget; level recovered.

## Escalate
Escalate to the project owner if the cause is unclear after the diagnose steps or if the incident affects safety invariants. Record what was done and when.

## Related
doc/09-messaging.md and doc/10-configuration.md; FBK-3, NFR-C4

> Budgets and thresholds: `model.budget.*` and `model.breaker.*` in doc/config/keys.md. Dashboard names will be added when the observability stack exists (verify).
