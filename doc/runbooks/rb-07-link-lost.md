---
title: "RB-07 Cloud or platform link lost (L5, edge-only)"
status: draft
edition: community
related:
  - ../09-messaging.md
---

# RB-07 Cloud or platform link lost (L5, edge-only)

**Symptoms:** Edge agents cannot reach the platform; local alert text only.

**Impact:** Edge rules and buffer protect the alert path. Local acknowledgement only; sync later.

## Diagnose
- Confirm the outage is network, certificates or the platform.
- Check edge buffer capacity versus expected outage length.

## Mitigate
- Restore connectivity; confirm edge identity and certificates are valid.
- If the buffer will fill, apply the loss policy and record it.

## Recover
- Edge replays in order; platform reconciles local acknowledgements.

## Verify
- No sequence gaps, acknowledgements synced, incidents reconciled.

## Escalate
Escalate to the project owner if the cause is unclear after the diagnose steps or if the incident affects safety invariants. Record what was done and when.

## Related
doc/09-messaging.md section 5; FBK-1, ING-2

> Commands and dashboard names will be added when the services exist (verify).
