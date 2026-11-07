// MCP server daemon (APP-15 / DU-12 / WP-8): MCP over streamable HTTP on the official SDK. Host, port and path come from config mcp.*.
import { config, appPool } from "@fp/db";
import { createMcpHttpServer } from "./http.ts";

const cfg = config();
const pool = appPool(cfg);
const server = createMcpHttpServer(cfg, pool);
server.listen(cfg.mcp.port, cfg.mcp.host, () => {
  console.log(`[mcp-server] listening on http://${cfg.mcp.host}:${cfg.mcp.port}${cfg.mcp.path}`);
});

const shutdown = () => server.close(() => void pool.end().then(() => process.exit(0)));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
