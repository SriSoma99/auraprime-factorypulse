import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config, appPool } from "@fp/db";
import { PolicyEngine } from "./policy.js";
import type { Pool } from "pg";

describe("Policy Engine (APP-10 / POL-1..4, AC-H6)", () => {
  const cfg = config();
  const pool = appPool(cfg);
  const policyEngine = new PolicyEngine(pool);



  afterAll(async () => {
    await pool.end();
  });

  it("evaluates policy-as-code outside LLM for approval tiers (POL-1, POL-2)", () => {
    // 1. Non-invasive sensor inspection
    const p1 = policyEngine.evaluatePolicy({
      action_type: "sensor_recalibration",
      asset_id: "as-wc4-coolant",
      estimated_downtime_minutes: 0,
      buffer_starvation_risk: false,
    });
    expect(p1.tier).toBe(1);
    expect(p1.required_role).toBe("maintenance_lead");
    expect(p1.rule_ids).toContain("POL-RULE-01");

    // 2. Minor in-line adjustment with no starvation
    const p2 = policyEngine.evaluatePolicy({
      action_type: "cleaning_adjustment",
      asset_id: "as-wc4-coolant",
      estimated_downtime_minutes: 8,
      buffer_starvation_risk: false,
    });
    expect(p2.tier).toBe(1);
    expect(p2.required_role).toBe("maintenance_lead");

    // 3. Hardware replacement
    const p3 = policyEngine.evaluatePolicy({
      action_type: "component_replacement",
      asset_id: "as-wc4-coolant",
      estimated_downtime_minutes: 20,
      buffer_starvation_risk: false,
    });
    expect(p3.tier).toBe(2);
    expect(p3.required_role).toBe("plant_manager");
    expect(p3.rule_ids).toContain("POL-RULE-03");

    // 4. Downstream buffer starvation risk
    const p4 = policyEngine.evaluatePolicy({
      action_type: "cleaning_adjustment",
      asset_id: "as-wc4-coolant",
      estimated_downtime_minutes: 25,
      buffer_starvation_risk: true,
    });
    expect(p4.tier).toBe(2);
    expect(p4.required_role).toBe("plant_manager");
    expect(p4.rule_ids).toContain("POL-RULE-04");
  });

  it("approves Tier 1 work order with authorized human role and records audit event (POL-3, AC-H6)", async () => {
    const client = await pool.connect();
    const incId = `INC-TEST-${Date.now()}`;
    const woId = `WO-TEST-${Date.now()}`;
    const appId = `APP-TEST-${Date.now()}`;

    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      await client.query(
        `INSERT INTO "case".incident (
           id, tenant_id, title, state, opened_at, summary_text, template_summary,
           hypotheses, evidence, what_would_change, citation_ids, trust_sensor_ids, trace_id
         ) VALUES ($1, 't-demo', 'Test Incident', 'open', now(), 'Summary', 'Template', '[]', '[]', '[]', '[]', '[]', '00000000000000000000000000000000')`,
        [incId]
      );

      await client.query(
        `INSERT INTO "case".work_order (
           id, tenant_id, incident_id, title, asset_id, type, status, is_draft, steps
         ) VALUES ($1, 't-demo', $2, 'Clean strainer basket', 'as-wc4-coolant', 'machine', 'draft', true, '[]')`,
        [woId, incId]
      );

      await client.query(
        `INSERT INTO "case".approval (
           id, tenant_id, work_order_id, tier, required_role, rationale, rule_ids,
           policy_version, requested_by, expires_at, status, evidence_summary
         ) VALUES ($1, 't-demo', $2, 1, 'maintenance_lead', 'Tier 1 routine cleaning', '["POL-RULE-02"]',
                   '2026.10-v1', 'fp-agent:orchestrator', now() + interval '2 hours', 'pending', '{}')`,
        [appId, woId]
      );

      await client.query("COMMIT");
    } finally {
      client.release();
    }

    // Attempt approval as maintenance_lead
    const result = await policyEngine.decideApproval({
      approval_id: appId,
      tenant_id: "t-demo",
      decided_by: "sarah.lead@factory.internal",
      actor_role: "maintenance_lead",
      session_type: "human",
      decision: "approved",
    });

    expect(result.status).toBe("approved");
    expect(result.work_order_id).toBe(woId);
    expect(result.audit_event_id).toBeDefined();

    // Verify database state
    const verifyClient = await pool.connect();
    try {
      await verifyClient.query("BEGIN");
      await verifyClient.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      const wo = (await verifyClient.query<{ status: string; approved_by: string }>(
        `SELECT status, approved_by FROM "case".work_order WHERE id = $1`,
        [woId]
      )).rows[0]!;
      expect(wo.status).toBe("ready");
      expect(wo.approved_by).toBe("sarah.lead@factory.internal");

      const app = (await verifyClient.query<{ status: string; decided_by: string }>(
        `SELECT status, decided_by FROM "case".approval WHERE id = $1`,
        [appId]
      )).rows[0]!;
      expect(app.status).toBe("approved");
      expect(app.decided_by).toBe("sarah.lead@factory.internal");

      await verifyClient.query("COMMIT");
    } finally {
      verifyClient.release();
    }
  });

  it("rejects unauthorized role decision attempting to approve Tier 2 work order (POL-2)", async () => {
    const client = await pool.connect();
    const incId = `INC-TEST-T2-${Date.now()}`;
    const woId = `WO-TEST-T2-${Date.now()}`;
    const appId = `APP-TEST-T2-${Date.now()}`;

    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      await client.query(
        `INSERT INTO "case".incident (
           id, tenant_id, title, state, opened_at, summary_text, template_summary,
           hypotheses, evidence, what_would_change, citation_ids, trust_sensor_ids, trace_id
         ) VALUES ($1, 't-demo', 'T2 Incident', 'open', now(), 'Summary', 'Template', '[]', '[]', '[]', '[]', '[]', '00000000000000000000000000000000')`,
        [incId]
      );

      await client.query(
        `INSERT INTO "case".work_order (
           id, tenant_id, incident_id, title, asset_id, type, status, is_draft, steps
         ) VALUES ($1, 't-demo', $2, 'Replace pump impeller', 'as-wc4-coolant', 'machine', 'draft', true, '[]')`,
        [woId, incId]
      );

      await client.query(
        `INSERT INTO "case".approval (
           id, tenant_id, work_order_id, tier, required_role, rationale, rule_ids,
           policy_version, requested_by, expires_at, status, evidence_summary
         ) VALUES ($1, 't-demo', $2, 2, 'plant_manager', 'Tier 2 pump replacement', '["POL-RULE-03"]',
                   '2026.10-v1', 'fp-agent:orchestrator', now() + interval '4 hours', 'pending', '{}')`,
        [appId, woId]
      );

      await client.query("COMMIT");
    } finally {
      client.release();
    }

    // maintenance_lead attempts to approve Tier 2 (should fail)
    await expect(
      policyEngine.decideApproval({
        approval_id: appId,
        tenant_id: "t-demo",
        decided_by: "sarah.lead@factory.internal",
        actor_role: "maintenance_lead",
        session_type: "human",
        decision: "approved",
      })
    ).rejects.toThrow(/Unauthorized/);

    // plant_manager approves successfully
    const t2Result = await policyEngine.decideApproval({
      approval_id: appId,
      tenant_id: "t-demo",
      decided_by: "elena.manager@factory.internal",
      actor_role: "plant_manager",
      session_type: "human",
      decision: "approved",
    });
    expect(t2Result.status).toBe("approved");
  });

  it("handles work order rejection with recorded rationale (POL-3)", async () => {
    const client = await pool.connect();
    const incId = `INC-TEST-REJ-${Date.now()}`;
    const woId = `WO-TEST-REJ-${Date.now()}`;
    const appId = `APP-TEST-REJ-${Date.now()}`;

    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      await client.query(
        `INSERT INTO "case".incident (
           id, tenant_id, title, state, opened_at, summary_text, template_summary,
           hypotheses, evidence, what_would_change, citation_ids, trust_sensor_ids, trace_id
         ) VALUES ($1, 't-demo', 'Reject Incident', 'open', now(), 'Summary', 'Template', '[]', '[]', '[]', '[]', '[]', '00000000000000000000000000000000')`,
        [incId]
      );

      await client.query(
        `INSERT INTO "case".work_order (
           id, tenant_id, incident_id, title, asset_id, type, status, is_draft, steps
         ) VALUES ($1, 't-demo', $2, 'Inspect weld coolant manifold', 'as-wc4-coolant', 'inspection', 'draft', true, '[]')`,
        [woId, incId]
      );

      await client.query(
        `INSERT INTO "case".approval (
           id, tenant_id, work_order_id, tier, required_role, rationale, rule_ids,
           policy_version, requested_by, expires_at, status, evidence_summary
         ) VALUES ($1, 't-demo', $2, 1, 'maintenance_lead', 'Diagnostic inspection', '["POL-RULE-01"]',
                   '2026.10-v1', 'fp-agent:orchestrator', now() + interval '2 hours', 'pending', '{}')`,
        [appId, woId]
      );

      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const rejResult = await policyEngine.decideApproval({
      approval_id: appId,
      tenant_id: "t-demo",
      decided_by: "sarah.lead@factory.internal",
      actor_role: "maintenance_lead",
      session_type: "human",
      decision: "rejected",
      reason: "Shift changeover scheduled; defer inspection to 2nd shift.",
    });

    expect(rejResult.status).toBe("rejected");

    // Verify work order was cancelled
    const checkClient = await pool.connect();
    try {
      await checkClient.query("BEGIN");
      await checkClient.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      const wo = (await checkClient.query<{ status: string }>(
        `SELECT status FROM "case".work_order WHERE id = $1`,
        [woId]
      )).rows[0]!;
      expect(wo.status).toBe("cancelled");

      const app = (await checkClient.query<{ status: string; decision_reason: string }>(
        `SELECT status, decision_reason FROM "case".approval WHERE id = $1`,
        [appId]
      )).rows[0]!;
      expect(app.status).toBe("rejected");
      expect(app.decision_reason).toContain("Shift changeover");

      await checkClient.query("COMMIT");
    } finally {
      checkClient.release();
    }
  });

  it("strictly enforces Safety Invariant 2: rejects non-human approval attempts", async () => {
    // Attempt approval with api_key
    await expect(
      policyEngine.decideApproval({
        approval_id: "APP-DUMMY",
        tenant_id: "t-demo",
        decided_by: "api_key:system",
        actor_role: "plant_manager",
        session_type: "api_key",
        decision: "approved",
      })
    ).rejects.toThrow(/Safety Invariant 2 violation/);

    // Attempt approval with agent_token
    await expect(
      policyEngine.decideApproval({
        approval_id: "APP-DUMMY",
        tenant_id: "t-demo",
        decided_by: "agent:orchestrator",
        actor_role: "plant_manager",
        session_type: "agent_token",
        decision: "approved",
      })
    ).rejects.toThrow(/Safety Invariant 2 violation/);
  });
});
