// Case Service Types (DU-07 / APP-11 Work Order, APP-12 Learning & Verification, ADR-031).

export interface TechnicianOutcome {
  id: string;
  tenant_id: string;
  incident_id: string;
  technician_id: string;
  finding: string;
  readings: Record<string, number>;
  action_taken: string;
  verified: boolean;
  good_cycle_count: number;
  created_at: string;
}

export interface VerificationCycleResult {
  incident_id: string;
  cycle_number: number;
  drift_detected: boolean;
  status: "in_verification" | "verified_closed" | "reopened";
  consecutive_good_cycles: number;
  message: string;
}

export interface CaseRecord {
  id: string;
  tenant_id: string;
  incident_id: string;
  asset_id: string;
  asset_class: string;
  signal_pattern: Record<string, unknown>;
  trust_verdicts: Record<string, unknown>;
  hypotheses: Array<Record<string, unknown>>;
  discriminating_check?: Record<string, unknown>;
  confirmed_failure_mode: string;
  action_taken: string;
  outcome: Record<string, unknown>;
  verified_at: string;
  similarity?: number;
}

export interface LessonDraft {
  id: string;
  tenant_id: string;
  case_id: string;
  text: string;
  status: "draft" | "approved" | "rejected";
  is_ai_generated: boolean;
  drafted_by_model: string;
  decided_by?: string;
  decided_at?: string;
  decision_reason?: string;
  audit_event_id?: string;
}

export interface BenchmarkMetrics {
  detection_lead_time_hours: number;
  false_alarm_rate: number;
  rca_top1_accuracy: number;
  rca_top3_accuracy: number;
  citation_coverage: number;
}

export interface LearningBatch {
  id: string;
  tenant_id: string;
  status: "staged" | "active" | "rejected" | "reverted";
  updates: {
    case_ids?: string[];
    lesson_ids?: string[];
    prior_updates?: Record<string, number>;
    graph_edge_updates?: Array<{ source: string; target: string; weight: number }>;
    evaluated_at?: string;
  };
  benchmark_result?: BenchmarkMetrics;
  golden_set_result?: Record<string, number>;
  created_at: string;
  decided_at?: string;
  decided_by?: string;
  audit_event_id?: string;
}
