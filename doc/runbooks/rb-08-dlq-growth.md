---
title: "RB-08 Dead-letter queue growing"
status: draft
edition: community
related:
  - ../09-messaging.md
---

# RB-08 Dead-letter queue growing

**Symptoms:** Dead-letter topic depth rising, validation or schema errors.

**Impact:** Some messages are not processed; if sustained it hides data loss.

## Diagnose
- Group dead-lettered messages by reason and source.
- Check for a schema change, a misconfigured device or a bad deployment.

## Mitigate
- Fix the producer or schema; never delete dead-lettered data before it is analysed.
- Replay messages after the fix, through the normal path with idempotency keys.

## Recover
- Replay in controlled batches and watch for duplicates.

## Verify
- Dead-letter depth back to baseline; reason categories reviewed.

## Escalate
Escalate to the project owner if the cause is unclear after the diagnose steps or if the incident affects safety invariants. Record what was done and when.

## Related
doc/09-messaging.md sections 4 and 5; ING-3

> Commands and dashboard names will be added when the services exist (verify).
