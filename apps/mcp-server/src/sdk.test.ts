// MCP protocol tests for APP-15 on the official SDK: a real MCP client over an in-memory link, then over streamable HTTP
// with the seeded bearer tokens (MCP-1, MCP-4, MCP-5, invariants 1 and 2). Tenant t-demo; grants are seeded below.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config, appPool, adminPool, seed } from "@fp/db";
import { principalToken } from "@fp/synthetic-data";
import { FactoryPulseMcpServer } from "./server.ts";
import { buildMcpServer, TOOL_SPECS } from "./sdk.ts";
import { createMcpHttpServer } from "./http.ts";
import type { CallerContext } from "./types.ts";

const cfg = config();
const pool = appPool(cfg);
const admin = adminPool(cfg);
const core = new FactoryPulseMcpServer(pool);
const engineer: CallerContext = { principalId: "u-reliability", tenantId: "t-demo", role: "reliability_engineer" };
const text = (r: unknown) => (((r as { content?: { text?: string }[] }).content) ?? []).map(c => c.text ?? "").join("");

async function linkedClient(caller: CallerContext): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await buildMcpServer(core, "test", () => caller).connect(serverSide);
  const client = new Client({ name: "test-client", version: "0" });
  await client.connect(clientSide);
  return client;
}

let http: Server; let endpoint = "";
beforeAll(async () => {
  await seed(admin, cfg);
  const sec = core.getSecurityPolicy();
  for (const tool of ["get_alerts", "get_health", "draft_work_order"]) await sec.grantTool("t-demo", "reliability_engineer", tool, "allow");
  http = createMcpHttpServer(cfg, pool);
  await new Promise<void>(ok => http.listen(0, "127.0.0.1", ok));
  endpoint = `http://127.0.0.1:${(http.address() as AddressInfo).port}${cfg.mcp.path}`;
});
afterAll(async () => {
  await new Promise<void>(ok => http.close(() => ok()));
  await pool.end(); await admin.end();
});

describe("MCP over the SDK (in-memory link)", () => {
  it("lists every tool with its schema, and marks only the draft tool as writing", async () => {
    const client = await linkedClient(engineer);
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name).sort()).toEqual(TOOL_SPECS.map(t => t.name).sort());
    const draft = tools.find(t => t.name === "draft_work_order")!;
    expect(draft.inputSchema.required).toEqual(expect.arrayContaining(["incidentId", "title", "assetId", "steps"]));
    expect(draft.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(tools.filter(t => t.annotations?.readOnlyHint === false).map(t => t.name)).toEqual(["draft_work_order"]);
    await client.close();
  });

  it("calls a granted tool through the governed core", async () => {
    const client = await linkedClient(engineer);
    const r = await client.callTool({ name: "get_health", arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain("fallbackLevel");
    await client.close();
  });

  it("refuses a tool without a grant as a tool error (default deny, MCP-4)", async () => {
    const client = await linkedClient(engineer);
    const r = await client.callTool({ name: "explain_alert", arguments: { alertId: "ALT-1" } });
    expect(r.isError).toBe(true);
    await client.close();
  });

  it("rejects arguments that break the schema before the tool runs", async () => {
    const client = await linkedClient(engineer);
    const r = await client.callTool({ name: "draft_work_order", arguments: { incidentId: "INC-0042" } });
    expect(r.isError).toBe(true);
    await client.close();
  });

  it("offers no tool that can approve or actuate (invariants 1 and 2)", async () => {
    const client = await linkedClient(engineer);
    const names = (await client.listTools()).tools.map(t => t.name).join(" ");
    expect(names).not.toMatch(/approve|actuate|plc|override|set_speed/i);
    await client.close();
  });

  it("serves the read-only resources", async () => {
    const client = await linkedClient(engineer);
    const { resources } = await client.listResources();
    expect(resources.map(r => r.uri)).toContain("auraprime-factorypulse://assets");
    const read = await client.readResource({ uri: "auraprime-factorypulse://assets" });
    expect(JSON.parse(String((read.contents[0] as { text: string }).text)).length).toBeGreaterThan(0);
    await client.close();
  });
});

describe("MCP over streamable HTTP", () => {
  const post = (headers: Record<string, string> = {}) => fetch(endpoint, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });

  it("refuses a request without a bearer token, or with an unknown one", async () => {
    expect((await post()).status).toBe(401);
    expect((await post({ authorization: "Bearer not-a-real-token" })).status).toBe(401);
  });

  it("takes the caller from the token: a seeded engineer can call a granted tool", async () => {
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { authorization: `Bearer ${principalToken(cfg.synthetic.seed, "u-reliability")}` } },
    });
    const client = new Client({ name: "http-test", version: "0" });
    await client.connect(transport);
    const r = await client.callTool({ name: "get_alerts", arguments: { status: "open" } });
    expect(r.isError).toBeFalsy();
    await client.close();
  });

  it("applies the grants of the token's own role: an operator without grants is refused", async () => {
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { authorization: `Bearer ${principalToken(cfg.synthetic.seed, "u-operator")}` } },
    });
    const client = new Client({ name: "http-test", version: "0" });
    await client.connect(transport);
    expect((await client.callTool({ name: "get_alerts", arguments: {} })).isError).toBe(true);
    await client.close();
  });
});
