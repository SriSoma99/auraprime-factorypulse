// Plant equipment view for W14: registry hierarchy with limits, latest readings and basic health (ING-7, ING-12, ADR-039).
import type { FastifyInstance } from "fastify";
import type { components } from "@fp/sdk-ts";
import { withTenant, type Ctx } from "../context.ts";
import { assessSensor, machineState, settleForState } from "../health.ts";

type S = components["schemas"];
type Num = string | null;
interface Row {
  site_id: string; site_name: string; line_id: string; line_name: string;
  station_id: string; station_name: string; position: number; cycle_time_s: string; is_bottleneck: boolean; buffer_minutes: Num;
  asset_id: string | null; asset_name: string | null; equipment_type: string | null; plant_tag: string | null; model: string | null;
  state_sensor_id: string | null; run_at_or_above: Num; stopped_below: Num;
  sensor_id: string | null; sensor_name: string | null; measurand: string | null; unit: string | null;
  normal_min: Num; normal_max: Num; instrument_min: Num; instrument_max: Num; max_silence_s: number | null;
  readings: { ts: string; value: string }[] | null;
}
const num = (v: Num) => (v === null ? null : Number(v));
const range = (min: Num, max: Num): S["Range"] | null => (min === null || max === null ? null : { min: Number(min), max: Number(max) });

export function plantRoutes(app: FastifyInstance, ctx: Ctx): void {
  app.get("/v1/plant", async req => withTenant(ctx, req.principal.tenantId, async c => {
    const h = ctx.cfg.telemetry_health;
    const now = ctx.telemetryNow();
    const since = new Date(now.getTime() - h.lookback_minutes * 60_000);
    // Newest readings first, only as many as the flatline window needs; row-level security scopes every table (invariant 4).
    const rows = (await c.query<Row>(
      `SELECT si.id AS site_id, si.name AS site_name, l.id AS line_id, l.name AS line_name,
              st.id AS station_id, st.name AS station_name, st.position, st.cycle_time_s, st.is_bottleneck, lk.buffer_minutes,
              a.id AS asset_id, a.name AS asset_name, a.equipment_type, a.plant_tag, a.model, a.state_sensor_id, a.run_at_or_above, a.stopped_below,
              se.id AS sensor_id, se.name AS sensor_name, se.measurand, se.unit, se.normal_min, se.normal_max, se.instrument_min, se.instrument_max, se.max_silence_s,
              r.readings
         FROM ref.site si
         JOIN ref.line l ON l.site_id = si.id
         JOIN ref.station st ON st.line_id = l.id
         LEFT JOIN ref.station_link lk ON lk.from_station_id = st.id
         LEFT JOIN ref.asset a ON a.station_id = st.id
         LEFT JOIN ref.sensor se ON se.asset_id = a.id
         LEFT JOIN LATERAL (
           SELECT json_agg(json_build_object('ts', p.ts, 'value', p.value) ORDER BY p.ts DESC) AS readings
             FROM (SELECT ts, value FROM tel.telemetry_point tp WHERE tp.sensor_id = se.id AND tp.ts > $1 AND tp.ts <= $2 ORDER BY ts DESC LIMIT $3) p
         ) r ON se.id IS NOT NULL
        ORDER BY si.name, l.name, st.position, a.name, se.id`,
      [since, now, h.flatline_min_points])).rows;

    const counts: S["PlantView"]["counts"] = { ok: 0, out_of_range: 0, flatline: 0, stale: 0, no_data: 0, not_configured: 0 };
    const sites = new Map<string, S["PlantSite"]>(), lines = new Map<string, S["PlantLine"]>(), stations = new Map<string, S["PlantStation"]>();
    const machines = new Map<string, { m: S["PlantMachine"]; rule: { runAtOrAbove: number; stoppedBelow: number } | null; health: Map<string, ReturnType<typeof assessSensor>> }>();

    for (const r of rows) {
      let site = sites.get(r.site_id);
      if (!site) sites.set(r.site_id, site = { id: r.site_id, name: r.site_name, lines: [] });
      let line = lines.get(r.line_id);
      if (!line) { lines.set(r.line_id, line = { id: r.line_id, name: r.line_name, stations: [] }); site.lines.push(line); }
      let station = stations.get(r.station_id);
      if (!station) {
        stations.set(r.station_id, station = { id: r.station_id, name: r.station_name, position: r.position, cycleTimeSeconds: Number(r.cycle_time_s), isBottleneck: r.is_bottleneck, bufferToNextMinutes: num(r.buffer_minutes), machines: [] });
        line.stations.push(station);
      }
      if (!r.asset_id) continue;
      let machine = machines.get(r.asset_id);
      if (!machine) {
        const rule = r.run_at_or_above === null || r.stopped_below === null ? null : { runAtOrAbove: Number(r.run_at_or_above), stoppedBelow: Number(r.stopped_below) };
        machine = { m: { id: r.asset_id, name: r.asset_name!, equipmentType: r.equipment_type, plantTag: r.plant_tag, model: r.model, state: "unknown", stateSensorId: r.state_sensor_id, sensors: [] }, rule, health: new Map() };
        machines.set(r.asset_id, machine);
        station.machines.push(machine.m);
      }
      if (!r.sensor_id) continue;
      const readings = (r.readings ?? []).map(p => ({ ts: new Date(p.ts), value: Number(p.value) }));
      const health = assessSensor({ normalMin: num(r.normal_min), normalMax: num(r.normal_max), maxSilenceS: r.max_silence_s }, readings, now,
        { flatlineMinPoints: h.flatline_min_points, flatlineTolerancePct: h.flatline_tolerance_pct });
      machine.health.set(r.sensor_id, health);
      machine.m.sensors.push({
        id: r.sensor_id, name: r.sensor_name!, measurand: r.measurand, unit: r.unit!, normalRange: range(r.normal_min, r.normal_max), instrumentRange: range(r.instrument_min, r.instrument_max),
        maxSilenceSeconds: r.max_silence_s, status: health.status, direction: health.direction, lastValue: health.lastValue, lastAt: health.lastAt?.toISOString() ?? null, silentForSeconds: health.silentForS,
      });
    }
    // Machine state first, then each sensor's status in the light of it, then the plant totals
    for (const { m, rule, health } of machines.values()) {
      m.state = machineState(rule, m.stateSensorId ? health.get(m.stateSensorId) : undefined);
      for (const s of m.sensors) {
        s.status = settleForState(health.get(s.id)!, m.state).status;
        counts[s.status]++;
      }
    }

    const body: S["PlantView"] = { generatedAt: now.toISOString(), lookbackMinutes: h.lookback_minutes, counts, sites: [...sites.values()] };
    return body;
  }));
}
