// Policy Engine (DU-08 / APP-10 / POL-1..4).
// Deterministic policy-as-code outside the LLM deciding approval tiers and gating human authorization.
// Invariant 2: Human-only approvals; Invariant 3: Audit hash-chained logging; Invariant 4: Forced RLS.

import type { Pool } from "pg";
import type {
  ActionPolicyContext,
  ApprovalDecisionRequest,
  ApprovalDecisionResult,
  PolicyDecision,
  PolicyRule,
} from "./types.js";

export const POLICY_VERSION = "2026.10-v1";

export const DEFAULT_POLICY_RULES: PolicyRule[] = [
  {
    id: "POL-RULE-01",
    name: "Non-invasive Sensor/Diagnostic Inspection",
    description: "Diagnostic or inspection tasks with zero production stoppage require Shift/Maintenance Lead approval.",
    tier: 1,
    required_role: "maintenance_lead",
    evaluator: (ctx) =>
      ctx.action_type === "sensor_recalibration" ||
      (ctx.action_type === "inspection" && ctx.estimated_downtime_minutes === 0),
  },
  {
    id: "POL-RULE-02",
    name: "Routine In-Line Cleaning/Adjustment",
    description: "Routine servicing without buffer starvation risk requires Maintenance Lead approval.",
    tier: 1,
    required_role: "maintenance_lead",
    evaluator: (ctx) =>
      ctx.action_type === "cleaning_adjustment" &&
      !ctx.buffer_starvation_risk &&
      ctx.estimated_downtime_minutes < 15,
  },
  {
    id: "POL-RULE-03",
    name: "Hardware Component Replacement",
    description: "Physical part replacement or extended downtime (>=15 min) requires Plant Operations Manager approval.",
    tier: 2,
    required_role: "plant_manager",
    evaluator: (ctx) =>
      ctx.action_type === "component_replacement" || ctx.estimated_downtime_minutes >= 15,
  },
  {
    id: "POL-RULE-04",
    name: "Production-Impact / Buffer Starvation Risk",
    description: "Any intervention risking downstream station starvation or line shutdown requires Plant Operations Manager approval.",
    tier: 2,
    required_role: "plant_manager",
    evaluator: (ctx) => ctx.buffer_starvation_risk || ctx.action_type === "process_halt",
  },
];

export class PolicyEngine {
  constructor(
    private readonly pool: Pool,
    private readonly rules: PolicyRule[] = DEFAULT_POLICY_RULES
  ) {}

  /**
   * Evaluates policy-as-code outside the LLM to determine required approval tier (POL-1, POL-2).
   */
  public evaluatePolicy(context: ActionPolicyContext): PolicyDecision {
    // Check Tier 2 rules first (highest scrutiny)
    const matchedTier2 = this.rules.filter((r) => r.tier === 2 && r.evaluator(context));
    if (matchedTier2.length > 0) {
      return {
        tier: 2,
        required_role: "plant_manager",
        rationale: `Tier 2 approval required by ${matchedTier2.map((r) => r.name).join(", ")}. High production impact or physical replacement.`,
        rule_ids: matchedTier2.map((r) => r.id),
        policy_version: POLICY_VERSION,
      };
    }

    const matchedTier1 = this.rules.filter((r) => r.tier === 1 && r.evaluator(context));
    if (matchedTier1.length > 0) {
      return {
        tier: 1,
        required_role: "maintenance_lead",
        rationale: `Tier 1 approval required by ${matchedTier1.map((r) => r.name).join(", ")}. Routine maintenance or diagnostic inspection.`,
        rule_ids: matchedTier1.map((r) => r.id),
        policy_version: POLICY_VERSION,
      };
    }

    // Default fallback to Tier 1
    return {
      tier: 1,
      required_role: "maintenance_lead",
      rationale: "Default policy rule: standard maintenance inspection.",
      rule_ids: ["POL-RULE-DEFAULT"],
      policy_version: POLICY_VERSION,
    };
  }

  /**
   * Enforces human approval decision against policy tiers and records tamper-evident audit log (POL-3, AC-H6).
   */
  public async decideApproval(request: ApprovalDecisionRequest): Promise<ApprovalDecisionResult> {
    // Safety Invariant 2: Approval requires a human session; API keys and agent tokens cannot approve
    if (request.session_type !== "human") {
      throw new Error(
        `Safety Invariant 2 violation: Approval requires an authenticated human session; '${request.session_type}' tokens cannot approve`
      );
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [request.tenant_id]);

      // 1. Fetch approval record
      const appRes = await client.query<{
        id: string;
        work_order_id: string;
        tier: number;
        required_role: string;
        status: string;
        requested_by: string;
      }>(
        `SELECT id, work_order_id, tier, required_role, status, requested_by
         FROM "case".approval
         WHERE id = $1 FOR UPDATE`,
        [request.approval_id]
      );

      if (appRes.rows.length === 0) {
        throw new Error(`Approval record ${request.approval_id} not found`);
      }

      const approval = appRes.rows[0]!;

      if (approval.status !== "pending") {
        throw new Error(`Approval ${request.approval_id} is already in '${approval.status}' state`);
      }

      // 3. Role authorization check (POL-2)
      if (request.actor_role !== approval.required_role) {
        throw new Error(
          `Unauthorized: ${request.actor_role} cannot decide Tier ${approval.tier} approval requiring ${approval.required_role}`
        );
      }

      // 4. Anti-self-approval rule
      if (request.decided_by === approval.requested_by) {
        throw new Error("Violation: Requestor cannot approve their own proposed work order");
      }

      const decidedAt = new Date().toISOString();
      let auditAction = "";

      if (request.decision === "approved") {
        auditAction = "approve_work_order";

        // Update approval
        await client.query(
          `UPDATE "case".approval
           SET status = 'approved', decided_by = $1, decided_at = $2
           WHERE id = $3`,
          [request.decided_by, decidedAt, request.approval_id]
        );

        // Update work order to ready/approved
        await client.query(
          `UPDATE "case".work_order
           SET status = 'ready', approved_by = $1, approved_at = $2
           WHERE id = $3`,
          [request.decided_by, decidedAt, approval.work_order_id]
        );
      } else {
        auditAction = "reject_work_order";

        // Update approval
        await client.query(
          `UPDATE "case".approval
           SET status = 'rejected', decided_by = $1, decided_at = $2, decision_reason = $3
           WHERE id = $4`,
          [request.decided_by, decidedAt, request.reason ?? "Rejected by authorized reviewer", request.approval_id]
        );

        // Update work order to cancelled
        await client.query(
          `UPDATE "case".work_order
           SET status = 'cancelled'
           WHERE id = $1`,
          [approval.work_order_id]
        );
      }

      // 4. Record audit event in gov.audit_event via append_audit (Invariant 3)
      const auditRes = await client.query<{ append_audit: string }>(
        "SELECT gov.append_audit($1, $2, $3, $4::jsonb)",
        [
          `user:${request.decided_by}`,
          auditAction,
          approval.work_order_id,
          JSON.stringify({
            approval_id: request.approval_id,
            tier: approval.tier,
            actor_role: request.actor_role,
            decision: request.decision,
            reason: request.reason,
            decided_at: decidedAt,
          }),
        ]
      );

      const auditEventId = auditRes.rows[0]?.append_audit ?? "";

      // Link audit_event_id to approval
      await client.query(
        `UPDATE "case".approval SET audit_event_id = $1 WHERE id = $2`,
        [auditEventId, request.approval_id]
      );

      await client.query("COMMIT");

      return {
        approval_id: request.approval_id,
        work_order_id: approval.work_order_id,
        status: request.decision,
        decided_by: request.decided_by,
        decided_at: decidedAt,
        audit_event_id: auditEventId,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
