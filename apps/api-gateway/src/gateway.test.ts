import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { config, appPool, adminPool } from "@fp/db";
import { buildApiGateway } from "./server.ts";
import { WebhookService } from "./webhooks.ts";

describe("API Gateway & Platform Services (APP-17, APP-18, APP-19, APP-25 / API-1..6)", () => {
  let app: FastifyInstance;
  let pool: ReturnType<typeof appPool>;
  let admPool: ReturnType<typeof adminPool>;

  const deliveredRequests: { url: string; headers: Record<string, string>; body: any; rawBody: string }[] = [];
  const mockFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headersObj: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { headersObj[k.toLowerCase()] = v; });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([k, v]) => { headersObj[k.toLowerCase()] = v; });
      } else {
        for (const [k, v] of Object.entries(init.headers)) {
          headersObj[k.toLowerCase()] = String(v);
        }
      }
    }
    const rawBody = (init?.body as string) || "{}";
    deliveredRequests.push({
      url: String(url),
      headers: headersObj,
      body: JSON.parse(rawBody),
      rawBody
    });
    return new Response(JSON.stringify({ received: true }), { status: 200, statusText: "OK" });
  };

  beforeAll(async () => {
    const cfg = config();
    pool = appPool(cfg);
    admPool = adminPool(cfg);
    app = buildApiGateway({ pool, fetchFn: mockFetch as any });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await admPool.end();
  });

  it("API-3: creates an API key with hashed storage and validates authentication", async () => {
    // 1. Generate key via admin token
    const res = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: { authorization: "Bearer test-admin-token" },
      payload: {
        name: "Test Ingest Client",
        scopes: ["read:alerts", "ingest:telemetry"],
        rateLimitPerMin: 100,
        monthlyQuota: 5000
      }
    });

    expect(res.statusCode).toBe(200);
    const keyData = res.json();
    expect(keyData.id).toMatch(/^key_/);
    expect(keyData.secretKey).toMatch(/^fp_live_/);
    expect(keyData.keyPrefix).toBe(keyData.secretKey.slice(0, 16));

    // 2. Validate key can authenticate and query usage
    const authRes = await app.inject({
      method: "GET",
      url: "/v1/usage",
      headers: { "x-api-key": keyData.secretKey }
    });
    expect(authRes.statusCode).toBe(200);
    expect(authRes.json().tenantId).toBe("t-demo");

    // 3. Verify key revocation
    const revokeRes = await app.inject({
      method: "DELETE",
      url: `/v1/api-keys/${keyData.id}`,
      headers: { authorization: "Bearer test-admin-token" }
    });
    expect(revokeRes.statusCode).toBe(200);

    // 4. Revoked key is rejected
    const rejectedRes = await app.inject({
      method: "GET",
      url: "/v1/usage",
      headers: { "x-api-key": keyData.secretKey }
    });
    expect(rejectedRes.statusCode).toBe(401);
  });

  it("API-4: enforces monthly quota and returns 429 when quota is exhausted", async () => {
    // Create key with strict quota of 2 requests
    const res = await app.inject({
      method: "POST",
      url: "/v1/api-keys",
      headers: { authorization: "Bearer test-admin-token" },
      payload: {
        name: "Quota Restricted Client",
        scopes: ["read:alerts"],
        rateLimitPerMin: 50,
        monthlyQuota: 2
      }
    });

    const keyData = res.json();

    // Request 1: OK
    const r1 = await app.inject({
      method: "GET",
      url: "/v1/usage",
      headers: { "x-api-key": keyData.secretKey }
    });
    expect(r1.statusCode).toBe(200);

    // Request 2: OK
    const r2 = await app.inject({
      method: "GET",
      url: "/v1/usage",
      headers: { "x-api-key": keyData.secretKey }
    });
    expect(r2.statusCode).toBe(200);

    // Request 3: Exceeded monthly quota -> 429
    const r3 = await app.inject({
      method: "GET",
      url: "/v1/usage",
      headers: { "x-api-key": keyData.secretKey }
    });
    expect(r3.statusCode).toBe(429);
    expect(r3.json().title).toBe("Monthly request quota exceeded");
  });

  it("API-5: records usage metering events and provides aggregated summary", async () => {
    // Check usage endpoint returns aggregated list
    const res = await app.inject({
      method: "GET",
      url: "/v1/usage",
      headers: { authorization: "Bearer test-admin-token" }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);

    const apiReqMeter = body.items.find((m: any) => m.meter === "api.request");
    expect(apiReqMeter).toBeDefined();
    expect(apiReqMeter.totalQuantity).toBeGreaterThan(0);
  });

  it("API-6: registers webhook and dispatches HMAC-SHA256 signed event with delivery log", async () => {
    deliveredRequests.length = 0;

    const cl = await admPool.connect();
    try {
      await cl.query("BEGIN");
      await cl.query("SELECT set_config('app.tenant_id', 't-demo', true)");
      await cl.query("DELETE FROM plat.webhook_delivery");
      await cl.query("DELETE FROM plat.webhook_endpoint");
      await cl.query("COMMIT");
    } finally {
      cl.release();
    }

    // 1. Register webhook
    const regRes = await app.inject({
      method: "POST",
      url: "/v1/webhooks",
      headers: { authorization: "Bearer test-admin-token" },
      payload: {
        url: "https://plant-erp.example/webhooks/fp-events",
        events: ["alert.verified", "approval.granted"]
      }
    });

    expect(regRes.statusCode).toBe(200);
    const webhook = regRes.json();
    expect(webhook.id).toMatch(/^wh_/);
    expect(webhook.secret_token).toMatch(/^whsec_/);

    // 2. Dispatch event
    const dispatchRes = await app.inject({
      method: "POST",
      url: "/v1/webhooks/test-dispatch",
      headers: { authorization: "Bearer test-admin-token" },
      payload: {
        eventType: "alert.verified",
        payload: {
          alertId: "AL-TEST-001",
          assetId: "ASSET-WC4",
          severity: "high"
        }
      }
    });

    expect(dispatchRes.statusCode).toBe(200);
    expect(dispatchRes.json().dispatched).toBeGreaterThanOrEqual(1);

    // 3. Verify mock received signed payload
    expect(deliveredRequests.length).toBeGreaterThanOrEqual(1);
    const req = deliveredRequests.find(r => r.url === "https://plant-erp.example/webhooks/fp-events");
    expect(req).toBeDefined();
    expect(req!.headers["x-event-type"]).toBe("alert.verified");
    expect(req!.headers["x-signature-sha256"]).toMatch(/^sha256=/);

    // Verify cryptographic signature matches
    const isValid = WebhookService.verifySignature(
      webhook.secret_token,
      req!.rawBody,
      req!.headers["x-signature-sha256"]!
    );
    expect(isValid).toBe(true);

    // 4. Verify delivery log
    const deliveriesRes = await app.inject({
      method: "GET",
      url: `/v1/webhooks/deliveries?endpointId=${webhook.id}`,
      headers: { authorization: "Bearer test-admin-token" }
    });
    expect(deliveriesRes.statusCode).toBe(200);
    const deliveries = deliveriesRes.json().items;
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    expect(deliveries[0].status).toBe("delivered");
  });
});
