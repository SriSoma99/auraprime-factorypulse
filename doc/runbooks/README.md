---
title: Runbooks
status: draft
edition: community
related:
  - ../README.md
---

# Runbooks

First-draft operational runbooks derived from the design. Commands and dashboard names are added once services exist. Each runbook uses the same sections: symptoms, impact, diagnose, mitigate, recover, verify, escalate.

| ID | Runbook |
|---|---|
| RB-01 | [Kafka slow or unavailable](rb-01-kafka-unavailable.md) |
| RB-02 | [Mosquitto (site MQTT broker) down](rb-02-mosquitto-down.md) |
| RB-03 | [LLM outage or degradation (L1 and L2)](rb-03-llm-outage.md) |
| RB-04 | [Budget circuit breaker tripped](rb-04-budget-breaker.md) |
| RB-05 | [Retrieval down or knowledge index stale (L3)](rb-05-retrieval-stale.md) |
| RB-06 | [ML services down (L4)](rb-06-ml-down.md) |
| RB-07 | [Cloud or platform link lost (L5, edge-only)](rb-07-link-lost.md) |
| RB-08 | [Dead-letter queue growing](rb-08-dlq-growth.md) |
| RB-09 | [PostgreSQL restore](rb-09-database-restore.md) |
| RB-10 | [Cross-tenant access attempt (security event)](rb-10-cross-tenant-event.md) |
| RB-11 | [Configuration change rollback](rb-11-config-rollback.md) |
| RB-12 | Public demo abuse or cost spike (internal, not published) |

Runbook IDs (RB-xx) are defined here. Use them when citing a runbook from other documents.
