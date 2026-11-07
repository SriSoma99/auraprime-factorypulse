// Configuration schema (doc/10-configuration.md sections 4 and 5; ADR-030 item 8).
// Every key has a type, range, safe default, description, owner and reload mode.
// Generated reference: doc/config/keys.md (pnpm config:docs).
import { z } from "zod";

export type Reload = "hot" | "restart";
export interface KeyMeta { description: string; owner: string; reload: Reload }

const keyMeta = new Map<string, KeyMeta>();
function key<T extends z.ZodTypeAny>(path: string, schema: T, meta: KeyMeta): T {
  keyMeta.set(path, meta);
  return schema;
}

const fallbackLevel = z.enum(["L0", "L1", "L2", "L3", "L4", "L5"]);
/** A secret is referenced by the name of an environment variable, never by value (invariant 7). */
const secretRef = z.string().regex(/^[A-Z][A-Z0-9_]*$/, "secret reference must be an environment variable name");

/** Screens and features that role-based access controls (ADR-040, 02 section 4.4). */
export const SCREENS = ["plant", "line", "alerts", "approvals", "field", "knowledge", "trust", "learning", "control_tower", "compliance", "developer", "admin", "settings"] as const;
export type Screen = (typeof SCREENS)[number];
/** none hides the screen and its API; view allows reading; use also allows the screen's actions. */
export const ACCESS_LEVELS = ["none", "view", "use"] as const;
export type Access = (typeof ACCESS_LEVELS)[number];
export const ROLES = ["operator", "technician", "shift_lead", "reliability_engineer", "operations_manager", "admin"] as const;
export type RoleName = (typeof ROLES)[number];

const access = z.enum(ACCESS_LEVELS);
const screenAccess = z.object(Object.fromEntries(SCREENS.map(sc => [sc, access])) as Record<Screen, typeof access>).strict();
const row = (l: string): Record<Screen, Access> => {
  const code: Record<string, Access> = { u: "use", v: "view", "-": "none" };
  const cells = l.trim().split(/\s+/);
  return Object.fromEntries(SCREENS.map((sc, k) => [sc, code[cells[k]!]!])) as Record<Screen, Access>;
};
//                                 plant line alerts approvals field knowledge trust learning control_tower compliance developer admin settings
const defaultScreenAccess: Record<RoleName, Record<Screen, Access>> = {
  operator:             row("u u u - - - - - - - - - u"),
  technician:           row("u u u v u u - - - - - - u"),
  shift_lead:           row("u u u u u u v - - - - - u"),
  reliability_engineer: row("u u u u - u u u - - - - u"),
  operations_manager:   row("u u u u - - - v v v - - u"),
  admin:                row("u - - - - u - - u u u u u"),
};

export const configSchema = z.object({
  edition: key("edition", z.enum(["community", "full"]).default("community"),
    { description: "Which edition's adapters load (doc/10 section 2, Edition).", owner: "chief architect", reload: "restart" }),
  environment: key("environment", z.enum(["local", "cloud-validation", "public-demo"]).default("local"),
    { description: "Environment profile applied on top of the edition profile.", owner: "chief architect", reload: "restart" }),
  db: z.object({
    host: key("db.host", z.string().min(1).default("localhost"),
      { description: "PostgreSQL host for DS-01.", owner: "platform", reload: "restart" }),
    port: key("db.port", z.number().int().min(1).max(65535).default(5432),
      { description: "PostgreSQL port.", owner: "platform", reload: "restart" }),
    name: key("db.name", z.string().regex(/^[a-z][a-z0-9_]*$/).default("factorypulse"),
      { description: "Database name.", owner: "platform", reload: "restart" }),
    app_user: key("db.app_user", z.string().regex(/^[a-z][a-z0-9_]*$/).default("fp_app"),
      { description: "Role used by services; subject to row-level security (invariant 4).", owner: "platform", reload: "restart" }),
    admin_user: key("db.admin_user", z.string().regex(/^[a-z][a-z0-9_]*$/).default("fp_admin"),
      { description: "Role used only by migrations and seeding.", owner: "platform", reload: "restart" }),
    app_password_secret: key("db.app_password_secret", secretRef.default("FP_DB_APP_PASSWORD"),
      { description: "Name of the environment variable holding the app role password.", owner: "platform", reload: "restart" }),
    admin_password_secret: key("db.admin_password_secret", secretRef.default("FP_DB_ADMIN_PASSWORD"),
      { description: "Name of the environment variable holding the admin role password.", owner: "platform", reload: "restart" }),
    pool_max: key("db.pool_max", z.number().int().min(1).max(100).default(10),
      { description: "Maximum connections in the service pool.", owner: "platform", reload: "restart" }),
  }).default({}),
  api: z.object({
    host: key("api.host", z.string().min(1).default("127.0.0.1"),
      { description: "Interface the mock API binds to.", owner: "platform", reload: "restart" }),
    port: key("api.port", z.number().int().min(1).max(65535).default(4010),
      { description: "Port the mock API listens on.", owner: "platform", reload: "restart" }),
    cors_origins: key("api.cors_origins", z.array(z.string().url()).default([]),
      { description: "Browser origins allowed to call the API. Empty means none.", owner: "platform", reload: "restart" }),
    request_timeout_ms: key("api.request_timeout_ms", z.number().int().min(100).max(60000).default(5000),
      { description: "Server-side request timeout.", owner: "platform", reload: "restart" }),
  }).default({}),
  mock: z.object({
    controls_enabled: key("mock.controls_enabled", z.boolean().default(false),
      { description: "Expose the /mock control endpoints (fallback level, scenario state). Never enabled outside local.", owner: "QA lead", reload: "hot" }),
    initial_fallback_level: key("mock.initial_fallback_level", fallbackLevel.default("L0"),
      { description: "Fallback level the mock API starts at.", owner: "QA lead", reload: "hot" }),
  }).default({}),
  rbac: z.object({
    screens: key("rbac.screens", z.object(Object.fromEntries(ROLES.map(r => [r, screenAccess])) as Record<RoleName, typeof screenAccess>).strict()
      .refine(m => m.admin.admin === "use", { message: "the admin role must keep use access to the admin screen (no lockout)" })
      .default(defaultScreenAccess),
      { description: "Default screen access per role: none, view or use (NFR-S6, ADR-040). Tenant admins override it per role in W09; the API enforces it on every route. Approval rights stay with policy.role_max_tier.", owner: "chief architect", reload: "hot" }),
  }).default({}),
  policy: z.object({
    role_max_tier: key("policy.role_max_tier", z.object({
      operator: z.number().int().min(0).max(5), technician: z.number().int().min(0).max(5), shift_lead: z.number().int().min(0).max(5),
      reliability_engineer: z.number().int().min(0).max(5), operations_manager: z.number().int().min(0).max(5), admin: z.number().int().min(0).max(5),
    }).strict().default({ operator: 0, technician: 0, shift_lead: 1, reliability_engineer: 2, operations_manager: 2, admin: 0 }),
      { description: "Highest approval tier each role may decide; 0 means none (POL-2, doc/10 Policy). Only human sessions decide (invariant 2).", owner: "chief architect", reload: "hot" }),
    min_tier_by_level: key("policy.min_tier_by_level", z.object({
      L0: z.number().int().min(1).max(5), L1: z.number().int().min(1).max(5), L2: z.number().int().min(1).max(5),
      L3: z.number().int().min(1).max(5), L4: z.number().int().min(1).max(5), L5: z.number().int().min(1).max(5),
    }).strict().default({ L0: 1, L1: 1, L2: 1, L3: 2, L4: 2, L5: 2 }),
      { description: "Minimum approval tier at each fallback level (03 section 13.2). May be raised, never lowered below the default.", owner: "chief architect", reload: "hot" }),
  }).default({}),
  synthetic: z.object({
    seed: key("synthetic.seed", z.number().int().min(0).default(20261004),
      { description: "Seed for the deterministic synthetic data generator (ADR-019, ADR-030).", owner: "QA lead", reload: "restart" }),
    reference_time: key("synthetic.reference_time", z.string().datetime().default("2026-10-04T08:50:00Z"),
      { description: "The 'now' the synthetic scenario is built around, so screenshots and tests are stable.", owner: "QA lead", reload: "restart" }),
  }).default({}),
  app: z.object({
    api_base_url: key("app.api_base_url", z.string().url().default("http://localhost:4010"),
      { description: "Base URL the Expo app uses for the API; passed to the app at build time.", owner: "UX designer", reload: "restart" }),
    web_dev_url: key("app.web_dev_url", z.string().url().default("http://localhost:8081"),
      { description: "Where the Expo web dev server runs locally; end-to-end tests open this URL.", owner: "QA lead", reload: "restart" }),
    poll_interval_ms: key("app.poll_interval_ms", z.number().int().min(1000).max(60000).default(5000),
      { description: "How often the app refreshes live data until the SSE stream exists (02 section 14).", owner: "UX designer", reload: "restart" }),
  }).default({}),
  mqtt: z.object({
    url: key("mqtt.url", z.string().default("mqtt://127.0.0.1:1883"),
      { description: "Site Mosquitto broker URL for telemetry acquisition (ADR-026).", owner: "platform", reload: "restart" }),
    topic_prefix: key("mqtt.topic_prefix", z.string().default("fp/v1"),
      { description: "Topic namespace prefix for site MQTT telemetry.", owner: "platform", reload: "restart" }),
    client_id: key("mqtt.client_id", z.string().default("fp-ingest-gateway"),
      { description: "MQTT client ID for APP-02.", owner: "platform", reload: "restart" }),
  }).default({}),
  kafka: z.object({
    brokers: key("kafka.brokers", z.array(z.string()).default(["127.0.0.1:9092"]),
      { description: "Kafka bootstrap broker list for event backbone (ADR-011).", owner: "platform", reload: "restart" }),
    client_id: key("kafka.client_id", z.string().default("fp-ingest-gateway"),
      { description: "Kafka client identifier.", owner: "platform", reload: "restart" }),
    raw_topic: key("kafka.raw_topic", z.string().default("tel.raw.v1"),
      { description: "Kafka topic for validated telemetry stream (ING-11).", owner: "platform", reload: "restart" }),
    dlq_topic: key("kafka.dlq_topic", z.string().default("tel.dlq.v1"),
      { description: "Kafka topic for dead-letter unvalidated or poisoned envelopes (ING-9).", owner: "platform", reload: "restart" }),
    features_topic: key("kafka.features_topic", z.string().default("tel.features.v1"),
      { description: "Kafka topic for aggregated telemetry window features.", owner: "platform", reload: "restart" }),
    alerts_topic: key("kafka.alerts_topic", z.string().default("detect.alerts.v1"),
      { description: "Kafka topic for detection alerts (DET-1..5).", owner: "platform", reload: "restart" }),
  }).default({}),
  ingest: z.object({
    max_future_skew_s: key("ingest.max_future_skew_s", z.number().int().min(0).max(3600).default(300),
      { description: "How far in the future a reading's source timestamp may be before it is dead-lettered (ING-4).", owner: "platform", reload: "restart" }),
    max_past_skew_s: key("ingest.max_past_skew_s", z.number().int().min(60).max(2592000).default(604800),
      { description: "How old a reading's source timestamp may be before it is dead-lettered; covers edge store-and-forward replay (ING-2, ING-4).", owner: "platform", reload: "restart" }),
    registry_refresh_s: key("ingest.registry_refresh_s", z.number().int().min(1).max(3600).default(60),
      { description: "How long APP-02 caches a tenant's sensor registry before reloading it; new sensors are accepted after at most this delay (ING-7).", owner: "platform", reload: "restart" }),
    otlp_http: z.object({
      enabled: key("ingest.otlp_http.enabled", z.boolean().default(true),
        { description: "Run the OTLP/HTTP JSON metrics receiver in APP-02 (ING-13, ADR-039).", owner: "platform", reload: "restart" }),
      host: key("ingest.otlp_http.host", z.string().min(1).default("127.0.0.1"),
        { description: "Interface the OTLP/HTTP receiver listens on.", owner: "platform", reload: "restart" }),
      port: key("ingest.otlp_http.port", z.number().int().min(1).max(65535).default(4318),
        { description: "OTLP/HTTP receiver port (4318 is the OpenTelemetry default).", owner: "platform", reload: "restart" }),
      path: key("ingest.otlp_http.path", z.string().regex(/^\/[a-z0-9/_-]*$/).default("/v1/metrics"),
        { description: "OTLP/HTTP metrics path.", owner: "platform", reload: "restart" }),
      max_body_bytes: key("ingest.otlp_http.max_body_bytes", z.number().int().min(1024).max(16777216).default(4194304),
        { description: "Largest OTLP request body accepted; larger requests get 413.", owner: "platform", reload: "restart" }),
    }).default({}),
  }).default({}),
  telemetry_health: z.object({
    lookback_minutes: key("telemetry_health.lookback_minutes", z.number().int().min(1).max(1440).default(15),
      { description: "Window of recent readings used to judge sensor health; no reading in this window means 'no data' (ING-12).", owner: "reliability", reload: "hot" }),
    flatline_min_points: key("telemetry_health.flatline_min_points", z.number().int().min(3).max(1000).default(10),
      { description: "Consecutive readings that must be identical (within tolerance) before a sensor is reported as flatlined (ING-12).", owner: "reliability", reload: "hot" }),
    flatline_tolerance_pct: key("telemetry_health.flatline_tolerance_pct", z.number().min(0).max(10).default(0.1),
      { description: "Spread allowed across the flatline window, as a percentage of the sensor's normal range span (ING-12).", owner: "reliability", reload: "hot" }),
  }).default({}),
  knowledge: z.object({
    chunk_chars: key("knowledge.chunk_chars", z.number().int().min(100).max(8000).default(600),
      { description: "Target characters per indexed chunk when a document is ingested (RAG-1).", owner: "AI lead", reload: "hot" }),
    retrieval: z.object({
      top_k: key("knowledge.retrieval.top_k", z.number().int().min(1).max(50).default(4),
        { description: "Chunks retrieved per question when the caller does not ask for a number (RAG-2).", owner: "AI lead", reload: "hot" }),
      min_score: key("knowledge.retrieval.min_score", z.number().min(0).max(1).default(0.18),
        { description: "Lowest similarity a chunk needs to ground an answer; below it the answer abstains (RAG-7).", owner: "AI lead", reload: "hot" }),
    }).default({}),
    upload: z.object({
      max_bytes: key("knowledge.upload.max_bytes", z.number().int().min(1024).max(52428800).default(5242880),
        { description: "Largest document body accepted for upload, in bytes (RAG-12).", owner: "AI lead", reload: "hot" }),
      title_min_chars: key("knowledge.upload.title_min_chars", z.number().int().min(1).max(100).default(8),
        { description: "Shortest accepted document title (RAG-12).", owner: "AI lead", reload: "hot" }),
      title_max_chars: key("knowledge.upload.title_max_chars", z.number().int().min(10).max(500).default(160),
        { description: "Longest accepted document title (RAG-12).", owner: "AI lead", reload: "hot" }),
      title_min_words: key("knowledge.upload.title_min_words", z.number().int().min(1).max(10).default(2),
        { description: "Words a title needs, so a single token such as 'sss' is refused (RAG-12).", owner: "AI lead", reload: "hot" }),
      content_min_words: key("knowledge.upload.content_min_words", z.number().int().min(1).max(10000).default(60),
        { description: "Words a document body needs before it is worth indexing (RAG-12).", owner: "AI lead", reload: "hot" }),
      min_distinct_word_ratio: key("knowledge.upload.min_distinct_word_ratio", z.number().min(0).max(1).default(0.25),
        { description: "Distinct words divided by all words; text that repeats a few words is refused (RAG-12).", owner: "AI lead", reload: "hot" }),
      min_letter_ratio: key("knowledge.upload.min_letter_ratio", z.number().min(0).max(1).default(0.6),
        { description: "Letters divided by all non-space characters; symbol or digit noise is refused (RAG-12).", owner: "AI lead", reload: "hot" }),
      max_repeat_run: key("knowledge.upload.max_repeat_run", z.number().int().min(2).max(50).default(5),
        { description: "Longest run of one repeated character allowed in a word, such as 'sssss' (RAG-12).", owner: "AI lead", reload: "hot" }),
      section_min_words: key("knowledge.upload.section_min_words", z.number().int().min(1).max(1000).default(5),
        { description: "Words each required template section needs (RAG-12).", owner: "AI lead", reload: "hot" }),
      reason_min_chars: key("knowledge.upload.reason_min_chars", z.number().int().min(1).max(200).default(10),
        { description: "Shortest accepted reason when a document is deleted or withdrawn (RAG-13).", owner: "AI lead", reload: "hot" }),
      require_second_reviewer: key("knowledge.upload.require_second_reviewer", z.boolean().default(true),
        { description: "When true, the person who uploaded a document may not approve it (RAG-10).", owner: "chief architect", reload: "hot" }),
    }).default({}),
    templates: key("knowledge.templates", z.record(z.string().regex(/^[a-z][a-z_]*$/), z.object({
      label: z.string().min(1),
      sections: z.array(z.object({ heading: z.string().min(1), hint: z.string().min(1) })).min(1),
    })).refine(t => Object.keys(t).length > 0, { message: "at least one document template is required" }).default({
      equipment_manual: { label: "Equipment manual", sections: [
        { heading: "Purpose", hint: "What this manual covers and who it is for." },
        { heading: "Equipment", hint: "The machine or unit, its plant tag and main components." },
        { heading: "Specifications", hint: "Ratings and design values. Live limits come from the equipment registry, not from this text." },
        { heading: "Maintenance", hint: "Inspections and service tasks with their intervals." },
        { heading: "Safety", hint: "Hazards, isolation points and protective equipment." },
      ] },
      sop: { label: "Standard operating procedure", sections: [
        { heading: "Purpose", hint: "Why the procedure exists." },
        { heading: "Scope", hint: "Which equipment, line and roles it applies to." },
        { heading: "Safety", hint: "Isolation, lockout and protective equipment before starting." },
        { heading: "Procedure", hint: "Numbered steps in the order they are done." },
        { heading: "Verification", hint: "How the person confirms the work is complete and safe." },
      ] },
      troubleshooting_guide: { label: "Troubleshooting guide", sections: [
        { heading: "Symptom", hint: "What the operator or the sensor shows." },
        { heading: "Possible causes", hint: "Likely causes, most likely first." },
        { heading: "Checks", hint: "Checks that tell the causes apart." },
        { heading: "Corrective action", hint: "What to do for each confirmed cause." },
        { heading: "Safety", hint: "Hazards while diagnosing." },
      ] },
    }),
      { description: "Document templates by type: required section headings and the hint shown for each (RAG-12). Uploads must follow one.", owner: "AI lead", reload: "hot" }),
  }).default({}),
  // Narration model behind the APP-26 port (ADR-038). The model only words an answer from approved, cited chunks (AP-3);
  // it is never on the real-time alert path (invariant 6).
  // MCP server (APP-15, DU-12): MCP over streamable HTTP through the official SDK; callers authenticate with a bearer token (MCP-4).
  mcp: z.object({
    host: key("mcp.host", z.string().min(1).default("127.0.0.1"),
      { description: "Interface the MCP server binds to.", owner: "platform", reload: "restart" }),
    port: key("mcp.port", z.number().int().min(1).max(65535).default(4020),
      { description: "Port of the MCP server.", owner: "platform", reload: "restart" }),
    path: key("mcp.path", z.string().regex(/^\/[a-z0-9/_-]*$/).default("/mcp"),
      { description: "HTTP path of the MCP endpoint.", owner: "platform", reload: "restart" }),
    max_body_bytes: key("mcp.max_body_bytes", z.number().int().min(1024).max(10485760).default(1048576),
      { description: "Largest MCP request body accepted; larger requests are refused before parsing.", owner: "platform", reload: "restart" }),
  }).default({}),
  model: z.object({
    provider: key("model.provider", z.enum(["local", "anthropic", "gemini"]).default("local"),
      { description: "Narration adapter: local (deterministic cited template, no network, no key), anthropic (Claude) or gemini (ADR-038).", owner: "AI lead", reload: "hot" }),
    timeout_ms: key("model.timeout_ms", z.number().int().min(1000).max(300000).default(30000),
      { description: "Longest wait for a provider answer before the local template is used instead.", owner: "AI lead", reload: "hot" }),
    max_output_tokens: key("model.max_output_tokens", z.number().int().min(256).max(64000).default(16000),
      { description: "Output ceiling for one narrated answer.", owner: "AI lead", reload: "hot" }),
    system_prompt: key("model.system_prompt", z.string().min(20).default(
      "You are the AuraPrime FactoryPulse maintenance assistant for plant technicians and reliability engineers. " +
      "Answer only from the document excerpts you are given. Cite every statement with the document ID and section in square brackets, " +
      "for example [CIT-1 · section 4.2]. Do not add specifications, limits or numbers that are not in the excerpts; live limits come from " +
      "the equipment registry, not from you. If the excerpts are not enough to answer, say: \"The approved documents do not answer this. " +
      "A field inspection is recommended.\" The product is advisory: never instruct anyone to bypass a safety interlock or lockout."),
      { description: "Instructions sent with every narration request, whatever the provider (ADR-038).", owner: "AI lead", reload: "hot" }),
    anthropic: z.object({
      model_id: key("model.anthropic.model_id", z.string().min(1).default("claude-opus-5-5"),
        { description: "Claude model used when model.provider is anthropic.", owner: "AI lead", reload: "hot" }),
      base_url: key("model.anthropic.base_url", z.string().url().default("https://api.anthropic.com"),
        { description: "Anthropic API base URL; tests point it at a local mock.", owner: "platform", reload: "restart" }),
      api_key_secret: key("model.anthropic.api_key_secret", secretRef.default("ANTHROPIC_API_KEY"),
        { description: "Name of the environment variable holding the Anthropic API key (invariant 7).", owner: "platform", reload: "restart" }),
      effort: key("model.anthropic.effort", z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
        { description: "Claude effort level for narration.", owner: "AI lead", reload: "hot" }),
      server_side_fallback: key("model.anthropic.server_side_fallback", z.boolean().default(true),
        { description: "If Claude declines a request on safety grounds, let the API retry it on a fallback model instead of returning nothing.", owner: "AI lead", reload: "hot" }),
    }).default({}),
    gemini: z.object({
      model_id: key("model.gemini.model_id", z.string().min(1).default("gemini-3.8-flash"),
        { description: "Gemini model used when model.provider is gemini (verify against the provider's current model list before use).", owner: "AI lead", reload: "hot" }),
      base_url: key("model.gemini.base_url", z.string().url().default("https://generativelanguage.googleapis.com/v1beta"),
        { description: "Gemini API base URL; tests point it at a local mock.", owner: "platform", reload: "restart" }),
      api_key_secret: key("model.gemini.api_key_secret", secretRef.default("GEMINI_API_KEY"),
        { description: "Name of the environment variable holding the Gemini API key (invariant 7).", owner: "platform", reload: "restart" }),
      temperature: key("model.gemini.temperature", z.number().min(0).max(2).default(0.2),
        { description: "Gemini sampling temperature for narration.", owner: "AI lead", reload: "hot" }),
    }).default({}),
    // Budget breaker and provider circuit breaker in the Model Gateway (APP-26; 03 sections 13.4 and 14; FBK-3, AGT-6, NFR-C1).
    budget: z.object({
      daily_usd: key("model.budget.daily_usd", z.number().min(0).max(50).default(2),
        { description: "Paid model spend allowed per tenant per UTC day. Warning moves narration to L1, exhaustion to L2 (03 section 13.4).", owner: "project owner", reload: "hot" }),
      total_usd: key("model.budget.total_usd", z.number().min(0).max(50).default(40),
        { description: "Paid model spend allowed per tenant in total. Capped at the NFR-C1 project limit of USD 50; may be lowered, never raised past it.", owner: "project owner", reload: "hot" }),
      warn_fraction: key("model.budget.warn_fraction", z.number().min(0.1).max(1).default(0.8),
        { description: "Share of a budget at which narration moves to L1 (shorter output) before exhaustion forces L2.", owner: "AI lead", reload: "hot" }),
      l1_max_output_tokens: key("model.budget.l1_max_output_tokens", z.number().int().min(256).max(64000).default(2000),
        { description: "Output ceiling at L1, the shorter-output step of the ladder (03 section 13.2).", owner: "AI lead", reload: "hot" }),
    }).default({}),
    breaker: z.object({
      failure_threshold: key("model.breaker.failure_threshold", z.number().int().min(1).max(20).default(3),
        { description: "Consecutive provider failures that open the provider circuit; narration then uses the cited template (L2).", owner: "AI lead", reload: "hot" }),
      reset_timeout_ms: key("model.breaker.reset_timeout_ms", z.number().int().min(1000).max(3600000).default(60000),
        { description: "How long an open provider circuit waits before letting one trial call through (half-open).", owner: "AI lead", reload: "hot" }),
      recovery_hysteresis_ms: key("model.breaker.recovery_hysteresis_ms", z.number().int().min(0).max(86400000).default(300000),
        { description: "Continuous health needed before a level set by the Model Gateway recovers one step (03 section 13.3).", owner: "AI lead", reload: "hot" }),
    }).default({}),
    pricing: key("model.pricing", z.record(z.string().min(1), z.object({
      input_usd_per_mtok: z.number().min(0), output_usd_per_mtok: z.number().min(0),
    }).strict()).default({ "claude-opus-5-5": { input_usd_per_mtok: 4, output_usd_per_mtok: 20 } }),
      { description: "Price per million tokens by the model ID a provider reports, used to record cost in the CostLedger. Check against the provider's price list (verify).", owner: "project owner", reload: "hot" }),
    unknown_model_price: key("model.unknown_model_price", z.object({
      input_usd_per_mtok: z.number().min(0), output_usd_per_mtok: z.number().min(0),
    }).strict().default({ input_usd_per_mtok: 10, output_usd_per_mtok: 50 }),
      { description: "Price charged for a model missing from model.pricing; deliberately high so an unpriced model cannot slip past the budget.", owner: "project owner", reload: "hot" }),
  }).default({}),
}).strict();

export type Config = z.infer<typeof configSchema>;
export const configKeyMeta: ReadonlyMap<string, KeyMeta> = keyMeta;
