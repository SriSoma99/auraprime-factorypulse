// Audit & Regulatory Service (DU-08 / APP-20 / REG-1..8, AC-H9).
// Provides cryptographic hash chain verification, tamper detection, and regulatory evidence pack generation.
// Invariant 3: Append-only hash-chained audit ledger; Invariant 4: Forced RLS.

import type { Pool } from "pg";
import type { AuditVerificationReport, EvidencePack } from "./types.js";

export class AuditService {
  constructor(private readonly pool: Pool) {}

  /**
   * Cryptographically verifies the integrity of the audit chain for a tenant (REG-1..4, AC-H9).
   * Traverses genesis to tip, verifying mathematical SHA-256 hash linkage.
   */
  public async verifyAuditLedger(tenantId: string): Promise<AuditVerificationReport> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      const res = await client.query<{
        valid: boolean;
        verified_count: string | number;
        broken_seq: string | number | null;
        expected_hash: string | null;
        actual_hash: string | null;
      }>("SELECT valid, verified_count, broken_seq, expected_hash, actual_hash FROM gov.verify_audit()");

      await client.query("COMMIT");

      const row = res.rows[0];
      if (!row) {
        return { valid: true, verified_count: 0 };
      }

      return {
        valid: row.valid,
        verified_count: Number(row.verified_count),
        broken_seq: row.broken_seq != null ? Number(row.broken_seq) : undefined,
        expected_hash: row.expected_hash ?? undefined,
        actual_hash: row.actual_hash ?? undefined,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Compiles an immutable evidence pack for an incident (REG-5, REG-6).
   */
  public async exportEvidencePack(tenantId: string, incidentId: string): Promise<EvidencePack> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      // 1. Incident details
      const incRes = await client.query("SELECT * FROM \"case\".incident WHERE id = $1", [incidentId]);
      const incident = incRes.rows[0] ?? {};

      // 2. Work orders
      const woRes = await client.query("SELECT * FROM \"case\".work_order WHERE incident_id = $1", [incidentId]);
      const workOrders = woRes.rows;

      // 3. Approvals
      const workOrderIds = workOrders.map((w) => w.id);
      let approvals: any[] = [];
      if (workOrderIds.length > 0) {
        const appRes = await client.query(
          "SELECT * FROM \"case\".approval WHERE work_order_id = ANY($1::text[])",
          [workOrderIds]
        );
        approvals = appRes.rows;
      }

      // 4. Audit trail
      const auditObjects = [incidentId, ...workOrderIds];
      const auditRes = await client.query(
        `SELECT seq, id, at, actor, action, object, payload, prev_hash, hash
         FROM gov.audit_event
         WHERE object = ANY($1::text[])
         ORDER BY seq ASC`,
        [auditObjects]
      );

      // 5. Verification status
      const verification = await this.verifyAuditLedger(tenantId);

      await client.query("COMMIT");

      return {
        tenant_id: tenantId,
        incident_id: incidentId,
        generated_at: new Date().toISOString(),
        incident,
        work_orders: workOrders,
        approvals,
        audit_chain: auditRes.rows,
        verification,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
