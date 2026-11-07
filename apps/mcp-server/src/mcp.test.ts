import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config, appPool, adminPool, seed } from "@fp/db";
import { FactoryPulseMcpServer } from "./server.ts";
import { ToolAuthorizationError } from "./grants.ts";
import type { CallerContext } from "./types.ts";

describe("Model Context Protocol (MCP) Server (DU-12 / APP-15 / MCP-1..7, 9)", () => {
  let pool: ReturnType<typeof appPool>;
  let admPool: ReturnType<typeof adminPool>;
  let server: FactoryPulseMcpServer;

  const validCaller: CallerContext = {
    principalId: "p_maintenance_agent",
    tenantId: "t-demo",
    role: "reliability_engineer",
    traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
  };

  const unauthorizedCaller: CallerContext = {
    principalId: "p_untrusted_client",
    tenantId: "t-demo",
    role: "external_agent",
    traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b8-01"
  };

  beforeAll(async () => {
    const cfg = config();
    pool = appPool(cfg);
    admPool = adminPool(cfg);
    await seed(admPool, cfg);

    server = new FactoryPulseMcpServer(pool);

    // Seed tool grants for test roles
    const sec = server.getSecurityPolicy();
    await sec.grantTool("t-demo", "reliability_engineer", "get_alerts", "allow");
    await sec.grantTool("t-demo", "reliability_engineer", "get_line_impact", "allow");
    await sec.grantTool("t-demo", "reliability_engineer", "explain_alert", "allow");
    await sec.grantTool("t-demo", "reliability_engineer", "get_health", "allow");
    await sec.grantTool("t-demo", "reliability_engineer", "draft_work_order", "allow");
    await sec.grantTool("t-demo", "reliability_engineer", "search_knowledge", "allow");
  });

  afterAll(async () => {
    await pool.end();
    await admPool.end();
  });

  it("MCP-1: exposes governed industrial tools and read-only resources", async () => {
    const tools = server.listTools();
    expect(tools.length).toBe(7);
    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain("get_alerts");
    expect(toolNames).toContain("get_line_impact");
    expect(toolNames).toContain("explain_alert");
    expect(toolNames).toContain("draft_work_order");
    expect(toolNames).toContain("search_knowledge");

    const resources = server.listResources();
    expect(resources.length).toBe(2);
    expect(resources.map(r => r.uri)).toContain("auraprime-factorypulse://assets");
    expect(resources.map(r => r.uri)).toContain("auraprime-factorypulse://documents/approved");
  });

  it("MCP-4: enforces default-deny authorisation when no ToolGrant exists", async () => {
    await expect(
      server.executeTool(unauthorizedCaller, "get_alerts", {})
    ).rejects.toThrowError(ToolAuthorizationError);

    try {
      await server.executeTool(unauthorizedCaller, "get_alerts", {});
    } catch (err: any) {
      expect(err.code).toBe("ACCESS_DENIED");
      expect(err.message).toMatch(/default-deny/);
    }
  });

  it("MCP-5: activates emergency kill switch and immediately halts tool execution", async () => {
    const sec = server.getSecurityPolicy();

    // 1. Enable kill switch for get_line_impact
    await sec.setKillSwitch(
      "t-demo",
      "get_line_impact",
      true,
      "sec-admin",
      "Emergency maintenance lock on simulation cascade"
    );

    // 2. Verified caller is now rejected
    await expect(
      server.executeTool(validCaller, "get_line_impact", { lineId: "LINE-1" })
    ).rejects.toThrowError(ToolAuthorizationError);

    try {
      await server.executeTool(validCaller, "get_line_impact", { lineId: "LINE-1" });
    } catch (err: any) {
      expect(err.code).toBe("KILL_SWITCH_ACTIVE");
      expect(err.message).toMatch(/Emergency maintenance lock/);
    }

    // 3. Deactivate kill switch
    await sec.setKillSwitch("t-demo", "get_line_impact", false, "sec-admin", "Maintenance concluded");

    // 4. Call succeeds again
    const res = await server.executeTool(validCaller, "get_line_impact", {});
    expect(res.content).toBeDefined();
  });

  it("Invariant 1: hard-blocks any attempt to execute equipment control or actuation", async () => {
    const actuationAttempts = [
      "set_plc_override_speed",
      "actuate_motor_valve",
      "emergency_stop_override"
    ];

    for (const toolName of actuationAttempts) {
      await expect(
        server.executeTool(validCaller, toolName, {})
      ).rejects.toThrowError(ToolAuthorizationError);

      try {
        await server.executeTool(validCaller, toolName, {});
      } catch (err: any) {
        expect(err.code).toBe("FORBIDDEN_ACTUATION");
        expect(err.message).toMatch(/Advisory Invariant 1 strictly prohibits/);
      }
    }
  });

  it("Invariant 2: draft_work_order creates draft-only order and cannot execute or approve", async () => {
    const res = await server.executeTool(validCaller, "draft_work_order", {
      incidentId: "INC-0042",
      title: "Inspection of Coolant Strainer",
      assetId: "as-wc4-coolant",
      steps: [{ step: 1, action: "Inspect mesh for particle buildup" }]
    });

    expect(res.content[0]?.text).toBeDefined();
    const data = JSON.parse(res.content[0]!.text);
    expect(data.workOrderId).toMatch(/^WO-MCP-/);
    expect(data.isDraft).toBe(true);
    expect(data.status).toBe("draft");
    expect(res.auditEventId).toBeDefined();

    // Verify database record has is_draft = true
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");
      const woRes = await client.query<{ is_draft: boolean; status: string }>(
        "SELECT is_draft, status FROM \"case\".work_order WHERE id = $1",
        [data.workOrderId]
      );
      await client.query("COMMIT");
      expect(woRes.rows[0]?.is_draft).toBe(true);
      expect(woRes.rows[0]?.status).toBe("draft");
    } finally {
      client.release();
    }
  });

  it("MCP-6 & Invariant 3: appends every tool call to append-only audit ledger with traceparent", async () => {
    const toolRes = await server.executeTool(validCaller, "explain_alert", {
      alertId: "AL-1001"
    });

    expect(toolRes.auditEventId).toBeDefined();

    // Verify audit entry in PostgreSQL
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");
      const auditRes = await client.query<{
        actor: string;
        action: string;
        payload: any;
      }>(
        "SELECT actor, action, payload FROM gov.audit_event WHERE id = $1",
        [`t-demo:${toolRes.auditEventId}`]
      );
      await client.query("COMMIT");

      expect(auditRes.rows[0]).toBeDefined();
      expect(auditRes.rows[0]!.actor).toBe("p_maintenance_agent");
      expect(auditRes.rows[0]!.action).toBe("mcp.tool_call:explain_alert");
      expect(auditRes.rows[0]!.payload.traceparent).toBe(validCaller.traceparent);
    } finally {
      client.release();
    }
  });

  it("Resources: reads read-only asset registry and verified documents", async () => {
    const assetJson = await server.readResource(validCaller, "auraprime-factorypulse://assets");
    expect(assetJson).toBeDefined();
    const assets = JSON.parse(assetJson);
    expect(Array.isArray(assets)).toBe(true);

    const docJson = await server.readResource(validCaller, "auraprime-factorypulse://documents/approved");
    expect(docJson).toBeDefined();
    const docs = JSON.parse(docJson);
    expect(Array.isArray(docs)).toBe(true);
  });
});
