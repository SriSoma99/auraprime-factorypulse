import { describe, it, expect, afterAll } from "vitest";
import { config, appPool, adminPool } from "@fp/db";
import { AuditService } from "./audit.js";

describe("Audit & Regulatory Service (APP-20 / REG-1..8, AC-H9)", () => {
  const cfg = config();
  const pool = appPool(cfg);
  const admPool = adminPool(cfg);
  const auditService = new AuditService(pool);

  afterAll(async () => {
    await pool.end();
    await admPool.end();
  });

  it("cryptographically verifies an untampered tenant audit ledger (REG-1..4, AC-H9)", async () => {
    // 1. Ensure at least two events exist in the chain
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");
      await client.query(
        "SELECT gov.append_audit($1, $2, $3, $4::jsonb)",
        ["tester", "audit_verify_test_1", "TEST-OBJ-1", JSON.stringify({ marker: 1 })]
      );
      await client.query(
        "SELECT gov.append_audit($1, $2, $3, $4::jsonb)",
        ["tester", "audit_verify_test_2", "TEST-OBJ-2", JSON.stringify({ marker: 2 })]
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    // 2. Run verification
    const report = await auditService.verifyAuditLedger("t-demo");
    expect(report.valid).toBe(true);
    expect(report.verified_count).toBeGreaterThanOrEqual(2);
    expect(report.broken_seq).toBeUndefined();
  });

  it("detects payload tampering and pinpoints broken sequence number (AC-H9)", async () => {
    // 1. Append a known event
    const client = await pool.connect();
    let eventId = "";
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");
      const res = await client.query<{ append_audit: string }>(
        "SELECT gov.append_audit($1, $2, $3, $4::jsonb)",
        ["attacker_target", "tamper_test", "TAMPER-TARGET", JSON.stringify({ confidential_value: 100 })]
      );
      eventId = res.rows[0]!.append_audit;
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    // 2. Tamper with the row hash directly using admin connection (bypassing RLS & append_audit)
    const adminClient = await admPool.connect();
    let tamperedSeq = 0;
    let originalHash = "";
    try {
      await adminClient.query("BEGIN");
      const seqRes = await adminClient.query<{ seq: string; hash: string }>(
        "SELECT seq, hash FROM gov.audit_event WHERE id = $1",
        [`t-demo:${eventId}`]
      );
      tamperedSeq = Number(seqRes.rows[0]!.seq);
      originalHash = seqRes.rows[0]!.hash;

      // Maliciously alter hash
      await adminClient.query(
        `UPDATE gov.audit_event
         SET hash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
         WHERE id = $1`,
        [`t-demo:${eventId}`]
      );
      await adminClient.query("COMMIT");
    } finally {
      adminClient.release();
    }

    // 3. Verify audit ledger detects the cryptographic discrepancy
    const report = await auditService.verifyAuditLedger("t-demo");
    expect(report.valid).toBe(false);
    expect(report.broken_seq).toBe(tamperedSeq);
    expect(report.expected_hash).toBe(originalHash);
    expect(report.actual_hash).toBe("deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");

    // 4. Restore row integrity using admin connection
    const restoreClient = await admPool.connect();
    try {
      await restoreClient.query("BEGIN");
      await restoreClient.query(
        `UPDATE gov.audit_event
         SET hash = $1
         WHERE id = $2`,
        [originalHash, `t-demo:${eventId}`]
      );
      await restoreClient.query("COMMIT");
    } finally {
      restoreClient.release();
    }

    // 5. Verify ledger integrity is restored
    const restoredReport = await auditService.verifyAuditLedger("t-demo");
    expect(restoredReport.valid).toBe(true);
  });

  it("exports complete immutable regulatory evidence pack for an incident (REG-5, REG-6)", async () => {
    const client = await pool.connect();
    const incId = `INC-EVID-${Date.now()}`;
    const woId = `WO-EVID-${Date.now()}`;
    const appId = `APP-EVID-${Date.now()}`;

    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");

      await client.query(
        `INSERT INTO "case".incident (
           id, tenant_id, title, state, opened_at, summary_text, template_summary,
           hypotheses, evidence, what_would_change, citation_ids, trust_sensor_ids, trace_id
         ) VALUES ($1, 't-demo', 'Regulatory Evidence Incident', 'open', now(), 'Summary', 'Template',
                   '[]', '[]', '[]', '[]', '[]', '4bf92f3577b34da6a3ce929d0e0e4736')`,
        [incId]
      );

      await client.query(
        `INSERT INTO "case".work_order (
           id, tenant_id, incident_id, title, asset_id, type, status, is_draft, steps
         ) VALUES ($1, 't-demo', $2, 'Clean strainer basket', 'as-wc4-coolant', 'machine', 'ready', true, '[]')`,
        [woId, incId]
      );

      await client.query(
        `INSERT INTO "case".approval (
           id, tenant_id, work_order_id, tier, required_role, rationale, rule_ids,
           policy_version, requested_by, expires_at, status, evidence_summary
         ) VALUES ($1, 't-demo', $2, 1, 'maintenance_lead', 'Tier 1 routine cleaning', '["POL-RULE-02"]',
                   '2026.10-v1', 'fp-agent:orchestrator', now() + interval '2 hours', 'approved', '{}')`,
        [appId, woId]
      );

      // Append audit event for work order
      await client.query(
        "SELECT gov.append_audit($1, $2, $3, $4::jsonb)",
        ["sarah.lead@factory.internal", "approve_work_order", woId, JSON.stringify({ decision: "approved" })]
      );

      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const pack = await auditService.exportEvidencePack("t-demo", incId);
    expect(pack.tenant_id).toBe("t-demo");
    expect(pack.incident_id).toBe(incId);
    expect(pack.work_orders.length).toBe(1);
    expect(pack.approvals.length).toBe(1);
    expect(pack.audit_chain.length).toBeGreaterThanOrEqual(1);
    expect(pack.verification.valid).toBe(true);
  });
});
