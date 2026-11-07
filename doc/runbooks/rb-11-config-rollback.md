---
title: "RB-11 Configuration change rollback"
status: draft
edition: community
related:
  - ../10-configuration.md
---

# RB-11 Configuration change rollback

**Symptoms:** Behaviour changed after a config change, or a config change was rejected or caused errors.

**Impact:** Thresholds, routing or limits may be wrong for a site or tenant.

## Diagnose
- Find the change in the config audit trail (who, when, old and new value, reason, config hash).
- Compare effective values by layer.

## Mitigate
- Roll back to the previous version; check that the rollback does not loosen a safety invariant.

## Recover
- Confirm hot-reload keys applied and restart-required keys were restarted.

## Verify
- Behaviour matches the previous baseline; the run records show the expected config hash.

## Escalate
Escalate to the project owner if the cause is unclear after the diagnose steps or if the incident affects safety invariants. Record what was done and when.

## Related
doc/10-configuration.md

> Commands and dashboard names will be added when the services exist (verify).
