import type { Pool } from "pg";
import { ToolSecurityPolicy, ToolAuthorizationError } from "./grants.ts";
import { IndustrialMcpTools } from "./tools.ts";
import { IndustrialMcpResources } from "./resources.ts";
import type { CallerContext, ToolExecutionResult } from "./types.ts";
import { TOOL_SPECS } from "./sdk.ts";

export class FactoryPulseMcpServer {
  private readonly security: ToolSecurityPolicy;
  private readonly tools: IndustrialMcpTools;
  private readonly resources: IndustrialMcpResources;

  constructor(private readonly pool: Pool) {
    this.security = new ToolSecurityPolicy(pool);
    this.tools = new IndustrialMcpTools(pool);
    this.resources = new IndustrialMcpResources(pool);
  }

  getSecurityPolicy(): ToolSecurityPolicy {
    return this.security;
  }

  /** Tool names and descriptions; the schemas live in TOOL_SPECS and are served by the MCP SDK (sdk.ts). */
  listTools() {
    return TOOL_SPECS.map(t => ({ name: t.name, title: t.title, description: t.description, readOnly: t.readOnly }));
  }

  listResources() {
    return this.resources.listResources();
  }

  async readResource(ctx: CallerContext, uri: string): Promise<string> {
    return await this.resources.readResource(ctx, uri);
  }

  async executeTool(
    ctx: CallerContext,
    toolName: string,
    args: Record<string, any> = {}
  ): Promise<ToolExecutionResult> {
    // 1. Authorize tool execution via policy (MCP-4, MCP-5, Invariant 1)
    await this.security.authorizeToolCall(ctx, toolName);

    // 2. Dispatch to designated tool implementation
    switch (toolName) {
      case "get_alerts":
        return await this.tools.getAlerts(ctx, args);
      case "get_line_impact":
        return await this.tools.getLineImpact(ctx, args);
      case "explain_alert":
        return await this.tools.explainAlert(ctx, { alertId: String(args.alertId ?? "") });
      case "search_knowledge":
        return await this.tools.searchKnowledge(ctx, { query: String(args.query ?? ""), limit: args.limit });
      case "get_incident_timeline":
        return await this.tools.getIncidentTimeline(ctx, { incidentId: String(args.incidentId ?? "") });
      case "get_health":
        return await this.tools.getHealth(ctx);
      case "draft_work_order":
        return await this.tools.draftWorkOrder(ctx, {
          incidentId: String(args.incidentId ?? ""),
          title: String(args.title ?? ""),
          assetId: String(args.assetId ?? ""),
          steps: Array.isArray(args.steps) ? args.steps : []
        });
      default:
        throw new ToolAuthorizationError("UNKNOWN_TOOL", `Unknown tool name: ${toolName}`);
    }
  }
}
