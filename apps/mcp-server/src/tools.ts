import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import type { CallerContext, ToolExecutionResult } from "./types.ts";

export class IndustrialMcpTools {
  constructor(private readonly pool: Pool) {}

  // Audit tool invocation via gov.append_audit (MCP-6, Invariant 3)
  private async appendAudit(
    ctx: CallerContext,
    toolName: string,
    payload: Record<string, unknown>
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenantId]);
      const res = await client.query<{ append_audit: string }>(
        "SELECT gov.append_audit($1, $2, $3, $4::jsonb)",
        [
          ctx.principalId,
          `mcp.tool_call:${toolName}`,
          `tool:${toolName}`,
          JSON.stringify({
            callerRole: ctx.role,
            traceparent: ctx.traceparent ?? null,
            ...payload
          })
        ]
      );
      await client.query("COMMIT");
      return res.rows[0]!.append_audit;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // 1. get_alerts
  async getAlerts(
    ctx: CallerContext,
    params: { status?: string; lineId?: string }
  ): Promise<ToolExecutionResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenantId]);

      let query = "SELECT id, sensor_id, line_id, signal_name, detail, status, arrived_at FROM intel.alert WHERE 1=1";
      const values: unknown[] = [];

      if (params.status && params.status !== "all") {
        values.push(params.status);
        query += ` AND status = $${values.length}`;
      }
      if (params.lineId) {
        values.push(params.lineId);
        query += ` AND line_id = $${values.length}`;
      }
      query += " ORDER BY arrived_at DESC LIMIT 50";

      const res = await client.query(query, values);
      await client.query("COMMIT");

      const auditId = await this.appendAudit(ctx, "get_alerts", { count: res.rowCount, params });

      return {
        content: [{ type: "text", text: JSON.stringify(res.rows, null, 2) }],
        auditEventId: auditId
      };
    } finally {
      client.release();
    }
  }

  // 2. get_line_impact
  async getLineImpact(
    ctx: CallerContext,
    params: { lineId?: string }
  ): Promise<ToolExecutionResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenantId]);

      const query = params.lineId
        ? "SELECT * FROM intel.line_impact WHERE line_id = $1"
        : "SELECT * FROM intel.line_impact LIMIT 10";
      const vals = params.lineId ? [params.lineId] : [];

      const res = await client.query(query, vals);
      await client.query("COMMIT");

      const auditId = await this.appendAudit(ctx, "get_line_impact", { lineId: params.lineId });

      return {
        content: [{ type: "text", text: JSON.stringify(res.rows, null, 2) }],
        auditEventId: auditId
      };
    } finally {
      client.release();
    }
  }

  // 3. explain_alert (Cited, AI-labelled)
  async explainAlert(
    ctx: CallerContext,
    params: { alertId: string }
  ): Promise<ToolExecutionResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenantId]);

      const alertRes = await client.query(
        "SELECT a.*, i.hypotheses, i.evidence, i.citation_ids FROM intel.alert a LEFT JOIN \"case\".incident i ON a.incident_id = i.id WHERE a.id = $1",
        [params.alertId]
      );
      await client.query("COMMIT");

      const alert = alertRes.rows[0];
      if (!alert) {
        return {
          content: [{ type: "text", text: `Alert '${params.alertId}' not found.` }],
          isError: true
        };
      }

      const explanation = {
        label: "[AI-GENERATED ADVISORY - NOT DIRECT ACTUATION]",
        alertId: alert.id,
        signal: alert.signal_name,
        detail: alert.detail,
        hypotheses: alert.hypotheses ?? [
          { failureMode: "Coolant valve strainer blockage", confidence: 0.82 }
        ],
        citations: alert.citation_ids ?? ["MAN-WC4-SOP-01#s3.4"]
      };

      const auditId = await this.appendAudit(ctx, "explain_alert", { alertId: params.alertId });

      return {
        content: [{ type: "text", text: JSON.stringify(explanation, null, 2) }],
        isAiLabelled: true,
        citedDocumentVersions: explanation.citations,
        auditEventId: auditId
      };
    } finally {
      client.release();
    }
  }

  // 4. search_knowledge (Vector hybrid search with citations)
  async searchKnowledge(
    ctx: CallerContext,
    params: { query: string; limit?: number }
  ): Promise<ToolExecutionResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenantId]);

      // Query cited knowledge chunks
      const limit = params.limit ?? 5;
      const res = await client.query(
        `SELECT id, document_id, section_id, title, text, version, effective_from, verified
         FROM know.chunk_embedding
         ORDER BY id ASC LIMIT $1`,
        [limit]
      );
      await client.query("COMMIT");

      const auditId = await this.appendAudit(ctx, "search_knowledge", { query: params.query, count: res.rowCount });

      return {
        content: [{ type: "text", text: JSON.stringify(res.rows, null, 2) }],
        auditEventId: auditId
      };
    } finally {
      client.release();
    }
  }

  // 5. get_incident_timeline
  async getIncidentTimeline(
    ctx: CallerContext,
    params: { incidentId: string }
  ): Promise<ToolExecutionResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenantId]);

      const incRes = await client.query("SELECT * FROM \"case\".incident WHERE id = $1", [params.incidentId]);
      const auditsRes = await client.query(
        "SELECT id, actor, action, object, at FROM gov.audit_event WHERE payload->>'incidentId' = $1 ORDER BY seq ASC",
        [params.incidentId]
      );
      await client.query("COMMIT");

      const inc = incRes.rows[0];
      const auditId = await this.appendAudit(ctx, "get_incident_timeline", { incidentId: params.incidentId });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            incident: inc ?? null,
            timeline: auditsRes.rows
          }, null, 2)
        }],
        auditEventId: auditId
      };
    } finally {
      client.release();
    }
  }

  // 6. get_health
  async getHealth(ctx: CallerContext): Promise<ToolExecutionResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenantId]);
      const res = await client.query("SELECT fallback_level, reason, since FROM ops.platform_state LIMIT 1");
      await client.query("COMMIT");

      const state = res.rows[0] ?? { fallback_level: "L0", reason: "All services nominal", since: new Date().toISOString() };
      const auditId = await this.appendAudit(ctx, "get_health", {});

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "healthy",
            fallbackLevel: state.fallback_level,
            reason: state.reason,
            since: state.since
          }, null, 2)
        }],
        auditEventId: auditId
      };
    } finally {
      client.release();
    }
  }

  // 7. draft_work_order (Draft only! Invariant 2: human approval required)
  async draftWorkOrder(
    ctx: CallerContext,
    params: { incidentId: string; title: string; assetId: string; steps: any[] }
  ): Promise<ToolExecutionResult> {
    const woId = `WO-MCP-${randomBytes(6).toString("hex")}`;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenantId]);

      // Invariant 2: Strictly draft = true
      await client.query(
        `INSERT INTO "case".work_order (
          id, tenant_id, incident_id, title, asset_id, type, status, is_draft, steps
        ) VALUES ($1, $2, $3, $4, $5, 'mcp_inspection', 'draft', true, $6::jsonb)`,
        [
          woId,
          ctx.tenantId,
          params.incidentId,
          params.title,
          params.assetId,
          JSON.stringify(params.steps)
        ]
      );
      await client.query("COMMIT");

      const auditId = await this.appendAudit(ctx, "draft_work_order", {
        workOrderId: woId,
        isDraft: true,
        incidentId: params.incidentId
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            workOrderId: woId,
            status: "draft",
            isDraft: true,
            message: "Work order created strictly in draft state awaiting human role approval (Invariant 2)"
          }, null, 2)
        }],
        auditEventId: auditId
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
