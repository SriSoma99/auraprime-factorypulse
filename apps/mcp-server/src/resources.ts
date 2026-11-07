import type { Pool } from "pg";
import type { CallerContext } from "./types.ts";

export interface McpResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export class IndustrialMcpResources {
  constructor(private readonly pool: Pool) {}

  listResources(): McpResource[] {
    return [
      {
        uri: "auraprime-factorypulse://assets",
        name: "Equipment Asset Registry",
        description: "List of plant assets, production lines, and monitoring stations",
        mimeType: "application/json"
      },
      {
        uri: "auraprime-factorypulse://documents/approved",
        name: "Approved Document Registry",
        description: "Approved equipment manuals, SOPs, and technical specifications",
        mimeType: "application/json"
      }
    ];
  }

  async readResource(ctx: CallerContext, uri: string): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenantId]);

      if (uri === "auraprime-factorypulse://assets") {
        const res = await client.query(
          `SELECT a.id, a.name as asset_name, s.name as station_name, l.name as line_name
           FROM ref.asset a
           JOIN ref.station s ON a.station_id = s.id
           JOIN ref.line l ON s.line_id = l.id
           ORDER BY a.id ASC`
        );
        await client.query("COMMIT");
        return JSON.stringify(res.rows, null, 2);
      }

      if (uri === "auraprime-factorypulse://documents/approved") {
        const res = await client.query(
          "SELECT id, title, section, version, effective_from, verified FROM know.citation WHERE verified = true ORDER BY id ASC"
        );
        await client.query("COMMIT");
        return JSON.stringify(res.rows, null, 2);
      }

      throw new Error(`Unknown resource URI: ${uri}`);
    } finally {
      client.release();
    }
  }
}
