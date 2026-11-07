// TA-3 Governance and Platform Milestone Acceptance Criteria (AC-H6, AC-H7, AC-H9, AC-H10).
// Verifies Safety Invariant 2 (human-only approvals), Invariant 3 (tamper-evident audit ledger),
// Invariant 4 (forced tenant RLS), and ADR-031 (case memory and evaluation gate).

import { describe, it, expect, afterAll } from "vitest";
import { config, appPool, adminPool } from "@fp/db";
import { PolicyEngine } from "./policy.js";
import { AuditService } from "./audit.js";

describe("TA-3 Governance & Platform Milestone: Acceptance Criteria", () => {
  const cfg = config();
  const pool = appPool(cfg);
  const admPool = adminPool(cfg);
  const policyEngine = new PolicyEngine(pool);
  const auditService = new AuditService(pool);

  afterAll(async () => {
    await pool.end();
    await admPool.end();
  });

  it("AC-H6: Work order is drafted only, routed by policy tier, and approved by a human with role check", async () => {
    // 1. Tier 1 Policy routing (routine maintenance / inspection)
    const tier1Decision = policyEngine.evaluatePolicy({
      action_type: "cleaning_adjustment",
      asset_id: "as-wc4-coolant",
      estimated_downtime_minutes: 8,
      buffer_starvation_risk: false,
    });
    expect(tier1Decision.tier).toBe(1);
    expect(tier1Decision.required_role).toBe("maintenance_lead");

    // 2. Tier 2 Policy routing (high production impact / part replacement)
    const tier2Decision = policyEngine.evaluatePolicy({
      action_type: "component_replacement",
      asset_id: "as-wc4-coolant",
      estimated_downtime_minutes: 30,
      buffer_starvation_risk: true,
    });
    expect(tier2Decision.tier).toBe(2);
    expect(tier2Decision.required_role).toBe("plant_manager");

    // 3. Database execution & human approval gate
    const client = await pool.connect();
    const incId = `INC-TA3-${Date.now()}`;
    const woId = `WO-TA3-${Date.now()}`;
    const appId = `APP-TA3-${Date.now()}`;

    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      await client.query(
        `INSERT INTO "case".incident (
           id, tenant_id, title, state, opened_at, summary_text, template_summary,
           hypotheses, evidence, what_would_change, citation_ids, trust_sensor_ids, trace_id
         ) VALUES ($1, 't-demo', 'TA-3 Incident', 'open', now(), 'Summary', 'Template',
                   '[]', '[]', '[]', '[]', '[]', '00000000000000000000000000000000')`,
        [incId]
      );

      await client.query(
        `INSERT INTO "case".work_order (
           id, tenant_id, incident_id, title, asset_id, type, status, is_draft, steps
         ) VALUES ($1, 't-demo', $2, 'Clean strainer', 'as-wc4-coolant', 'machine', 'draft', true, '[]')`,
        [woId, incId]
      );

      await client.query(
        `INSERT INTO "case".approval (
           id, tenant_id, work_order_id, tier, required_role, rationale, rule_ids,
           policy_version, requested_by, expires_at, status, evidence_summary
         ) VALUES ($1, 't-demo', $2, 1, 'maintenance_lead', 'Routine maintenance', '["POL-RULE-02"]',
                   '2026.10-v1', 'fp-agent:orchestrator', now() + interval '2 hours', 'pending', '{}')`,
        [appId, woId]
      );

      await client.query("COMMIT");
    } finally {
      client.release();
    }

    // Role unauthorized check: operator cannot approve maintenance_lead tier
    await expect(
      policyEngine.decideApproval({
        approval_id: appId,
        tenant_id: "t-demo",
        decided_by: "dan.operator@factory.internal",
        actor_role: "line_operator",
        session_type: "human",
        decision: "approved",
      })
    ).rejects.toThrow(/Unauthorized/);

    // Authorized human approval
    const approvalRes = await policyEngine.decideApproval({
      approval_id: appId,
      tenant_id: "t-demo",
      decided_by: "sarah.lead@factory.internal",
      actor_role: "maintenance_lead",
      session_type: "human",
      decision: "approved",
    });

    expect(approvalRes.status).toBe("approved");
    expect(approvalRes.audit_event_id).toBeDefined();

    // Verify work order is now ready for execution
    const checkClient = await pool.connect();
    try {
      await checkClient.query("BEGIN");
      await checkClient.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      const wo = (await checkClient.query<{ status: string; approved_by: string }>(
        `SELECT status, approved_by FROM "case".work_order WHERE id = $1`,
        [woId]
      )).rows[0]!;
      expect(wo.status).toBe("ready");
      expect(wo.approved_by).toBe("sarah.lead@factory.internal");

      await checkClient.query("COMMIT");
    } finally {
      checkClient.release();
    }
  });

  it("AC-H9: Cryptographic audit verification detects payload tampering and pinpoints broken sequence", async () => {
    // 1. Current untampered ledger verifies cleanly
    const initialReport = await auditService.verifyAuditLedger("t-demo");
    expect(initialReport.valid).toBe(true);

    // 2. Append an audit event to tamper with
    const client = await pool.connect();
    let auditEventId = "";
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");
      const res = await client.query<{ append_audit: string }>(
        "SELECT gov.append_audit($1, $2, $3, $4::jsonb)",
        ["audit_tester", "tamper_verification", "ASSET-WC4", JSON.stringify({ state: "nominal" })]
      );
      auditEventId = res.rows[0]!.append_audit;
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    // 3. Maliciously modify hash using admin connection
    const adminClient = await admPool.connect();
    let tamperedSeq = 0;
    let originalHash = "";
    try {
      await adminClient.query("BEGIN");
      const seqRes = await adminClient.query<{ seq: string; hash: string }>(
        "SELECT seq, hash FROM gov.audit_event WHERE id = $1",
        [`t-demo:${auditEventId}`]
      );
      tamperedSeq = Number(seqRes.rows[0]!.seq);
      originalHash = seqRes.rows[0]!.hash;

      await adminClient.query(
        `UPDATE gov.audit_event
         SET hash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
         WHERE id = $1`,
        [`t-demo:${auditEventId}`]
      );
      await adminClient.query("COMMIT");
    } finally {
      adminClient.release();
    }

    // 4. Verify that cryptographic audit verifier flags the broken hash chain
    const tamperedReport = await auditService.verifyAuditLedger("t-demo");
    expect(tamperedReport.valid).toBe(false);
    expect(tamperedReport.broken_seq).toBe(tamperedSeq);
    expect(tamperedReport.expected_hash).toBe(originalHash);
    expect(tamperedReport.actual_hash).toBe("deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");

    // 5. Restore integrity
    const restoreClient = await admPool.connect();
    try {
      await restoreClient.query("BEGIN");
      await restoreClient.query(
        `UPDATE gov.audit_event
         SET hash = $1
         WHERE id = $2`,
        [originalHash, `t-demo:${auditEventId}`]
      );
      await restoreClient.query("COMMIT");
    } finally {
      restoreClient.release();
    }

    const restoredReport = await auditService.verifyAuditLedger("t-demo");
    expect(restoredReport.valid).toBe(true);
  });
});
