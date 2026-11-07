// MCP protocol layer for APP-15 (DU-12) on the official MCP TypeScript SDK. The governed core (FactoryPulseMcpServer) still
// authorises every call: default-deny grants (MCP-4), kill switch (MCP-5), the actuation block (invariant 1) and per-call audit (MCP-6).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { z } from "zod";
import { ToolAuthorizationError } from "./grants.ts";
import type { FactoryPulseMcpServer } from "./server.ts";
import type { CallerContext, ToolExecutionResult } from "./types.ts";

/** One table for every tool: the SDK registers it and FactoryPulseMcpServer.listTools reads it, so they cannot drift. */
export const TOOL_SPECS = [
  { name: "get_alerts", title: "Alerts", description: "List recent operational alerts filtered by status or line", readOnly: true,
    input: { status: z.enum(["open", "all"]).optional(), lineId: z.string().optional() } },
  { name: "get_line_impact", title: "Line impact", description: "Get predicted production line starvation impact and buffer minutes", readOnly: true,
    input: { lineId: z.string().optional() } },
  { name: "explain_alert", title: "Explain alert", description: "Retrieve AI-labelled causal explanation with cited technical manual references", readOnly: true,
    input: { alertId: z.string().min(1) } },
  { name: "search_knowledge", title: "Search knowledge", description: "Perform semantic hybrid search across OEM manuals and maintenance guides", readOnly: true,
    input: { query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() } },
  { name: "get_incident_timeline", title: "Incident timeline", description: "Retrieve chronological sequence of events and actions for an incident", readOnly: true,
    input: { incidentId: z.string().min(1) } },
  { name: "get_health", title: "Platform health", description: "Get platform health, data freshness, and active fallback degradation level", readOnly: true,
    input: {} },
  { name: "draft_work_order", title: "Draft work order",
    description: "Draft an inspection work order awaiting human approval (strictly draft-only; cannot approve or actuate)", readOnly: false,
    input: { incidentId: z.string().min(1), title: z.string().min(1), assetId: z.string().min(1), steps: z.array(z.unknown()) } },
] as const;

/** MCP result from the core result; the AI label and cited versions travel in _meta so clients can show them. */
function toCallToolResult(r: ToolExecutionResult): CallToolResult {
  const meta: Record<string, unknown> = {};
  if (r.isAiLabelled !== undefined) meta.isAiLabelled = r.isAiLabelled;
  if (r.citedDocumentVersions) meta.citedDocumentVersions = r.citedDocumentVersions;
  if (r.auditEventId) meta.auditEventId = r.auditEventId;
  return { content: r.content, ...(r.isError ? { isError: true } : {}), ...(Object.keys(meta).length ? { _meta: meta } : {}) };
}

/** Caller identity comes only from the authenticated transport, never from tool arguments (03 section 15.1, tenancy rule). */
export type CallerResolver = (authExtra: Record<string, unknown> | undefined) => CallerContext;

export function callerFromAuth(authExtra: Record<string, unknown> | undefined): CallerContext {
  const principalId = authExtra?.principalId; const tenantId = authExtra?.tenantId; const role = authExtra?.role;
  if (typeof principalId !== "string" || typeof tenantId !== "string" || typeof role !== "string") {
    throw new ToolAuthorizationError("UNAUTHENTICATED", "The MCP request carries no authenticated caller");
  }
  const traceparent = typeof authExtra?.traceparent === "string" ? authExtra.traceparent : undefined;
  return { principalId, tenantId, role, ...(traceparent ? { traceparent } : {}) };
}

export function buildMcpServer(core: FactoryPulseMcpServer, version: string, resolveCaller: CallerResolver = callerFromAuth): McpServer {
  const server = new McpServer({ name: "auraprime-factorypulse", version });

  for (const spec of TOOL_SPECS) {
    server.registerTool(spec.name, {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.input as z.ZodRawShape,
      // Every tool is read-only except the draft, and nothing reaches equipment (invariant 1).
      annotations: { readOnlyHint: spec.readOnly, destructiveHint: false, idempotentHint: spec.readOnly, openWorldHint: false },
    }, async (args: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>): Promise<CallToolResult> => {
      try {
        const ctx = resolveCaller(extra.authInfo?.extra);
        return toCallToolResult(await core.executeTool(ctx, spec.name, args));
      } catch (err) {
        // A refusal is a tool result the client can show, not a protocol failure; the message carries no secrets.
        if (err instanceof ToolAuthorizationError) return { content: [{ type: "text" as const, text: `${err.code}: ${err.message}` }], isError: true };
        throw err;
      }
    });
  }

  for (const r of core.listResources()) {
    server.registerResource(r.name, r.uri, { title: r.name, description: r.description, mimeType: r.mimeType }, async (uri, extra) => {
      const ctx = resolveCaller(extra.authInfo?.extra);
      return { contents: [{ uri: uri.href, mimeType: r.mimeType, text: await core.readResource(ctx, uri.href) }] };
    });
  }
  return server;
}
