// Local-only scenario controls (config mock.controls_enabled; the loader refuses it outside local).
import type { FastifyInstance } from "fastify";
import type { components } from "@fp/sdk-ts";
import { acmeLine1Samples, principalToken } from "@fp/synthetic-data";
import { seed } from "@fp/db";
import { ProblemError, type Ctx, type Level } from "../context.ts";

type S = components["schemas"];
const LEVELS = new Set(["L0", "L1", "L2", "L3", "L4", "L5"]);

export function mockRoutes(app: FastifyInstance, ctx: Ctx): void {
  app.get("/mock/principals", async () => {
    const r = await ctx.admin.query<{ id: string; display_name: string; role: S["Role"]; session_type: S["SessionType"] }>("SELECT id, display_name, role, session_type FROM plat.principal ORDER BY tenant_id, id");
    return r.rows.map((p): S["MockPrincipal"] => ({ principalId: p.id, displayName: p.display_name, role: p.role, sessionType: p.session_type, token: principalToken(ctx.cfg.synthetic.seed, p.id) }));
  });
  // Sample documents written to the upload templates (ADR-041); each names the equipment it is for, so only that tenant can upload it.
  app.get("/mock/knowledge/samples", async () => acmeLine1Samples().map(({ file: _file, ...doc }): S["SampleDocument"] => doc));
  app.get("/mock/state", async () => {
    const r = await ctx.admin.query<{ fallback_level: Level }>("SELECT fallback_level FROM ops.platform_state ORDER BY tenant_id LIMIT 1");
    const body: S["MockState"] = { fallbackLevel: r.rows[0]?.fallback_level ?? ctx.cfg.mock.initial_fallback_level };
    return body;
  });
  app.put<{ Body: S["MockState"] }>("/mock/state", async req => {
    if (!LEVELS.has(req.body?.fallbackLevel)) throw new ProblemError(422, "fallbackLevel must be L0 to L5");
    await ctx.admin.query("UPDATE ops.platform_state SET fallback_level = $1, reason = $2, since = $3", [req.body.fallbackLevel, req.body.fallbackLevel === "L0" ? null : "set by mock control", ctx.now()]);
    return { fallbackLevel: req.body.fallbackLevel };
  });
  app.post<{ Body: S["MockTelemetry"] }>("/mock/telemetry", async (req, reply) => {
    const { sensorId, values, ageSeconds = 1 } = req.body ?? ({} as S["MockTelemetry"]);
    if (typeof sensorId !== "string" || !Array.isArray(values) || values.length < 1 || values.length > 1000 || !values.every(Number.isFinite) || !Number.isInteger(ageSeconds) || ageSeconds < 0) {
      throw new ProblemError(422, "sensorId, 1 to 1000 finite values and a non-negative integer ageSeconds are required");
    }
    const sensor = (await ctx.admin.query<{ tenant_id: string }>("SELECT tenant_id FROM ref.sensor WHERE id = $1", [sensorId])).rows[0];
    if (!sensor) throw new ProblemError(404, "Sensor not registered");
    const end = ctx.telemetryNow().getTime() - ageSeconds * 1000;
    await ctx.admin.query(
      `INSERT INTO tel.telemetry_point (tenant_id, sensor_id, ts, value)
       SELECT $1, $2, to_timestamp(($3::double precision - ($5::int - k) * 1000) / 1000), v FROM unnest($4::numeric[]) WITH ORDINALITY AS r(v, k)`,
      [sensor.tenant_id, sensorId, end, values, values.length]);
    return reply.code(204).send();
  });
  app.post("/mock/reset", async (_req, reply) => {
    await seed(ctx.admin, ctx.cfg);
    if (ctx.cfg.mock.initial_fallback_level !== "L0") await ctx.admin.query("UPDATE ops.platform_state SET fallback_level = $1", [ctx.cfg.mock.initial_fallback_level]);
    return reply.code(204).send();
  });
}
