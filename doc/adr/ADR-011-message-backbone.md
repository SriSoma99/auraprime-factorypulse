---
title: "ADR-011: Kafka as the event backbone, with NATS JetStream as the fallback adapter"
status: accepted
edition: community
related:
  - ../04-architecture-definition.md
  - ../09-messaging.md
  - ../07-technology-architecture.md
  - ../req/00-requirements.md
---

# ADR-011: Kafka as the event backbone, with NATS JetStream as the fallback adapter

| Field | Value |
|---|---|
| Status | Accepted (revised from "Proposed: NATS JetStream candidate") |
| Date | 2026-10-01 |
| Decided by | Chief architect, under explicit delegation from the owner ("if there is greater advantage, the architect decides"). The owner can overturn it. |
| Companion decision | ADR-026: Mosquitto as the site MQTT broker, with APP-02 as the only bridge |
| Resolves | OI-5 narrowed to tuning; DO-1 resolved; TO-2 reframed |
| Requirements | ING-1 to ING-6, NFR-P1, NFR-P2, NFR-R3, NFR-R6, NFR-C1 to NFR-C3, SIM-4, SIM-5, AC-H8, AC-H9 |

## Context

The first draft named NATS JetStream as the backbone candidate for its light footprint. Document 09 then designed the messaging layer on Apache Kafka with Mosquitto at the plant edge. The owner asked for the low-cost, viable option and delegated the choice.

All three candidates are open source and free, so the cost difference is desktop RAM and operating effort, not money. In the cloud, the backbone does not decide the cost: NFR-C2 requires scaling to zero, which neither Kafka nor NATS does, so cloud validation uses the Pub/Sub adapter or a short-lived VM under the spend cap (NFR-C1, ADR-018).

## Options and evaluation

| Criterion (source) | Mosquitto + Kafka | NATS JetStream alone | Mosquitto + NATS JetStream |
|---|---|---|---|
| MQTT 5 at the edge with 3.1.1 compatibility, Sparkplug B (ING-1, 09 section 1) | Yes | No: NATS speaks MQTT 3.1.1 only and rejects MQTT 5 clients | Yes |
| Ordered replay, deduplication, DLQ and replay tooling (ING-2 to ING-4, SIM-4, AC-H9) | Yes; most mature tooling | Yes; tooling is largely self-built | Yes; tooling is largely self-built |
| Schema registry (09 contracts) | Yes; standard Kafka ecosystem | No native registry | No native registry |
| Throughput and latency targets (NFR-P1, NFR-P2) | Meets | Meets | Meets |
| Cloud cost (NFR-C1, NFR-C2) | Same for all: Pub/Sub adapter in the cloud | Same | Same |
| Desktop RAM (07 section 10) | Highest: about 1.5 to 2 GB with the schema registry (verify in TO-2) | Lowest | About 100 MB |
| One-person operation (ADR-005) | Most effort | Least effort | Low effort |
| Showcase value to industrial and automotive buyers (REQ section 1) | Highest; the recognised standard | Lower | Lower |
| Governance stability | Stable | Licence and foundation dispute in 2025, resolved: stays Apache-2.0 under the CNCF | Same as NATS |
| Rework of the design documents | None; 09 is written for it | Large | Medium |

## Decision

1. **Apache Kafka in KRaft mode is the event backbone**, with a schema registry. On the desktop it runs as one broker with replication factor 1. A three-broker profile is used only for chaos tests.
2. **Eclipse Mosquitto is the site MQTT broker** (ADR-026). It stays in every option.
3. **NATS JetStream is the named fallback adapter** behind the transport abstraction (ING-6). The trigger for switching is a TO-2 spike result showing that the full desktop stack does not fit the reference desktop (OQ-4, OI-3) with the baseline scenario. Switching changes the adapter and deployment, not the services.
4. Google Pub/Sub stays an optional adapter for cloud validation.

## Consequences

- No extra spend. Desktop RAM is the cost; TO-2 measures it before the stack is fixed.
- 09 stays the messaging design. 03, 05 and 06 use Kafka terms: topics and partition keys instead of subjects.
- The adapter contract tests must cover Kafka and keep NATS JetStream passable, so the fallback stays real rather than theoretical.
- Remaining design work from 09 section 9 (APP-02 roles, deployable units, ingestion section, new requirements) is tracked under OI-5 until applied.
