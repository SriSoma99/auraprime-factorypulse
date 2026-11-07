---
title: "RB-05 Retrieval down or knowledge index stale (L3)"
status: draft
edition: community
related:
  - ../03-technical-design.md
---

# RB-05 Retrieval down or knowledge index stale (L3)

**Symptoms:** Retrieval errors, ingestion failures, citation verification failing, banner at L3.

**Impact:** Diagnoses carry no fresh citations; procedures from last known good are flagged unverified. Minimum approval tier raised.

## Diagnose
- Check vector and keyword index health and the last successful ingestion.
- Check recent knowledge version changes and injection-scan rejections.

## Mitigate
- Roll back to the previous knowledge version if the latest one is bad.
- Re-run ingestion for failed documents after the cause is fixed.

## Recover
- Rebuild or repair indexes; confirm permission-aware filters still apply.

## Verify
- Citation coverage and retrieval hit rate back to baseline on the evaluation set.

## Escalate
Escalate to the project owner if the cause is unclear after the diagnose steps or if the incident affects safety invariants. Record what was done and when.

## Related
doc/03-technical-design.md RAG sections; RAG group requirements

> Commands and dashboard names will be added when the services exist (verify).
