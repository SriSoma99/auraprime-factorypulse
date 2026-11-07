---
title: "RB-10 Cross-tenant access attempt (security event)"
status: draft
edition: community
related:
  - ../05-data-architecture.md
---

# RB-10 Cross-tenant access attempt (security event)

**Symptoms:** Security-event alert for a cross-tenant read, write, retrieval or tool call.

**Impact:** Potential data exposure between tenants.

## Diagnose
- Identify principal, tenant, object and trace from the audit event.
- Check whether any data was returned or only the attempt was blocked.

## Mitigate
- Revoke or suspend the credential or tool grant involved.
- Preserve evidence; do not alter audit records.
- If data was returned, start the incident process and the notification review with counsel.

## Recover
- Fix the control gap; add an isolation test that reproduces it.

## Verify
- Isolation test suite passes; audit chain intact.

## Escalate
Escalate to the project owner if the cause is unclear after the diagnose steps or if the incident affects safety invariants. Record what was done and when.

## Related
doc/05-data-architecture.md tenancy; NFR-S10

> Commands and dashboard names will be added when the services exist (verify).
