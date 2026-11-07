-- Migration 0012: operating limits and machine state rules in the asset registry (ING-7, ING-12; ADR-039).
-- Limits belong to the registry, never to retrieved documents (RAG-11). Columns are nullable so existing rows stay valid;
-- a sensor without limits is reported as "not configured" rather than healthy.

ALTER TABLE ref.asset
  ADD COLUMN IF NOT EXISTS equipment_type text,
  ADD COLUMN IF NOT EXISTS plant_tag text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS state_sensor_id text,
  ADD COLUMN IF NOT EXISTS run_at_or_above numeric,
  ADD COLUMN IF NOT EXISTS stopped_below numeric;

ALTER TABLE ref.asset DROP CONSTRAINT IF EXISTS asset_state_rule_complete;
ALTER TABLE ref.asset ADD CONSTRAINT asset_state_rule_complete CHECK (
  (state_sensor_id IS NULL AND run_at_or_above IS NULL AND stopped_below IS NULL)
  OR (state_sensor_id IS NOT NULL AND run_at_or_above IS NOT NULL AND stopped_below IS NOT NULL AND stopped_below <= run_at_or_above));

ALTER TABLE ref.sensor
  ADD COLUMN IF NOT EXISTS measurand text,
  ADD COLUMN IF NOT EXISTS normal_min numeric,
  ADD COLUMN IF NOT EXISTS normal_max numeric,
  ADD COLUMN IF NOT EXISTS instrument_min numeric,
  ADD COLUMN IF NOT EXISTS instrument_max numeric,
  ADD COLUMN IF NOT EXISTS max_silence_s integer;

ALTER TABLE ref.sensor DROP CONSTRAINT IF EXISTS sensor_limits_valid;
ALTER TABLE ref.sensor ADD CONSTRAINT sensor_limits_valid CHECK (
  (normal_min IS NULL OR normal_max IS NULL OR normal_min < normal_max)
  AND (instrument_min IS NULL OR instrument_max IS NULL OR instrument_min < instrument_max)
  AND (max_silence_s IS NULL OR max_silence_s > 0));
