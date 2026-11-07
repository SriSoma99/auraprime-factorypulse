import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import type { CallerContext, ToolGrantRecord, ToolKillSwitchRecord } from "./types.ts";

export class ToolAuthorizationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ToolAuthorizationError";
  }
}

export class ToolSecurityPolicy {
  // Hard-coded prohibited actuation patterns (Advisory Invariant 1)
  private static readonly PROHIBITED_ACTUATION_PATTERNS = [
    /plc/i,
    /override/i,
    /actuate/i,
    /control_valve/i,
    /set_speed/i,
    /emergency_stop_override/i
  ];

  constructor(private readonly pool: Pool) {}

  async authorizeToolCall(ctx: CallerContext, toolName: string): Promise<{ auditMode: string }> {
    // 1. Invariant 1: Hard-block actuation / machine control at schema level
    for (const pattern of ToolSecurityPolicy.PROHIBITED_ACTUATION_PATTERNS) {
      if (pattern.test(toolName)) {
        throw new ToolAuthorizationError(
          "FORBIDDEN_ACTUATION",
          `Tool '${toolName}' rejected: Advisory Invariant 1 strictly prohibits outbound equipment actuation or PLC control`
        );
      }
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenantId]);

      // 2. MCP-5: Check emergency kill switch
      const ksRes = await client.query<ToolKillSwitchRecord>(
        "SELECT * FROM gov.tool_kill_switch WHERE tool_name = $1",
        [toolName]
      );
      if (ksRes.rows[0]?.is_killed) {
        throw new ToolAuthorizationError(
          "KILL_SWITCH_ACTIVE",
          `Tool '${toolName}' is disabled by emergency kill switch: ${ksRes.rows[0].reason ?? "manual kill"}`
        );
      }

      // 3. MCP-4: Default-deny per-call ToolGrant RBAC matrix
      // Check explicit grants for caller principal or caller role
      const grantRes = await client.query<ToolGrantRecord>(
        `SELECT * FROM gov.tool_grant
         WHERE tool_name = $1
           AND (principal_id = $2 OR principal_id = $3 OR principal_id = '*')
         ORDER BY (CASE WHEN principal_id = $2 THEN 1 WHEN principal_id = $3 THEN 2 ELSE 3 END)
         LIMIT 1`,
        [toolName, ctx.principalId, ctx.role]
      );

      const grant = grantRes.rows[0];
      if (!grant || grant.grant_type === "deny") {
        throw new ToolAuthorizationError(
          "ACCESS_DENIED",
          `Access to tool '${toolName}' denied for principal '${ctx.principalId}' (role: ${ctx.role}): default-deny`
        );
      }

      if (grant.expires_at && new Date(grant.expires_at).getTime() < Date.now()) {
        throw new ToolAuthorizationError(
          "GRANT_EXPIRED",
          `Tool grant for '${toolName}' expired at ${grant.expires_at}`
        );
      }

      await client.query("COMMIT");
      return { auditMode: grant.audit_mode };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async setKillSwitch(
    tenantId: string,
    toolName: string,
    isKilled: boolean,
    killedBy: string,
    reason?: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await client.query(
        `INSERT INTO gov.tool_kill_switch (tenant_id, tool_name, is_killed, killed_by, reason, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (tenant_id, tool_name)
         DO UPDATE SET is_killed = $3, killed_by = $4, reason = $5, updated_at = now()`,
        [tenantId, toolName, isKilled, killedBy, reason ?? null]
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  }

  async grantTool(
    tenantId: string,
    principalId: string,
    toolName: string,
    grantType: "allow" | "deny" = "allow",
    auditMode = "full_hash_chained",
    expiresInDays?: number
  ): Promise<ToolGrantRecord> {
    const grantId = `tg_${randomBytes(8).toString("hex")}`;
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86400 * 1000).toISOString()
      : null;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const res = await client.query<ToolGrantRecord>(
        `INSERT INTO gov.tool_grant (
          id, tenant_id, principal_id, tool_name, grant_type, audit_mode, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [grantId, tenantId, principalId, toolName, grantType, auditMode, expiresAt]
      );
      await client.query("COMMIT");
      return res.rows[0]!;
    } finally {
      client.release();
    }
  }
}
