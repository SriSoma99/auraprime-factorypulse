---
title: "RB-06 ML services down (L4)"
status: draft
edition: community
related:
  - ../06-application-architecture.md
---

# RB-06 ML services down (L4)

**Symptoms:** Detection or trust service errors; banner at L4.

**Impact:** Only thresholds and control charts run; no drift scoring or lead-time estimates.

## Diagnose
- Check detection and trust service health, model registry reachability and recent model changes.

## Mitigate
- Roll back to the last approved model version.
- Restart services; do not retrain under pressure.

## Recover
- Confirm detectors reload the approved model and thresholds from config.

## Verify
- Hero scenario replay detects with expected lead time.

## Escalate
Escalate to the project owner if the cause is unclear after the diagnose steps or if the incident affects safety invariants. Record what was done and when.

## Related
doc/06-application-architecture.md; DET group requirements, FBK-1

> Commands and dashboard names will be added when the services exist (verify).
