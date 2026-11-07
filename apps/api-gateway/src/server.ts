import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { ApiKeyService } from "./keys.ts";
import { MeteringService } from "./metering.ts";
import { RateLimiter } from "./ratelimit.ts";
import { WebhookService } from "./webhooks.ts";
import { ProblemError, type PrincipalIdentity } from "./types.ts";

declare module "fastify" {
  interface FastifyRequest {
    principal: PrincipalIdentity;
    apiKeyId?: string;
  }
}

export interface ApiGatewayOptions {
  pool: Pool;
  fetchFn?: typeof globalThis.fetch;
}

export function buildApiGateway(opts: ApiGatewayOptions): FastifyInstance {
  const app = Fastify({
    logger: false,
    genReqId: () => randomUUID().replaceAll("-", "")
  });

  const keyService = new ApiKeyService(opts.pool);
  const meteringService = new MeteringService(opts.pool);
  const rateLimiter = new RateLimiter();
  const webhookService = new WebhookService(opts.pool, opts.fetchFn);

  void app.register(cors, {
    origin: true,
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "X-Api-Key"],
    methods: ["GET", "POST", "PUT", "DELETE"]
  });

  app.decorateRequest("principal", null as unknown as PrincipalIdentity);

  // Authentication & Rate Limiting Hook
  app.addHook("onRequest", async (req: FastifyRequest) => {
    if (req.method === "OPTIONS") return;
    const path = req.url.split("?")[0] ?? "";
    if (path === "/v1/health") return;

    const authHeader = req.headers.authorization ?? "";
    const apiKeyHeader = (req.headers["x-api-key"] as string | undefined) ?? "";

    let rawKey = "";
    if (apiKeyHeader) {
      rawKey = apiKeyHeader;
    } else if (authHeader.startsWith("Bearer fp_live_")) {
      rawKey = authHeader.slice(7);
    }

    if (rawKey) {
      const auth = await keyService.authenticateApiKey(rawKey);
      if (!auth) {
        throw new ProblemError(401, "Invalid, revoked, or expired API key");
      }

      // Check Rate Limit and Quota (API-4)
      const limitRes = rateLimiter.checkRateLimit(
        auth.key.id,
        auth.key.rate_limit_per_min,
        auth.key.quota_used,
        auth.key.monthly_quota
      );

      if (!limitRes.allowed) {
        if (limitRes.reason === "monthly_quota_exceeded") {
          throw new ProblemError(429, "Monthly request quota exceeded", `Key '${auth.key.name}' reached its monthly quota of ${auth.key.monthly_quota} requests`);
        } else {
          throw new ProblemError(429, "Rate limit exceeded", `Exceeded ${auth.key.rate_limit_per_min} requests per minute`);
        }
      }

      req.principal = auth.principal;
      req.apiKeyId = auth.key.id;

      // Record API request meter (API-5)
      await meteringService.recordUsage(auth.key.tenant_id, "api.request", 1, req.id, auth.key.id);
      return;
    }

    // Default development fallback for internal platform tokens
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (token === "test-admin-token") {
        req.principal = {
          id: "u-admin",
          tenantId: "t-demo",
          displayName: "System Admin",
          role: "admin",
          sessionType: "human",
          scopes: ["admin:all", "read:alerts", "draft:workorders", "webhooks:manage"]
        };
        return;
      }
    }

    throw new ProblemError(401, "Sign in or API key required");
  });

  // Error Handler RFC 9457
  app.setErrorHandler((err, req, reply) => {
    const status = err instanceof ProblemError ? err.status : (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : String(err);
    const title = err instanceof ProblemError ? err.title : status >= 500 ? "Internal error" : message;
    const detail = err instanceof ProblemError ? err.detail : status >= 500 ? undefined : message;

    void reply.code(status).type("application/problem+json").send({
      type: "about:blank",
      title,
      status,
      ...(detail ? { detail } : {}),
      traceId: req.id
    });
  });

  // Health
  app.get("/v1/health", async () => {
    return { status: "ok", service: "api-gateway", version: "0.1.0" };
  });

  // API Key Management (API-3)
  app.post("/v1/api-keys", async (req) => {
    const body = req.body as {
      name: string;
      scopes?: string[];
      rateLimitPerMin?: number;
      monthlyQuota?: number;
      expiresInDays?: number;
    };
    if (!body?.name) {
      throw new ProblemError(400, "Validation failed", "Missing required field: name");
    }

    const created = await keyService.createApiKey(req.principal.tenantId, {
      name: body.name,
      scopes: body.scopes ?? ["read:alerts"],
      rateLimitPerMin: body.rateLimitPerMin,
      monthlyQuota: body.monthlyQuota,
      expiresInDays: body.expiresInDays
    });

    return created;
  });

  app.get("/v1/api-keys", async (req) => {
    return await keyService.listApiKeys(req.principal.tenantId);
  });

  app.delete("/v1/api-keys/:id", async (req) => {
    const { id } = req.params as { id: string };
    const revoked = await keyService.revokeApiKey(req.principal.tenantId, id);
    if (!revoked) throw new ProblemError(404, "API key not found");
    return { success: true, keyId: id, status: "revoked" };
  });

  // Usage Metering (API-5)
  app.get("/v1/usage", async (req) => {
    const { meter } = req.query as { meter?: string };
    const summary = await meteringService.getUsageSummary(req.principal.tenantId, meter);
    return { tenantId: req.principal.tenantId, items: summary };
  });

  // Webhooks (API-6)
  app.post("/v1/webhooks", async (req) => {
    const body = req.body as { url: string; events: string[] };
    if (!body?.url || !body?.events?.length) {
      throw new ProblemError(400, "Validation failed", "URL and event list required");
    }

    const endpoint = await webhookService.registerWebhook(
      req.principal.tenantId,
      body.url,
      body.events
    );
    return endpoint;
  });

  app.post("/v1/webhooks/test-dispatch", async (req) => {
    const body = req.body as { eventType: string; payload: Record<string, unknown> };
    if (!body?.eventType) throw new ProblemError(400, "Event type required");

    const dispatches = await webhookService.dispatchEvent(
      req.principal.tenantId,
      body.eventType,
      body.payload ?? {}
    );
    return { dispatched: dispatches.length, results: dispatches };
  });

  app.get("/v1/webhooks/deliveries", async (req) => {
    const { endpointId } = req.query as { endpointId?: string };
    const deliveries = await webhookService.listDeliveries(req.principal.tenantId, endpointId);
    return { items: deliveries };
  });

  return app;
}
