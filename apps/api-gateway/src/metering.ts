import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import type { UsageEventRecord } from "./types.ts";

export class MeteringService {
  constructor(private readonly pool: Pool) {}

  async recordUsage(
    tenantId: string,
    meter: string,
    quantity = 1,
    traceId?: string,
    apiKeyId?: string,
    projectId?: string
  ): Promise<UsageEventRecord> {
    const eventId = `use_${randomBytes(8).toString("hex")}`;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      const res = await client.query<UsageEventRecord>(
        `INSERT INTO plat.usage_event (id, tenant_id, project_id, meter, quantity, trace_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [eventId, tenantId, projectId ?? null, meter, quantity, traceId ?? null]
      );

      if (apiKeyId) {
        await client.query(
          `UPDATE plat.api_key
           SET quota_used = quota_used + $1
           WHERE id = $2`,
          [quantity, apiKeyId]
        );
      }

      await client.query("COMMIT");
      return res.rows[0]!;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getUsageSummary(tenantId: string, meter?: string): Promise<{ meter: string; totalQuantity: number; eventCount: number }[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      const query = meter
        ? `SELECT meter, SUM(quantity)::int as "totalQuantity", COUNT(*)::int as "eventCount"
           FROM plat.usage_event
           WHERE meter = $1
           GROUP BY meter`
        : `SELECT meter, SUM(quantity)::int as "totalQuantity", COUNT(*)::int as "eventCount"
           FROM plat.usage_event
           GROUP BY meter`;

      const params = meter ? [meter] : [];
      const res = await client.query<{ meter: string; totalQuantity: number; eventCount: number }>(query, params);
      await client.query("COMMIT");
      return res.rows;
    } finally {
      client.release();
    }
  }
}
