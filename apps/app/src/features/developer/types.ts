// Types for W11 API & Governed MCP Console (02 section 6.1; API-1 to API-6, MCP-1 to MCP-9).

export interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimitPerMin: number;
  monthlyQuota: number;
  usedRequests: number;
  status: "active" | "revoked";
  createdAt: string;
}

export interface McpToolItem {
  name: string;
  description: string;
  readOnly: boolean;
  invocationsCount: number;
  killSwitchActive: boolean;
  rolesAllowed: string[];
}

export interface WebhookItem {
  id: string;
  url: string;
  event: string;
  lastStatus: number;
  lastDeliveryAt: string;
}

export type DeveloperScreenState = "loading" | "error" | "normal";
