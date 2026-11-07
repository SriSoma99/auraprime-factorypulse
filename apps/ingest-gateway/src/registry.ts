// Sensor registry check for APP-02: a reading is forwarded only for a sensor the tenant registered, at the place it was registered (ING-7, ADR-039).
import type pg from "pg";
import { randomBytes } from "node:crypto";
import type { DeadLetterEnvelope, ValidatedTelemetryEnvelope } from "./types.js";

export interface SensorPlacement { siteId: string; lineId: string; stationId: string; assetId: string }

export interface SensorRegistry {
  lookup(tenantId: string, sensorId: string): Promise<SensorPlacement | null>;
}

/** Reads ref.sensor under the tenant's row-level security and caches each tenant's map for refreshS seconds. */
export class PgSensorRegistry implements SensorRegistry {
  private readonly cache = new Map<string, { loadedAt: number; sensors: Map<string, SensorPlacement> }>();

  constructor(private readonly pool: pg.Pool, private readonly refreshS: number, private readonly clock: () => number = Date.now) {}

  async lookup(tenantId: string, sensorId: string): Promise<SensorPlacement | null> {
    let entry = this.cache.get(tenantId);
    if (!entry || this.clock() - entry.loadedAt > this.refreshS * 1000) {
      entry = { loadedAt: this.clock(), sensors: await this.load(tenantId) };
      this.cache.set(tenantId, entry);
    }
    return entry.sensors.get(sensorId) ?? null;
  }

  private async load(tenantId: string): Promise<Map<string, SensorPlacement>> {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const r = await c.query<{ sensor_id: string; site_id: string; line_id: string; station_id: string; asset_id: string }>(
        `SELECT se.id AS sensor_id, l.site_id, st.line_id, a.station_id, se.asset_id
           FROM ref.sensor se JOIN ref.asset a ON a.id = se.asset_id JOIN ref.station st ON st.id = a.station_id JOIN ref.line l ON l.id = st.line_id`);
      await c.query("COMMIT");
      return new Map(r.rows.map((x) => [x.sensor_id, { siteId: x.site_id, lineId: x.line_id, stationId: x.station_id, assetId: x.asset_id }]));
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}

/**
 * Checks an envelope against the registry. The registry is the source of truth for placement: fields the sender named must match it,
 * and with trustStation false (OTLP, where the station may be derived) the station is taken from the registry.
 */
export async function placeEnvelope(
  envelope: ValidatedTelemetryEnvelope,
  registry: SensorRegistry,
  opts: { topic: string; now: Date; trustStation: boolean }
): Promise<{ envelope: ValidatedTelemetryEnvelope } | { dlq: DeadLetterEnvelope }> {
  const place = await registry.lookup(envelope.tenant_id, envelope.sensor_id);
  const fields: Array<[string, string, string | undefined]> = [
    ["site", envelope.site_id, place?.siteId],
    ["line", envelope.line_id, place?.lineId],
    ["asset", envelope.asset_id, place?.assetId],
  ];
  if (opts.trustStation) fields.push(["station", envelope.station_id, place?.stationId]);
  const mismatch = place ? fields.filter(([, sent, registered]) => sent !== registered) : [];
  if (!place || mismatch.length) {
    return {
      dlq: {
        id: `dlq-${randomBytes(8).toString("hex")}`,
        tenant_id: envelope.tenant_id,
        topic: opts.topic,
        reason: "unknown_sensor",
        payload: envelope,
        error_detail: !place
          ? `Sensor ${envelope.sensor_id} is not registered for tenant ${envelope.tenant_id}`
          : `Sensor ${envelope.sensor_id} is registered at ${mismatch.map(([f, , r]) => `${f} ${r}`).join(", ")}, not ${mismatch.map(([f, s]) => `${f} ${s}`).join(", ")}`,
        received_at: opts.now.toISOString(),
      },
    };
  }
  return { envelope: { ...envelope, site_id: place.siteId, line_id: place.lineId, station_id: place.stationId, asset_id: place.assetId } };
}
