export interface ToolGrantRecord {
  id: string;
  tenant_id: string;
  principal_id: string;
  tool_name: string;
  grant_type: "allow" | "deny";
  audit_mode: string;
  expires_at: string | null;
  created_at: string;
}

export interface ToolKillSwitchRecord {
  tenant_id: string;
  tool_name: string;
  is_killed: boolean;
  killed_by: string | null;
  reason: string | null;
  updated_at: string;
}

export interface CallerContext {
  principalId: string;
  tenantId: string;
  role: string;
  traceparent?: string;
}

export interface ToolExecutionResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  isAiLabelled?: boolean;
  citedDocumentVersions?: string[];
  auditEventId?: string;
}
