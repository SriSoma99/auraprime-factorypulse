// Governance Service Types (DU-08 / APP-10 Policy Engine, APP-20 Audit & Governance).

export type PolicyTier = 1 | 2;

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  tier: PolicyTier;
  required_role: "maintenance_lead" | "plant_manager";
  evaluator: (context: ActionPolicyContext) => boolean;
}

export interface ActionPolicyContext {
  action_type: "sensor_recalibration" | "inspection" | "cleaning_adjustment" | "component_replacement" | "process_halt";
  asset_id: string;
  estimated_downtime_minutes: number;
  buffer_starvation_risk: boolean;
  cost_estimate_usd?: number;
}

export interface PolicyDecision {
  tier: PolicyTier;
  required_role: "maintenance_lead" | "plant_manager";
  rationale: string;
  rule_ids: string[];
  policy_version: string;
}

export interface ApprovalDecisionRequest {
  approval_id: string;
  tenant_id: string;
  decided_by: string;
  actor_role: string;
  session_type: "human" | "api_key" | "agent_token";
  decision: "approved" | "rejected";
  reason?: string;
}

export interface ApprovalDecisionResult {
  approval_id: string;
  work_order_id: string;
  status: "approved" | "rejected";
  decided_by: string;
  decided_at: string;
  audit_event_id: string;
}

export interface AuditVerificationReport {
  valid: boolean;
  verified_count: number;
  broken_seq?: number;
  expected_hash?: string;
  actual_hash?: string;
}

export interface EvidencePack {
  tenant_id: string;
  incident_id: string;
  generated_at: string;
  incident: Record<string, unknown>;
  work_orders: Array<Record<string, unknown>>;
  approvals: Array<Record<string, unknown>>;
  audit_chain: Array<Record<string, unknown>>;
  verification: AuditVerificationReport;
}
