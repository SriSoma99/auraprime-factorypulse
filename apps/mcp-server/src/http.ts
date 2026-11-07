// Streamable HTTP endpoint for the MCP server (APP-15, DU-12). Stateless: one SDK server and transport per request.
// The bearer token is resolved through plat.resolve_principal, the same identity path as the API and OTLP ingest.
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Pool } from "pg";
import type { Config } from "@fp/config";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { FactoryPulseMcpServer } from "./server.ts";
import { buildMcpServer } from "./sdk.ts";

const VERSION = "0.1.0";

function problem(res: ServerResponse, status: number, title: string): void {
  res.writeHead(status, { "content-type": "application/problem+json" }).end(JSON.stringify({ type: "about:blank", title, status }));
}

async function authenticate(pool: Pool, req: IncomingMessage): Promise<AuthInfo | null> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) return null;
  const r = await pool.query<{ id: string; tenant_id: string; role: string; session_type: string }>(
    "SELECT id, tenant_id, role, session_type FROM plat.resolve_principal($1)", [createHash("sha256").update(token).digest("hex")]);
  const p = r.rows[0];
  if (!p) return null;
  const traceparent = typeof req.headers.traceparent === "string" ? req.headers.traceparent : undefined;
  return { token, clientId: p.id, scopes: [], extra: { principalId: p.id, tenantId: p.tenant_id, role: p.role, sessionType: p.session_type, traceparent } };
}

async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
}

export function createMcpHttpServer(cfg: Config, pool: Pool): Server {
  const core = new FactoryPulseMcpServer(pool);
  return createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname !== cfg.mcp.path) return problem(res, 404, "Not found");
      // Stateless mode serves only POST; GET (server-initiated stream) and DELETE (session end) do not apply.
      if (req.method !== "POST") return problem(res, 405, "Method not allowed");
      const auth = await authenticate(pool, req);
      if (!auth) return problem(res, 401, "Bearer token required");
      let body: unknown;
      try { body = await readJson(req, cfg.mcp.max_body_bytes); } catch (err) {
        return problem(res, (err as { status?: number }).status === 413 ? 413 : 400, "Invalid request body");
      }
      const server = buildMcpServer(core, VERSION);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(Object.assign(req, { auth }), res, body);
    })().catch(err => {
      console.error(`[mcp-server] request failed: ${(err as Error).name}`);
      if (!res.headersSent) problem(res, 500, "Internal error");
    });
  });
}
