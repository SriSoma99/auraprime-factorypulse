// Sensor list and trust detail (W05). Trust is Full-only (TRU-1 to TRU-4).
import type { FastifyInstance } from "fastify";
import type { components } from "@fp/sdk-ts";
import { withTenant, ProblemError, type Ctx } from "../context.ts";
import { scope, isBasic } from "../scope.ts";

type S = components["schemas"];
const BASIC_CHECKS = new Set(["Range and rate", "Staleness", "Flatline"]);

export function sensorRoutes(app: FastifyInstance, ctx: Ctx): void {
  const listSql = `SELECT se.id, se.name, se.asset_id, ast.name AS asset_name, st.name AS station_name, se.meta, t.level, t.score
      FROM ref.sensor se JOIN ref.asset ast ON ast.id = se.asset_id JOIN ref.station st ON st.id = ast.station_id
      LEFT JOIN intel.trust_assessment t ON t.sensor_id = se.id`;
  type Row = { id: string; name: string; asset_id: string; asset_name: string; station_name: string; meta: string; level: S["TrustLevel"] | null; score: string | null };
  const summary = (r: Row, full: boolean): S["SensorSummary"] => ({ id: r.id, name: r.name, assetId: r.asset_id, assetName: r.asset_name, stationName: r.station_name, trust: full && r.level ? { level: r.level, score: r.score === null ? null : Number(r.score) } : null });

  app.get<{ Querystring: { assetId?: string } }>("/v1/sensors", async req => withTenant(ctx, req.principal.tenantId, async c => {
    const s = await scope(ctx, c, req.principal);
    const rows = (await c.query<Row>(`${listSql} WHERE ($1::text IS NULL OR se.asset_id = $1) ORDER BY t.score ASC NULLS LAST, se.name`, [req.query.assetId ?? null])).rows;
    return rows.map(r => summary(r, s.edition === "full"));
  }));

  app.get<{ Params: { sensorId: string } }>("/v1/sensors/:sensorId/trust", async req => withTenant(ctx, req.principal.tenantId, async c => {
    const s = await scope(ctx, c, req.principal);
    if (s.edition !== "full") throw new ProblemError(403, "Telemetry trust is part of the Full edition", "TRU-1 to TRU-4 are not available in the Community build.");
    const r = (await c.query<Row>(`${listSql} WHERE se.id = $1`, [req.params.sensorId])).rows[0];
    if (!r) throw new ProblemError(404, "Sensor not found");
    const t = (await c.query<{ score: string | null; level: S["TrustLevel"]; verdict: S["SensorTrust"]["verdict"]; verdict_text: string; checks: S["SensorTrust"]["checks"]; series: S["SensorTrust"]["series"]; history: S["SensorTrust"]["history"]; sensor_work_order_id: string | null }>(
      "SELECT * FROM intel.trust_assessment WHERE sensor_id = $1", [r.id])).rows[0];
    if (!t) throw new ProblemError(404, "No trust assessment for this sensor");
    const basic = isBasic(s.level);
    const body: S["SensorTrust"] = {
      sensor: summary(r, true), meta: r.meta, score: t.score === null ? null : Number(t.score), level: t.level, verdict: t.verdict, verdictText: t.verdict_text, sensorWorkOrderId: t.sensor_work_order_id,
      checks: t.checks.map(ch => (basic && !BASIC_CHECKS.has(ch.name) ? { name: ch.name, score: null, status: "not_running", finding: `paused at ${s.level}` } : ch)),
      series: t.series, history: t.history,
    };
    return body;
  }));
}
