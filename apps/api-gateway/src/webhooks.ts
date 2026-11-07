import { createHmac, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import type { WebhookDeliveryRecord, WebhookEndpointRecord } from "./types.ts";

export interface DispatchResult {
  deliveryId: string;
  endpointId: string;
  status: "delivered" | "failed";
  responseStatus?: number;
  attempts: number;
}

export class WebhookService {
  constructor(
    private readonly pool: Pool,
    private readonly fetchFn: typeof globalThis.fetch = globalThis.fetch
  ) {}

  async registerWebhook(
    tenantId: string,
    url: string,
    events: string[]
  ): Promise<WebhookEndpointRecord> {
    const endpointId = `wh_${randomBytes(8).toString("hex")}`;
    const secretToken = `whsec_${randomBytes(24).toString("hex")}`;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      const res = await client.query<WebhookEndpointRecord>(
        `INSERT INTO plat.webhook_endpoint (id, tenant_id, url, secret_token, events)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING *`,
        [endpointId, tenantId, url, secretToken, JSON.stringify(events)]
      );
      await client.query("COMMIT");
      return res.rows[0]!;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  static signPayload(secret: string, payload: Record<string, unknown> | string): string {
    const bodyStr = typeof payload === "string" ? payload : JSON.stringify(payload);
    const hmac = createHmac("sha256", secret).update(bodyStr).digest("hex");
    return `sha256=${hmac}`;
  }

  static verifySignature(secret: string, payload: Record<string, unknown> | string, signature: string): boolean {
    const expected = WebhookService.signPayload(secret, payload);
    return expected === signature;
  }

  async dispatchEvent(
    tenantId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<DispatchResult[]> {
    const client = await this.pool.connect();
    let endpoints: WebhookEndpointRecord[] = [];
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      const res = await client.query<WebhookEndpointRecord>(
        `SELECT * FROM plat.webhook_endpoint
         WHERE active = true AND events @> $1::jsonb`,
        [JSON.stringify([eventType])]
      );
      endpoints = res.rows;
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const results: DispatchResult[] = [];

    for (const ep of endpoints) {
      const deliveryId = `del_${randomBytes(8).toString("hex")}`;
      const signature = WebhookService.signPayload(ep.secret_token, payload);
      let status: "delivered" | "failed" = "failed";
      let responseStatus: number | undefined;
      let attempts = 0;

      // Attempt delivery with 1 immediate retry on network failure
      for (let i = 0; i < 2; i++) {
        attempts++;
        try {
          const resp = await this.fetchFn(ep.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Signature-SHA256": signature,
              "X-Event-Type": eventType,
              "X-Delivery-Id": deliveryId
            },
            body: JSON.stringify(payload)
          });
          responseStatus = resp.status;
          if (resp.ok) {
            status = "delivered";
            break;
          }
        } catch {
          // Network failure, retry loop continues
        }
      }

      // Record delivery log
      const logClient = await this.pool.connect();
      try {
        await logClient.query("BEGIN");
        await logClient.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        await logClient.query(
          `INSERT INTO plat.webhook_delivery (
            id, tenant_id, endpoint_id, event_type, payload, signature,
            attempts, status, response_status, last_attempt_at
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, now())`,
          [
            deliveryId,
            tenantId,
            ep.id,
            eventType,
            JSON.stringify(payload),
            signature,
            attempts,
            status,
            responseStatus ?? null
          ]
        );
        await logClient.query("COMMIT");
      } finally {
        logClient.release();
      }

      results.push({
        deliveryId,
        endpointId: ep.id,
        status,
        responseStatus,
        attempts
      });
    }

    return results;
  }

  async listDeliveries(tenantId: string, endpointId?: string): Promise<WebhookDeliveryRecord[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const query = endpointId
        ? "SELECT * FROM plat.webhook_delivery WHERE endpoint_id = $1 ORDER BY created_at DESC LIMIT 50"
        : "SELECT * FROM plat.webhook_delivery ORDER BY created_at DESC LIMIT 50";
      const params = endpointId ? [endpointId] : [];
      const res = await client.query<WebhookDeliveryRecord>(query, params);
      await client.query("COMMIT");
      return res.rows;
    } finally {
      client.release();
    }
  }
}
