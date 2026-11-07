---
title: Configuration key reference
status: draft
edition: community
related:
  - ../10-configuration.md
  - ../adr/ADR-030-ui-first-mock-backend.md
---

# Configuration key reference

Generated from `packages/config/src/schema.ts` by `pnpm config:docs`. Do not edit by hand.

Layers, lowest to highest (doc/10 section 4): schema default, `config/editions/<edition>.json`, `config/environments/<environment>.json`, runtime environment variables named `FP_CFG__<group>__<key>`. Secrets are referenced by environment variable name only (invariant 7).

| Key | Type | Range | Default | Reload | Owner | Description |
|---|---|---|---|---|---|---|
| `edition` | enum | community, full | `"community"` | restart | chief architect | Which edition's adapters load (doc/10 section 2, Edition). |
| `environment` | enum | local, cloud-validation, public-demo | `"local"` | restart | chief architect | Environment profile applied on top of the edition profile. |
| `db.host` | string | non-empty | `"localhost"` | restart | platform | PostgreSQL host for DS-01. |
| `db.port` | integer | 1 to 65535 | `5432` | restart | platform | PostgreSQL port. |
| `db.name` | string | `^[a-z][a-z0-9_]*$` | `"factorypulse"` | restart | platform | Database name. |
| `db.app_user` | string | `^[a-z][a-z0-9_]*$` | `"fp_app"` | restart | platform | Role used by services; subject to row-level security (invariant 4). |
| `db.admin_user` | string | `^[a-z][a-z0-9_]*$` | `"fp_admin"` | restart | platform | Role used only by migrations and seeding. |
| `db.app_password_secret` | string | `^[A-Z][A-Z0-9_]*$` | `"FP_DB_APP_PASSWORD"` | restart | platform | Name of the environment variable holding the app role password. |
| `db.admin_password_secret` | string | `^[A-Z][A-Z0-9_]*$` | `"FP_DB_ADMIN_PASSWORD"` | restart | platform | Name of the environment variable holding the admin role password. |
| `db.pool_max` | integer | 1 to 100 | `10` | restart | platform | Maximum connections in the service pool. |
| `api.host` | string | non-empty | `"127.0.0.1"` | restart | platform | Interface the mock API binds to. |
| `api.port` | integer | 1 to 65535 | `4010` | restart | platform | Port the mock API listens on. |
| `api.cors_origins` | list of URL | - | `[]` | restart | platform | Browser origins allowed to call the API. Empty means none. |
| `api.request_timeout_ms` | integer | 100 to 60000 | `5000` | restart | platform | Server-side request timeout. |
| `mock.controls_enabled` | boolean | true, false | `false` | hot | QA lead | Expose the /mock control endpoints (fallback level, scenario state). Never enabled outside local. |
| `mock.initial_fallback_level` | enum | L0, L1, L2, L3, L4, L5 | `"L0"` | hot | QA lead | Fallback level the mock API starts at. |
| `rbac.screens` | map | see default | `{"operator":{"plant":"use","line":"use","alerts":"use","approvals":"none","field":"none","knowledge":"none","trust":"none","learning":"none","control_tower":"none","compliance":"none","developer":"none","admin":"none","settings":"use"},"technician":{"plant":"use","line":"use","alerts":"use","approvals":"view","field":"use","knowledge":"use","trust":"none","learning":"none","control_tower":"none","compliance":"none","developer":"none","admin":"none","settings":"use"},"shift_lead":{"plant":"use","line":"use","alerts":"use","approvals":"use","field":"use","knowledge":"use","trust":"view","learning":"none","control_tower":"none","compliance":"none","developer":"none","admin":"none","settings":"use"},"reliability_engineer":{"plant":"use","line":"use","alerts":"use","approvals":"use","field":"none","knowledge":"use","trust":"use","learning":"use","control_tower":"none","compliance":"none","developer":"none","admin":"none","settings":"use"},"operations_manager":{"plant":"use","line":"use","alerts":"use","approvals":"use","field":"none","knowledge":"none","trust":"none","learning":"view","control_tower":"view","compliance":"view","developer":"none","admin":"none","settings":"use"},"admin":{"plant":"use","line":"none","alerts":"none","approvals":"none","field":"none","knowledge":"use","trust":"none","learning":"none","control_tower":"use","compliance":"use","developer":"use","admin":"use","settings":"use"}}` | hot | chief architect | Default screen access per role: none, view or use (NFR-S6, ADR-040). Tenant admins override it per role in W09; the API enforces it on every route. Approval rights stay with policy.role_max_tier. |
| `policy.role_max_tier` | map | see default | `{"operator":0,"technician":0,"shift_lead":1,"reliability_engineer":2,"operations_manager":2,"admin":0}` | hot | chief architect | Highest approval tier each role may decide; 0 means none (POL-2, doc/10 Policy). Only human sessions decide (invariant 2). |
| `policy.min_tier_by_level` | map | see default | `{"L0":1,"L1":1,"L2":1,"L3":2,"L4":2,"L5":2}` | hot | chief architect | Minimum approval tier at each fallback level (03 section 13.2). May be raised, never lowered below the default. |
| `synthetic.seed` | integer | 0 to - | `20261004` | restart | QA lead | Seed for the deterministic synthetic data generator (ADR-019, ADR-030). |
| `synthetic.reference_time` | ISO date-time | - | `"2026-10-04T08:50:00Z"` | restart | QA lead | The 'now' the synthetic scenario is built around, so screenshots and tests are stable. |
| `app.api_base_url` | URL | - | `"http://localhost:4010"` | restart | UX designer | Base URL the Expo app uses for the API; passed to the app at build time. |
| `app.web_dev_url` | URL | - | `"http://localhost:8081"` | restart | QA lead | Where the Expo web dev server runs locally; end-to-end tests open this URL. |
| `app.poll_interval_ms` | integer | 1000 to 60000 | `5000` | restart | UX designer | How often the app refreshes live data until the SSE stream exists (02 section 14). |
| `mqtt.url` | string | non-empty | `"mqtt://127.0.0.1:1883"` | restart | platform | Site Mosquitto broker URL for telemetry acquisition (ADR-026). |
| `mqtt.topic_prefix` | string | non-empty | `"fp/v1"` | restart | platform | Topic namespace prefix for site MQTT telemetry. |
| `mqtt.client_id` | string | non-empty | `"fp-ingest-gateway"` | restart | platform | MQTT client ID for APP-02. |
| `kafka.brokers` | list of URL | - | `["127.0.0.1:9092"]` | restart | platform | Kafka bootstrap broker list for event backbone (ADR-011). |
| `kafka.client_id` | string | non-empty | `"fp-ingest-gateway"` | restart | platform | Kafka client identifier. |
| `kafka.raw_topic` | string | non-empty | `"tel.raw.v1"` | restart | platform | Kafka topic for validated telemetry stream (ING-11). |
| `kafka.dlq_topic` | string | non-empty | `"tel.dlq.v1"` | restart | platform | Kafka topic for dead-letter unvalidated or poisoned envelopes (ING-9). |
| `kafka.features_topic` | string | non-empty | `"tel.features.v1"` | restart | platform | Kafka topic for aggregated telemetry window features. |
| `kafka.alerts_topic` | string | non-empty | `"detect.alerts.v1"` | restart | platform | Kafka topic for detection alerts (DET-1..5). |
| `ingest.max_future_skew_s` | integer | 0 to 3600 | `300` | restart | platform | How far in the future a reading's source timestamp may be before it is dead-lettered (ING-4). |
| `ingest.max_past_skew_s` | integer | 60 to 2592000 | `604800` | restart | platform | How old a reading's source timestamp may be before it is dead-lettered; covers edge store-and-forward replay (ING-2, ING-4). |
| `ingest.registry_refresh_s` | integer | 1 to 3600 | `60` | restart | platform | How long APP-02 caches a tenant's sensor registry before reloading it; new sensors are accepted after at most this delay (ING-7). |
| `ingest.otlp_http.enabled` | boolean | true, false | `true` | restart | platform | Run the OTLP/HTTP JSON metrics receiver in APP-02 (ING-13, ADR-039). |
| `ingest.otlp_http.host` | string | non-empty | `"127.0.0.1"` | restart | platform | Interface the OTLP/HTTP receiver listens on. |
| `ingest.otlp_http.port` | integer | 1 to 65535 | `4318` | restart | platform | OTLP/HTTP receiver port (4318 is the OpenTelemetry default). |
| `ingest.otlp_http.path` | string | `^\/[a-z0-9/_-]*$` | `"/v1/metrics"` | restart | platform | OTLP/HTTP metrics path. |
| `ingest.otlp_http.max_body_bytes` | integer | 1024 to 16777216 | `4194304` | restart | platform | Largest OTLP request body accepted; larger requests get 413. |
| `telemetry_health.lookback_minutes` | integer | 1 to 1440 | `15` | hot | reliability | Window of recent readings used to judge sensor health; no reading in this window means 'no data' (ING-12). |
| `telemetry_health.flatline_min_points` | integer | 3 to 1000 | `10` | hot | reliability | Consecutive readings that must be identical (within tolerance) before a sensor is reported as flatlined (ING-12). |
| `telemetry_health.flatline_tolerance_pct` | number | 0 to 10 | `0.1` | hot | reliability | Spread allowed across the flatline window, as a percentage of the sensor's normal range span (ING-12). |
| `knowledge.chunk_chars` | integer | 100 to 8000 | `600` | hot | AI lead | Target characters per indexed chunk when a document is ingested (RAG-1). |
| `knowledge.retrieval.top_k` | integer | 1 to 50 | `4` | hot | AI lead | Chunks retrieved per question when the caller does not ask for a number (RAG-2). |
| `knowledge.retrieval.min_score` | number | 0 to 1 | `0.18` | hot | AI lead | Lowest similarity a chunk needs to ground an answer; below it the answer abstains (RAG-7). |
| `knowledge.upload.max_bytes` | integer | 1024 to 52428800 | `5242880` | hot | AI lead | Largest document body accepted for upload, in bytes (RAG-12). |
| `knowledge.upload.title_min_chars` | integer | 1 to 100 | `8` | hot | AI lead | Shortest accepted document title (RAG-12). |
| `knowledge.upload.title_max_chars` | integer | 10 to 500 | `160` | hot | AI lead | Longest accepted document title (RAG-12). |
| `knowledge.upload.title_min_words` | integer | 1 to 10 | `2` | hot | AI lead | Words a title needs, so a single token such as 'sss' is refused (RAG-12). |
| `knowledge.upload.content_min_words` | integer | 1 to 10000 | `60` | hot | AI lead | Words a document body needs before it is worth indexing (RAG-12). |
| `knowledge.upload.min_distinct_word_ratio` | number | 0 to 1 | `0.25` | hot | AI lead | Distinct words divided by all words; text that repeats a few words is refused (RAG-12). |
| `knowledge.upload.min_letter_ratio` | number | 0 to 1 | `0.6` | hot | AI lead | Letters divided by all non-space characters; symbol or digit noise is refused (RAG-12). |
| `knowledge.upload.max_repeat_run` | integer | 2 to 50 | `5` | hot | AI lead | Longest run of one repeated character allowed in a word, such as 'sssss' (RAG-12). |
| `knowledge.upload.section_min_words` | integer | 1 to 1000 | `5` | hot | AI lead | Words each required template section needs (RAG-12). |
| `knowledge.upload.reason_min_chars` | integer | 1 to 200 | `10` | hot | AI lead | Shortest accepted reason when a document is deleted or withdrawn (RAG-13). |
| `knowledge.upload.require_second_reviewer` | boolean | true, false | `true` | hot | chief architect | When true, the person who uploaded a document may not approve it (RAG-10). |
| `knowledge.templates` | map | see default | `{"equipment_manual":{"label":"Equipment manual","sections":[{"heading":"Purpose","hint":"What this manual covers and who it is for."},{"heading":"Equipment","hint":"The machine or unit, its plant tag and main components."},{"heading":"Specifications","hint":"Ratings and design values. Live limits come from the equipment registry, not from this text."},{"heading":"Maintenance","hint":"Inspections and service tasks with their intervals."},{"heading":"Safety","hint":"Hazards, isolation points and protective equipment."}]},"sop":{"label":"Standard operating procedure","sections":[{"heading":"Purpose","hint":"Why the procedure exists."},{"heading":"Scope","hint":"Which equipment, line and roles it applies to."},{"heading":"Safety","hint":"Isolation, lockout and protective equipment before starting."},{"heading":"Procedure","hint":"Numbered steps in the order they are done."},{"heading":"Verification","hint":"How the person confirms the work is complete and safe."}]},"troubleshooting_guide":{"label":"Troubleshooting guide","sections":[{"heading":"Symptom","hint":"What the operator or the sensor shows."},{"heading":"Possible causes","hint":"Likely causes, most likely first."},{"heading":"Checks","hint":"Checks that tell the causes apart."},{"heading":"Corrective action","hint":"What to do for each confirmed cause."},{"heading":"Safety","hint":"Hazards while diagnosing."}]}}` | hot | AI lead | Document templates by type: required section headings and the hint shown for each (RAG-12). Uploads must follow one. |
| `mcp.host` | string | non-empty | `"127.0.0.1"` | restart | platform | Interface the MCP server binds to. |
| `mcp.port` | integer | 1 to 65535 | `4020` | restart | platform | Port of the MCP server. |
| `mcp.path` | string | `^\/[a-z0-9/_-]*$` | `"/mcp"` | restart | platform | HTTP path of the MCP endpoint. |
| `mcp.max_body_bytes` | integer | 1024 to 10485760 | `1048576` | restart | platform | Largest MCP request body accepted; larger requests are refused before parsing. |
| `model.provider` | enum | local, anthropic, gemini | `"local"` | hot | AI lead | Narration adapter: local (deterministic cited template, no network, no key), anthropic (Claude) or gemini (ADR-038). |
| `model.timeout_ms` | integer | 1000 to 300000 | `30000` | hot | AI lead | Longest wait for a provider answer before the local template is used instead. |
| `model.max_output_tokens` | integer | 256 to 64000 | `16000` | hot | AI lead | Output ceiling for one narrated answer. |
| `model.system_prompt` | string | non-empty | `"You are the AuraPrime FactoryPulse maintenance assistant for plant technicians and reliability engineers. Answer only from the document excerpts you are given. Cite every statement with the document ID and section in square brackets, for example [CIT-1 · section 4.2]. Do not add specifications, limits or numbers that are not in the excerpts; live limits come from the equipment registry, not from you. If the excerpts are not enough to answer, say: \"The approved documents do not answer this. A field inspection is recommended.\" The product is advisory: never instruct anyone to bypass a safety interlock or lockout."` | hot | AI lead | Instructions sent with every narration request, whatever the provider (ADR-038). |
| `model.anthropic.model_id` | string | non-empty | `"claude-opus-5-5"` | hot | AI lead | Claude model used when model.provider is anthropic. |
| `model.anthropic.base_url` | URL | - | `"https://api.anthropic.com"` | restart | platform | Anthropic API base URL; tests point it at a local mock. |
| `model.anthropic.api_key_secret` | string | `^[A-Z][A-Z0-9_]*$` | `"ANTHROPIC_API_KEY"` | restart | platform | Name of the environment variable holding the Anthropic API key (invariant 7). |
| `model.anthropic.effort` | enum | low, medium, high, xhigh, max | `"medium"` | hot | AI lead | Claude effort level for narration. |
| `model.anthropic.server_side_fallback` | boolean | true, false | `true` | hot | AI lead | If Claude declines a request on safety grounds, let the API retry it on a fallback model instead of returning nothing. |
| `model.gemini.model_id` | string | non-empty | `"gemini-3.8-flash"` | hot | AI lead | Gemini model used when model.provider is gemini (verify against the provider's current model list before use). |
| `model.gemini.base_url` | URL | - | `"https://generativelanguage.googleapis.com/v1beta"` | restart | platform | Gemini API base URL; tests point it at a local mock. |
| `model.gemini.api_key_secret` | string | `^[A-Z][A-Z0-9_]*$` | `"GEMINI_API_KEY"` | restart | platform | Name of the environment variable holding the Gemini API key (invariant 7). |
| `model.gemini.temperature` | number | 0 to 2 | `0.2` | hot | AI lead | Gemini sampling temperature for narration. |
| `model.budget.daily_usd` | number | 0 to 50 | `2` | hot | project owner | Paid model spend allowed per tenant per UTC day. Warning moves narration to L1, exhaustion to L2 (03 section 13.4). |
| `model.budget.total_usd` | number | 0 to 50 | `40` | hot | project owner | Paid model spend allowed per tenant in total. Capped at the NFR-C1 project limit of USD 50; may be lowered, never raised past it. |
| `model.budget.warn_fraction` | number | 0.1 to 1 | `0.8` | hot | AI lead | Share of a budget at which narration moves to L1 (shorter output) before exhaustion forces L2. |
| `model.budget.l1_max_output_tokens` | integer | 256 to 64000 | `2000` | hot | AI lead | Output ceiling at L1, the shorter-output step of the ladder (03 section 13.2). |
| `model.breaker.failure_threshold` | integer | 1 to 20 | `3` | hot | AI lead | Consecutive provider failures that open the provider circuit; narration then uses the cited template (L2). |
| `model.breaker.reset_timeout_ms` | integer | 1000 to 3600000 | `60000` | hot | AI lead | How long an open provider circuit waits before letting one trial call through (half-open). |
| `model.breaker.recovery_hysteresis_ms` | integer | 0 to 86400000 | `300000` | hot | AI lead | Continuous health needed before a level set by the Model Gateway recovers one step (03 section 13.3). |
| `model.pricing` | map | see default | `{"claude-opus-5-5":{"input_usd_per_mtok":4,"output_usd_per_mtok":20}}` | hot | project owner | Price per million tokens by the model ID a provider reports, used to record cost in the CostLedger. Check against the provider's price list (verify). |
| `model.unknown_model_price` | map | see default | `{"input_usd_per_mtok":10,"output_usd_per_mtok":50}` | hot | project owner | Price charged for a model missing from model.pricing; deliberately high so an unpriced model cannot slip past the budget. |
