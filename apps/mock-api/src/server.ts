// Mock API (ADR-030 item 4): serves doc/api/openapi.yaml from the synthetic data in local PostgreSQL.
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { createHash, randomUUID } from "node:crypto";
import { ProblemError, withTenant, type Ctx, type Principal } from "./context.ts";
import { denyReason, permissionsFor, ROUTE_RULES, type Permissions } from "./rbac.ts";
import { scope } from "./scope.ts";
import { coreRoutes } from "./routes/core.ts";
import { caseRoutes } from "./routes/cases.ts";
import { sensorRoutes } from "./routes/sensors.ts";
import { mockRoutes } from "./routes/mock.ts";
import { knowledgeRoutes } from "./routes/knowledge.ts";
import { plantRoutes } from "./routes/plant.ts";
import { adminRoutes } from "./routes/admin.ts";

declare module "fastify" {
  interface FastifyRequest { principal: Principal; permissions: Permissions }
  interface FastifyInstance { routeKeys: string[] }
}

export async function buildServer(ctx: Ctx): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, requestTimeout: ctx.cfg.api.request_timeout_ms, genReqId: () => randomUUID().replaceAll("-", "") });
  await app.register(cors, { origin: ctx.cfg.api.cors_origins, allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"], methods: ["GET", "POST", "PUT", "DELETE"] });
  app.decorateRequest("principal", null as unknown as Principal);
  app.decorateRequest("permissions", null as unknown as Permissions);
  // Every registered route, so a test can prove each /v1 route has an access rule (ADR-040).
  app.decorate("routeKeys", [] as string[]);
  app.addHook("onRoute", r => { for (const m of [r.method].flat()) if (m !== "HEAD") app.routeKeys.push(`${m} ${r.url}`); });

  app.addHook("onRequest", async req => {
    if (req.method === "OPTIONS") return;
    const path = req.url.split("?")[0] ?? "";
    if (path.startsWith("/mock/")) {
      if (!ctx.cfg.mock.controls_enabled) throw new ProblemError(404, "Not found");
      return;
    }
    if (!path.startsWith("/v1/")) throw new ProblemError(404, "Not found");
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) throw new ProblemError(401, "Sign in required");
    const hash = createHash("sha256").update(token).digest("hex");
    const r = await ctx.app.query<{ id: string; tenant_id: string; display_name: string; role: Principal["role"]; session_type: Principal["sessionType"]; site_id: string }>("SELECT * FROM plat.resolve_principal($1)", [hash]);
    const p = r.rows[0];
    if (!p) throw new ProblemError(401, "Unknown or expired token");
    req.principal = { id: p.id, tenantId: p.tenant_id, displayName: p.display_name, role: p.role, sessionType: p.session_type, siteId: p.site_id };
  });

  // Role-based access on every /v1 route, after authentication and before the handler (NFR-S6, ADR-040).
  app.addHook("preHandler", async req => {
    if (!req.principal || !req.routeOptions.url) return;
    req.permissions = await withTenant(ctx, req.principal.tenantId, async c => permissionsFor(ctx.cfg, c, req.principal.role, (await scope(ctx, c, req.principal)).edition));
    const reason = denyReason(ROUTE_RULES[`${req.method} ${req.routeOptions.url}`], req.permissions);
    if (reason) throw new ProblemError(403, "Not permitted for your role", reason);
  });

  app.setErrorHandler((err, req, reply) => {
    const status = err instanceof ProblemError ? err.status : (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : String(err);
    const title = err instanceof ProblemError ? err.title : status >= 500 ? "Internal error" : message;
    const detail = err instanceof ProblemError ? err.detail : status >= 500 ? undefined : message;
    if (status >= 500) console.error(err);
    void reply.code(status).type("application/problem+json").send({ type: "about:blank", title, status, ...(detail ? { detail } : {}), ...(err instanceof ProblemError ? err.extra : {}), traceId: req.id });
  });

  coreRoutes(app, ctx);
  caseRoutes(app, ctx);
  sensorRoutes(app, ctx);
  mockRoutes(app, ctx);
  knowledgeRoutes(app, ctx);
  plantRoutes(app, ctx);
  adminRoutes(app, ctx);
  return app;
}
