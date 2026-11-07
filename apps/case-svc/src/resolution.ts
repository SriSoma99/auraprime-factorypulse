// Resolution & Verification Service (DU-07 / APP-12 / LRN-1, LRN-2, AC-H7).
// Captures technician outcome and verifies physical reversal of drift across consecutive cycles before incident closure.
// Invariant 3: Audit hash-chained logging; Invariant 4: Forced RLS.

import type { Pool } from "pg";
import type { TechnicianOutcome, VerificationCycleResult } from "./types.js";

export interface RecordOutcomeInput {
  tenant_id: string;
  incident_id: string;
  technician_id: string;
  finding: string;
  readings: Record<string, number>;
  action_taken: string;
}

export interface VerificationCycleInput {
  tenant_id: string;
  incident_id: string;
  drift_detected: boolean;
  metric_name: string;
  metric_value: number;
  required_consecutive_cycles?: number;
}

export class ResolutionVerificationService {
  constructor(private readonly pool: Pool) {}

  /**
   * Captures technician finding, physical readings, and maintenance action taken (LRN-1).
   */
  public async recordOutcome(input: RecordOutcomeInput): Promise<TechnicianOutcome> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [input.tenant_id]);

      const id = `OUT-${Date.now()}`;
      const now = new Date().toISOString();

      await client.query(
        `INSERT INTO "case".outcome (
           id, tenant_id, incident_id, technician_id, finding, readings,
           action_taken, verified, good_cycle_count, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, 0, $8)`,
        [
          id,
          input.tenant_id,
          input.incident_id,
          input.technician_id,
          input.finding,
          JSON.stringify(input.readings),
          input.action_taken,
          now,
        ]
      );

      // Transition incident to in_verification state
      await client.query(
        `UPDATE "case".incident
         SET state = 'in_verification',
             outcome = $1
         WHERE id = $2`,
        [
          JSON.stringify({
            outcome_id: id,
            finding: input.finding,
            action_taken: input.action_taken,
            technician_id: input.technician_id,
          }),
          input.incident_id,
        ]
      );

      // Record audit event
      await client.query(
        "SELECT gov.append_audit($1, $2, $3, $4::jsonb)",
        [
          `technician:${input.technician_id}`,
          "record_outcome",
          input.incident_id,
          JSON.stringify({ outcome_id: id, action_taken: input.action_taken }),
        ]
      );

      await client.query("COMMIT");

      return {
        id,
        tenant_id: input.tenant_id,
        incident_id: input.incident_id,
        technician_id: input.technician_id,
        finding: input.finding,
        readings: input.readings,
        action_taken: input.action_taken,
        verified: false,
        good_cycle_count: 0,
        created_at: now,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Evaluates post-maintenance sensor drift cycle (LRN-2, AC-H7).
   * Incident closes only after drift reverses for N consecutive cycles; otherwise it reopens.
   */
  public async evaluateCycle(input: VerificationCycleInput): Promise<VerificationCycleResult> {
    const requiredCycles = input.required_consecutive_cycles ?? 5;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [input.tenant_id]);

      // 1. Fetch latest outcome for incident
      const outRes = await client.query<{
        id: string;
        good_cycle_count: number;
        verified: boolean;
      }>(
        `SELECT id, good_cycle_count, verified
         FROM "case".outcome
         WHERE incident_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [input.incident_id]
      );

      if (outRes.rows.length === 0) {
        throw new Error(`No outcome recorded for incident ${input.incident_id}; cannot verify reversal`);
      }

      const outcome = outRes.rows[0]!;

      // 2. Case: Failed fix / recurring drift detected
      if (input.drift_detected) {
        // Reset good cycle count and reopen incident
        await client.query(
          `UPDATE "case".outcome
           SET good_cycle_count = 0, verified = false
           WHERE id = $1`,
          [outcome.id]
        );

        await client.query(
          `UPDATE "case".incident
           SET state = 'open',
               summary_text = summary_text || ' [Verification failed: drift persisted or recurred. Reopened.]'
           WHERE id = $1`,
          [input.incident_id]
        );

        await client.query(
          "SELECT gov.append_audit($1, $2, $3, $4::jsonb)",
          [
            "fp-system:verifier",
            "verification_failed_reopen",
            input.incident_id,
            JSON.stringify({
              metric: input.metric_name,
              value: input.metric_value,
              cycle_reset: true,
            }),
          ]
        );

        await client.query("COMMIT");

        return {
          incident_id: input.incident_id,
          cycle_number: 1,
          drift_detected: true,
          status: "reopened",
          consecutive_good_cycles: 0,
          message: `Drift persisted on ${input.metric_name} (${input.metric_value}). Incident reopened.`,
        };
      }

      // 3. Case: Healthy / nominal cycle observed
      const newGoodCount = outcome.good_cycle_count + 1;

      if (newGoodCount >= requiredCycles) {
        // Satisfied required consecutive good cycles: verified closure!
        await client.query(
          `UPDATE "case".outcome
           SET good_cycle_count = $1, verified = true
           WHERE id = $2`,
          [newGoodCount, outcome.id]
        );

        await client.query(
          `UPDATE "case".incident
           SET state = 'closed'
           WHERE id = $1`,
          [input.incident_id]
        );

        await client.query(
          "SELECT gov.append_audit($1, $2, $3, $4::jsonb)",
          [
            "fp-system:verifier",
            "verify_closure",
            input.incident_id,
            JSON.stringify({
              consecutive_good_cycles: newGoodCount,
              metric: input.metric_name,
              closure_verified: true,
            }),
          ]
        );

        await client.query("COMMIT");

        return {
          incident_id: input.incident_id,
          cycle_number: newGoodCount,
          drift_detected: false,
          status: "verified_closed",
          consecutive_good_cycles: newGoodCount,
          message: `Drift reversed for ${newGoodCount} consecutive good cycles. Incident verified and closed.`,
        };
      }

      // Still in verification window
      await client.query(
        `UPDATE "case".outcome
         SET good_cycle_count = $1
         WHERE id = $2`,
        [newGoodCount, outcome.id]
      );

      await client.query("COMMIT");

      return {
        incident_id: input.incident_id,
        cycle_number: newGoodCount,
        drift_detected: false,
        status: "in_verification",
        consecutive_good_cycles: newGoodCount,
        message: `Nominal cycle ${newGoodCount}/${requiredCycles} observed. Verification ongoing.`,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
