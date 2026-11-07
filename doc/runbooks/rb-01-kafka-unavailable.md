---
title: "RB-01 Kafka slow or unavailable"
status: draft
edition: community
related:
  - ../09-messaging.md
---

# RB-01 Kafka slow or unavailable

**Symptoms:** Consumer lag rising, producer errors, ingest returning retry-after, DLQ or spool depth growing, degraded-level banner.

**Impact:** New telemetry may be delayed; alerts from the edge continue. Platform may drop to a degraded level (FBK-1).

## Diagnose
- Check broker health, disk space and partition leadership on the platform dashboard.
- Check consumer lag per group and whether lag is falling or growing.
- Confirm APP-02 is spooling to its bounded local queue and the edge agents are buffering.

## Mitigate
- Free disk or restart the broker if the cause is clear; do not delete topic data.
- If lag is from one slow consumer, scale or restart that consumer, not the broker.
- If the spool is near its limit, confirm the loss policy: lowest-priority telemetry first, never alerts.

## Recover
- Wait for lag to fall and the spool to drain.
- Confirm ordered replay from the edge completed and no gaps remain (compare sequence numbers).

## Verify
- Alert path latency is back within the target (5 s p95).
- DLQ depth stable, no duplicates (idempotency keys deduplicated).

## Escalate
Escalate to the project owner if the cause is unclear after the diagnose steps or if the incident affects safety invariants. Record what was done and when.

## Related
doc/09-messaging.md sections 4 and 5; NFR-R2, NFR-R3, ING-2

> Commands and dashboard names will be added when the services exist (verify).
