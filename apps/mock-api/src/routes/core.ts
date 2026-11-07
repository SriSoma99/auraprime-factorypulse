// Session, status, lines and alerts (W01, W02).
import type { FastifyInstance } from "fastify";
import type { components } from "@fp/sdk-ts";
import { withTenant, ProblemError, type Ctx } from "../context.ts";
import { scope, isBasic } from "../scope.ts";

type S = components["schemas"];
const iso = (d: Date) => d.toISOString();

export function coreRoutes(app: FastifyInstance, ctx: Ctx): void {
  app.get("/v1/session", async req => withTenant(ctx, req.principal.tenantId, async c => {
    const s = await scope(ctx, c, req.principal);
    const body: S["Session"] = { principalId: s.p.id, displayName: s.p.displayName, role: s.p.role, sessionType: s.p.sessionType, tenantId: s.p.tenantId, tenantName: s.tenantName, siteId: s.p.siteId, siteName: s.siteName, edition: s.edition, permissions: req.permissions };
    return body;
  }));

  app.get("/v1/status", async req => withTenant(ctx, req.principal.tenantId, async c => {
    const s = await scope(ctx, c, req.principal);
    const body: S["PlatformStatus"] = { fallbackLevel: s.level, reason: s.levelReason, since: s.levelSince, minimumApprovalTier: ctx.cfg.policy.min_tier_by_level[s.level], liveUpdatedAt: iso(ctx.now()) };
    return body;
  }));

  app.get("/v1/lines", async req => withTenant(ctx, req.principal.tenantId, async c => {
    const r = await c.query<{ id: string; name: string; open_alerts: string }>(
      `SELECT l.id, l.name, count(a.id) FILTER (WHERE a.status <> 'resolved') AS open_alerts FROM ref.line l LEFT JOIN intel.alert a ON a.line_id = l.id GROUP BY l.id ORDER BY l.name`);
    return r.rows.map((x): S["LineSummary"] => ({ id: x.id, name: x.name, openAlerts: Number(x.open_alerts) }));
  }));

  app.get<{ Params: { lineId: string } }>("/v1/lines/:lineId/overview", async req => withTenant(ctx, req.principal.tenantId, async c => {
    const s = await scope(ctx, c, req.principal);
    const line = (await c.query<{ id: string; name: string }>("SELECT id, name FROM ref.line WHERE id = $1", [req.params.lineId])).rows[0];
    if (!line) throw new ProblemError(404, "Line not found");
    const stations = (await c.query<{ id: string; name: string; cycle_time_s: string; is_bottleneck: boolean; last_reading_at: Date; open_alerts: string; incident_id: string | null }>(
      `SELECT st.id, st.name, st.cycle_time_s, st.is_bottleneck, st.last_reading_at,
              count(a.id) FILTER (WHERE a.status <> 'resolved') AS open_alerts, min(a.incident_id) AS incident_id
         FROM ref.station st LEFT JOIN ref.asset as2 ON as2.station_id = st.id LEFT JOIN ref.sensor se ON se.asset_id = as2.id
         LEFT JOIN intel.alert a ON a.sensor_id = se.id
        WHERE st.line_id = $1 GROUP BY st.id ORDER BY st.position`, [line.id])).rows;
    const links = (await c.query<{ from_station_id: string; to_station_id: string; buffer_minutes: string | null }>(
      "SELECT l.from_station_id, l.to_station_id, l.buffer_minutes FROM ref.station_link l JOIN ref.station s ON s.id = l.from_station_id WHERE s.line_id = $1", [line.id])).rows;
    const impact = (await c.query<{ cascade: S["LineOverview"]["cascade"]; station_impact: S["LineOverview"]["stationImpact"] }>("SELECT cascade, station_impact FROM intel.line_impact WHERE line_id = $1", [line.id])).rows[0];
    const full = s.edition === "full";
    const openAlerts = stations.reduce((n, x) => n + Number(x.open_alerts), 0);
    const body: S["LineOverview"] = {
      line: { id: line.id, name: line.name, openAlerts },
      stations: stations.map(x => ({ id: x.id, name: x.name, cycleTimeSeconds: Number(x.cycle_time_s), state: Number(x.open_alerts) > 0 ? "alert" : "normal", openAlerts: Number(x.open_alerts), lastReadingAt: iso(x.last_reading_at), incidentId: x.incident_id, isBottleneck: full ? x.is_bottleneck : null })),
      links: links.map(l => ({ fromStationId: l.from_station_id, toStationId: l.to_station_id, bufferMinutes: l.buffer_minutes === null ? null : Number(l.buffer_minutes) })),
      impactStatus: !full ? "not_available" : isBasic(s.level) ? "basic" : "estimated",
      cascade: full && !isBasic(s.level) ? impact?.cascade ?? null : null,
      stationImpact: full && !isBasic(s.level) ? impact?.station_impact ?? null : null,
    };
    return body;
  }));

  app.get<{ Querystring: { status?: "open" | "all"; lineId?: string } }>("/v1/alerts", async req => withTenant(ctx, req.principal.tenantId, async c => {
    const s = await scope(ctx, c, req.principal);
    const full = s.edition === "full";
    const rows = (await c.query<{ id: string; signal_name: string; detail: string; status: S["Alert"]["status"]; status_note: string | null; rank: number | null; impact: S["ImpactLevel"] | null; lead_time: S["LeadTime"] | null; group_id: string | null; incident_id: string | null; arrived_at: Date; is_synthetic: boolean; asset_name: string; station_name: string; trust_level: S["TrustLevel"] | null; trust_score: string | null }>(
      `SELECT a.*, ast.name AS asset_name, st.name AS station_name, t.level AS trust_level, t.score AS trust_score
         FROM intel.alert a JOIN ref.sensor se ON se.id = a.sensor_id JOIN ref.asset ast ON ast.id = se.asset_id JOIN ref.station st ON st.id = ast.station_id
         LEFT JOIN intel.trust_assessment t ON t.sensor_id = a.sensor_id
        WHERE ($1::text IS NULL OR a.line_id = $1) AND ($2 = 'all' OR a.status <> 'resolved')`, [req.query.lineId ?? null, req.query.status ?? "open"])).rows;
    const items: S["Alert"][] = rows.map(a => ({
      id: a.id, assetName: a.asset_name, stationName: a.station_name, signalName: a.signal_name, detail: a.detail, status: a.status, statusNote: a.status_note,
      rank: full ? a.rank : null, impact: full ? a.impact : null, leadTime: full ? a.lead_time : null,
      trust: full && a.trust_level ? { level: a.trust_level, score: a.trust_score === null ? null : Number(a.trust_score) } : null,
      groupId: a.group_id, incidentId: a.incident_id, arrivedAt: iso(a.arrived_at), isSynthetic: a.is_synthetic,
    }));
    items.sort(full ? (x, y) => (x.rank ?? 99) - (y.rank ?? 99) || y.arrivedAt.localeCompare(x.arrivedAt) : (x, y) => y.arrivedAt.localeCompare(x.arrivedAt));
    const groups = (await c.query<{ id: string; title: string; likely_causes: number; incident_id: string | null }>("SELECT * FROM intel.alert_group")).rows
      .map((g): S["AlertGroup"] => ({ id: g.id, title: g.title, likelyCauses: g.likely_causes, incidentId: g.incident_id, alertIds: items.filter(i => i.groupId === g.id).map(i => i.id) }));
    const ungrouped = items.filter(i => !i.groupId).length;
    const body: S["AlertList"] = { items, groups, total: items.length, likelyCauses: ungrouped + groups.reduce((n, g) => n + g.likelyCauses, 0), sortedBy: full ? "impact" : "newest" };
    return body;
  }));
}
