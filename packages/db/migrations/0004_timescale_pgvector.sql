-- Migration 0004: TimescaleDB hypertable for telemetry and pgvector for embeddings (Spike TO-9).
-- Invariant 4: every tenant table has tenant_id NOT NULL and forced row-level security.

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS vector;

-- Telemetry schema
CREATE SCHEMA IF NOT EXISTS tel;
GRANT USAGE ON SCHEMA tel TO :app_user;

-- Telemetry points (validated time-series data)
CREATE TABLE IF NOT EXISTS tel.telemetry_point (
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  sensor_id text NOT NULL REFERENCES ref.sensor(id),
  ts timestamptz NOT NULL,
  value numeric NOT NULL,
  quality_flag text NOT NULL DEFAULT 'good' CHECK (quality_flag IN ('good', 'uncertain', 'bad', 'stale')),
  trust_at_ingest numeric
);

-- Convert to Timescale hypertable partitioned by time
SELECT create_hypertable('tel.telemetry_point', by_range('ts'), if_not_exists => TRUE);

-- Composite index for fast sensor time-series queries
CREATE INDEX IF NOT EXISTS idx_telemetry_point_sensor_ts ON tel.telemetry_point (tenant_id, sensor_id, ts DESC);

ALTER TABLE tel.telemetry_point ENABLE ROW LEVEL SECURITY;
ALTER TABLE tel.telemetry_point FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tel.telemetry_point
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT ON tel.telemetry_point TO :app_user;

-- Dead-letter table for malformed or unvalidated ingest envelopes (ING-9, tel.dlq.v1)
CREATE TABLE IF NOT EXISTS tel.dead_letter (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  topic text NOT NULL,
  reason text NOT NULL,
  payload jsonb NOT NULL,
  error_detail text,
  received_at timestamptz NOT NULL DEFAULT now(),
  replayed boolean NOT NULL DEFAULT false
);

ALTER TABLE tel.dead_letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE tel.dead_letter FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tel.dead_letter
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE ON tel.dead_letter TO :app_user;

-- Knowledge embeddings with pgvector (APP-07, DP-1)
CREATE TABLE IF NOT EXISTS know.chunk_embedding (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES plat.tenant(id),
  citation_id text NOT NULL REFERENCES know.citation(id),
  chunk_index int NOT NULL,
  content text NOT NULL,
  model_id text NOT NULL,
  model_version text NOT NULL,
  embedding vector(384) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Cosine distance index (HNSW) for vector similarity search
CREATE INDEX IF NOT EXISTS idx_chunk_embedding_cosine ON know.chunk_embedding
  USING hnsw (embedding vector_cosine_ops);

ALTER TABLE know.chunk_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE know.chunk_embedding FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON know.chunk_embedding
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON know.chunk_embedding TO :app_user;
