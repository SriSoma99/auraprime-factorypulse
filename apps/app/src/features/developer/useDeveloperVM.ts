// ViewModel for W11 API & Governed MCP Console (ADR-028; API-1..6, MCP-1..9).
import { useState } from "react";
import { deriveDeveloperState, deriveQuotaPercent } from "./derive";
import type { ApiKeyItem, McpToolItem, WebhookItem } from "./types";

export function useDeveloperVM() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([
    {
      id: "key-001",
      name: "Line 1 Edge Telemetry Collector",
      prefix: "fp_live_edg1",
      scopes: ["telemetry:write", "alerts:read"],
      rateLimitPerMin: 1200,
      monthlyQuota: 100000,
      usedRequests: 24500,
      status: "active",
      createdAt: "2026-09-01",
    },
    {
      id: "key-002",
      name: "External ERP / CMMS Connector",
      prefix: "fp_live_erp9",
      scopes: ["work_orders:read", "approvals:read"],
      rateLimitPerMin: 300,
      monthlyQuota: 25000,
      usedRequests: 3200,
      status: "active",
      createdAt: "2026-09-15",
    },
  ]);

  const [tools, setTools] = useState<McpToolItem[]>([
    { name: "get_alerts", description: "Fetch ranked active alerts across lines", readOnly: true, invocationsCount: 840, killSwitchActive: false, rolesAllowed: ["operator", "technician", "engineer"] },
    { name: "get_line_impact", description: "Query line impact ranking and bottleneck status", readOnly: true, invocationsCount: 520, killSwitchActive: false, rolesAllowed: ["operator", "technician", "engineer"] },
    { name: "get_sensor_trust", description: "Read multi-sensor trust scores and sensor-vs-machine status", readOnly: true, invocationsCount: 310, killSwitchActive: false, rolesAllowed: ["technician", "engineer"] },
    { name: "explain_incident", description: "Retrieve causal DAG diagnosis with verified citations", readOnly: true, invocationsCount: 195, killSwitchActive: false, rolesAllowed: ["engineer", "shift_lead"] },
    { name: "search_knowledge", description: "Semantic hybrid search over approved equipment manuals", readOnly: true, invocationsCount: 410, killSwitchActive: false, rolesAllowed: ["technician", "engineer"] },
    { name: "draft_work_order", description: "Generate a draft-only inspection work order (no actuation)", readOnly: false, invocationsCount: 28, killSwitchActive: false, rolesAllowed: ["technician", "engineer"] },
    { name: "get_health", description: "Query platform service health and degradation level", readOnly: true, invocationsCount: 1420, killSwitchActive: false, rolesAllowed: ["operator", "technician", "engineer", "admin"] },
  ]);

  const webhooks: WebhookItem[] = [
    { id: "wh-01", url: "https://plant-gateway.example/hooks/alerts", event: "alert.created", lastStatus: 200, lastDeliveryAt: "2 min ago" },
    { id: "wh-02", url: "https://cmms.example/api/v1/work-orders", event: "approval.decided", lastStatus: 200, lastDeliveryAt: "15 min ago" },
  ];

  const toggleKillSwitch = (toolName: string) => {
    setTools(ts => ts.map(t => t.name === toolName ? { ...t, killSwitchActive: !t.killSwitchActive } : t));
  };

  const state = deriveDeveloperState(false, false);

  return {
    state,
    keys,
    tools,
    webhooks,
    toggleKillSwitch,
    deriveQuotaPercent,
  };
}
