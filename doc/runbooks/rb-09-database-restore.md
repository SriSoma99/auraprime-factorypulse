---
title: "RB-09 PostgreSQL restore"
status: draft
edition: community
related:
  - ../05-data-architecture.md
---

# RB-09 PostgreSQL restore

**Symptoms:** Database volume lost or corrupted, or point-in-time recovery needed.

**Impact:** Platform state unavailable until restored.

## Diagnose
- Confirm the failure and the target recovery point.
- Confirm the latest base backup and log archive are readable.

## Mitigate
- Restore from base backup and replay the log to the recovery point.
- Keep services stopped or read-only until the restore is verified.

## Recover
- Run integrity checks, including the audit chain verification job.
- Reconcile Kafka offsets and outbox so events are not lost or duplicated.

## Verify
- Restore meets the recovery targets (RPO and RTO in doc/07-technology-architecture.md).
- Audit chain verifies end to end.

## Escalate
Escalate to the project owner if the cause is unclear after the diagnose steps or if the incident affects safety invariants. Record what was done and when.

## Related
doc/05-data-architecture.md resilience; NFR-R4, QAS-8

> Commands and dashboard names will be added when the services exist (verify).
