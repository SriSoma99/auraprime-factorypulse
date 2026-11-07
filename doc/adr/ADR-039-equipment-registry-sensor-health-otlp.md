---
title: "ADR-039: Equipment registry with limits, basic sensor health and OTLP/HTTP ingest"
status: accepted
edition: community
related:
  - ../04-architecture-definition.md
  - ../req/00-requirements.md
  - ../02-ui.md
  - ../06-application-architecture.md
  - ../09-messaging.md
  - ../10-configuration.md
  - ADR-030-ui-first-mock-backend.md
---

# ADR-039: Equipment registry with limits, basic sensor health and OTLP/HTTP ingest

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-11-05 |
| Decided by | Owner (direction of 2026-11-05: equipment and sensor map first, operating limits, zero-data and faulty-sensor detection over MQTT/IoT, no open issues) |
| Amends | ING-7 (the registry now holds limits and machine state rules); W01 is no longer the first screen |
| Adds | ING-12, ING-13, W14 |
| Keeps | TRU-1 to TRU-4 (the cross-sensor trust score stays Full); RAG-11; invariants 4, 5 and 6 |
| Components | APP-02 (Ingest Gateway), APP-03 (Stream Processor), DS-01, the UI API (`/v1/plant`), W14 |

## Context

Technical leaders and plant operators judge an IoT product first by whether it knows the plant: every line, machine and sensor, the normal operating range of each sensor, and whether each sensor is reporting at all. The registry (ING-7) held only names and units. Readings for sensors nobody registered were accepted by APP-02 and failed later, at the database foreign key. The trust panel (W05, TRU-1) covered staleness and flatline only as part of the Full trust score, two screens away from the first view.

A contributor added an OTLP metrics decoder and a 10-station CNC line template. The decoder took the tenant from the payload and invented site, line and machine IDs when they were missing.

## Decision

1. **Limits live in the registry.** `ref.sensor` gains measurand, normal range, instrument range and maximum silence; `ref.asset` gains equipment type, plant tag, model and a state rule (state sensor, run threshold, stop threshold). Migration 0012. They are never sourced from documents (RAG-11).
2. **One plant template.** The CNC line template (`packages/synthetic-data/src/topology/`, template_version 1.0) seeds the registry, drives the `cnc_machining_line` simulator scenario and matches the OTLP replay fixture. A test keeps its JSON and TypeScript copies identical.
3. **Basic sensor health is Community (ING-12).** Deterministic rules against registry limits and the readings in a configured window: no data, stale (silent longer than the sensor's maximum silence), out of range (low or high), flatline (the last N readings within a tolerance of the normal span, judged only while the machine runs or its state is unknown) and OK. Machine state (running, idle, stopped, unknown) comes from the state rule. The cross-sensor trust score and fault classification stay in TRU-1 to TRU-3 (Full).
4. **The registry gates ingest.** APP-02 dead-letters a reading as `unknown_sensor` when the tenant never registered the sensor or names a different site, line, machine or (on MQTT, where the topic names it) station. The registry is cached per tenant for `ingest.registry_refresh_s`.
5. **OTLP/HTTP JSON receiver in APP-02 (ING-13).** `POST` on `ingest.otlp_http.path`; the tenant comes from a device API key (an `api_key` principal), never from the payload: a resource naming another tenant is dead-lettered as `tenant_mismatch`, and a request without a tenant is rejected. Resources without site, line and machine are rejected rather than filled with defaults. Responses follow OTLP partial success. Protobuf is not accepted (415).
6. **First screen.** W14 Plant equipment becomes the landing screen: lines, stations, machines with state, and every sensor with value, normal range and health, shown by symbol and label. W01 Line overview moves to `/line`.
7. **Thresholds are configuration.** `telemetry_health.*`, `ingest.max_future_skew_s`, `ingest.max_past_skew_s`, `ingest.registry_refresh_s` and `ingest.otlp_http.*` (doc/10, doc/config/keys.md).

## Alternatives considered

| Option | Why not chosen |
|---|---|
| Keep sensor health inside TRU-1 (Full) | The public Community build would show the plant without telling whether a sensor reports, which is the first thing a plant engineer checks |
| Take the OTLP tenant from resource attributes | Any sender could write into another tenant's data (invariant 4) |
| Check unknown sensors only at the database foreign key | The reading is lost in the stream processor with no dead-letter record and no reason |
| Limits parsed from uploaded manuals | Breaks RAG-11; documents can be wrong, superseded or poisoned |

## Consequences

- The real-time path stays deterministic: no rule here calls a model or MCP (invariant 6).
- A sensor with no limits is reported as "not configured", never as healthy.
- Every sensor shows "no data" until telemetry flows; the screen says how to start the local pipeline.
- The MQTT ingest test now uses a registered sensor; new tests cover the registry check, the OTLP receiver end to end, the health rules, the plant API and the W14 screen.
- The UI API gains `GET /v1/plant` and the local-only control `POST /mock/telemetry` (ADR-030).
