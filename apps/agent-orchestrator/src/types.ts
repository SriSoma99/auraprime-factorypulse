// Types for Agent Workflow Orchestrator (APP-09 / DU-06 / AGT-1..8).

import type {
  AlertEnvelope,
  FailureModeHypothesis,
  LineImpactAssessment,
  TrustAssessment,
} from "@fp/intel-core";
import type { RetrievedChunk } from "@fp/knowledge-svc";

export type IncidentState =
  | "open"
  | "abstained"
  | "awaiting_approval"
  | "in_progress"
  | "resolved";

export interface IncidentWorkflowState {
  incident_id: string;
  tenant_id: string;
  trace_id: string;
  opened_at: string;
  alert: AlertEnvelope;
  state: IncidentState;

  // Telemetry Trust (APP-05)
  trust?: TrustAssessment;

  // Line Impact Prioritisation (APP-06)
  impact?: LineImpactAssessment;

  // Causal Hypotheses (APP-08)
  hypotheses: FailureModeHypothesis[];

  // Knowledge Evidence (APP-07)
  retrieved_chunks: RetrievedChunk[];
  citation_ids: string[];
  citation_blocked: boolean;

  // Discriminate or Abstain (AGT-3 / RAG-7)
  abstained: boolean;
  abstention_reason?: string;
  proposed_check?: string;
  what_would_change: string[];

  // Draft Work Order (Invariant 2: human-only approval)
  work_order_draft?: {
    id: string;
    title: string;
    type: string;
    steps: string[];
    is_draft: boolean;
  };

  // Policy Gate (Invariant 2 / Invariant 4)
  policy_approval?: {
    id: string;
    tier: number;
    required_role: string;
    rationale: string;
    status: "pending";
  };

  // Audit event chain references (Invariant 3)
  audit_event_ids: string[];

  // Narrative outputs
  summary_text: string;
  template_summary: string;
}
