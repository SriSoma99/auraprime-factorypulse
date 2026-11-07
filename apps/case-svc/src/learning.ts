// Case Memory & Gated Learning Service (DU-07 / APP-12 / LRN-3..7, AC-H9, AC-H10, ADR-031).
// Provides episodic case memory storage, pgvector semantic retrieval of similar past cases,
// human-gated lesson synthesis, and benchmark-evaluated learning batches.
// Invariant 3: Audit hash-chained logging; Invariant 4: Forced RLS.

import type { Pool } from "pg";
import { LocalEmbedder, type KnowledgeService } from "@fp/knowledge-svc";
import type {
  BenchmarkMetrics,
  CaseRecord,
  LearningBatch,
  LessonDraft,
} from "./types.js";

export interface StoreCaseMemoryInput {
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
}

export interface EvaluateGateInput {
  tenant_id: string;
  batch_id: string;
  decided_by: string;
  candidate_benchmark: BenchmarkMetrics;
  baseline_benchmark: BenchmarkMetrics;
  tolerances?: {
    max_lead_time_regression_hours?: number;
    max_false_alarm_rate_increase?: number;
    max_accuracy_drop?: number;
  };
}

export class LearningService {
  private readonly embedder = new LocalEmbedder();

  constructor(
    private readonly pool: Pool,
    private readonly knowledgeService: KnowledgeService
  ) {}

  /**
   * Stores verified incident resolution as a structured episodic case with 384-dim embedding (LRN-5, ADR-031).
   */
  public async storeCaseMemory(input: StoreCaseMemoryInput): Promise<CaseRecord> {
    // Generate text representation for pgvector semantic indexing
    const caseText = `Asset ${input.asset_class} (${input.asset_id}). Failure Mode: ${input.confirmed_failure_mode}. Action: ${input.action_taken}. Signals: ${JSON.stringify(input.signal_pattern)}.`;
    const embedding = this.embedder.embedText(caseText);

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [input.tenant_id]);

      const caseId = `CASE-${Date.now()}`;
      const verifiedAt = new Date().toISOString();

      await client.query(
        `INSERT INTO learn.case_record (
           id, tenant_id, incident_id, asset_id, asset_class, signal_pattern,
           trust_verdicts, hypotheses, discriminating_check, confirmed_failure_mode,
           action_taken, outcome, verified_at, embedding
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::vector
         )`,
        [
          caseId,
          input.tenant_id,
          input.incident_id,
          input.asset_id,
          input.asset_class,
          JSON.stringify(input.signal_pattern),
          JSON.stringify(input.trust_verdicts),
          JSON.stringify(input.hypotheses),
          JSON.stringify(input.discriminating_check ?? null),
          input.confirmed_failure_mode,
          input.action_taken,
          JSON.stringify(input.outcome),
          verifiedAt,
          JSON.stringify(embedding),
        ]
      );

      // Record audit event (Invariant 3)
      await client.query(
        "SELECT gov.append_audit($1, $2, $3, $4::jsonb)",
        [
          "fp-system:case-memory",
          "store_case_memory",
          caseId,
          JSON.stringify({
            incident_id: input.incident_id,
            failure_mode: input.confirmed_failure_mode,
            asset_class: input.asset_class,
          }),
        ]
      );

      await client.query("COMMIT");

      return {
        id: caseId,
        tenant_id: input.tenant_id,
        incident_id: input.incident_id,
        asset_id: input.asset_id,
        asset_class: input.asset_class,
        signal_pattern: input.signal_pattern,
        trust_verdicts: input.trust_verdicts,
        hypotheses: input.hypotheses,
        discriminating_check: input.discriminating_check,
        confirmed_failure_mode: input.confirmed_failure_mode,
        action_taken: input.action_taken,
        outcome: input.outcome,
        verified_at: verifiedAt,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves similar past verified cases through cosine vector search (LRN-5, AC-H10).
   * Cited as evidence in diagnosis, never as an unreviewed decision.
   */
  public async findSimilarCases(
    tenantId: string,
    assetClass: string,
    queryText: string,
    limit = 3
  ): Promise<CaseRecord[]> {
    const queryEmbedding = this.embedder.embedText(queryText);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      const res = await client.query<{
        id: string;
        tenant_id: string;
        incident_id: string;
        asset_id: string;
        asset_class: string;
        signal_pattern: Record<string, unknown>;
        trust_verdicts: Record<string, unknown>;
        hypotheses: Array<Record<string, unknown>>;
        discriminating_check: Record<string, unknown> | null;
        confirmed_failure_mode: string;
        action_taken: string;
        outcome: Record<string, unknown>;
        verified_at: string;
        similarity: string | number;
      }>(
        `SELECT id, tenant_id, incident_id, asset_id, asset_class, signal_pattern,
                trust_verdicts, hypotheses, discriminating_check, confirmed_failure_mode,
                action_taken, outcome, verified_at,
                1 - (embedding <=> $1::vector) as similarity
         FROM learn.case_record
         WHERE asset_class = $2
         ORDER BY embedding <=> $1::vector ASC
         LIMIT $3`,
        [JSON.stringify(queryEmbedding), assetClass, limit]
      );

      await client.query("COMMIT");

      return res.rows.map((row) => ({
        id: row.id,
        tenant_id: row.tenant_id,
        incident_id: row.incident_id,
        asset_id: row.asset_id,
        asset_class: row.asset_class,
        signal_pattern: row.signal_pattern,
        trust_verdicts: row.trust_verdicts,
        hypotheses: row.hypotheses,
        discriminating_check: row.discriminating_check ?? undefined,
        confirmed_failure_mode: row.confirmed_failure_mode,
        action_taken: row.action_taken,
        outcome: row.outcome,
        verified_at: row.verified_at,
        similarity: Number(row.similarity),
      }));
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Model drafts a reusable lesson from a verified case, labelled AI-generated (LRN-6).
   */
  public async draftLesson(
    tenantId: string,
    caseId: string,
    text: string,
    modelVersion = "fp-local-embed-v1"
  ): Promise<LessonDraft> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      const lessonId = `LES-${Date.now()}`;

      await client.query(
        `INSERT INTO learn.lesson (
           id, tenant_id, case_id, text, status, is_ai_generated, drafted_by_model
         ) VALUES ($1, $2, $3, $4, 'draft', true, $5)`,
        [lessonId, tenantId, caseId, text, modelVersion]
      );

      await client.query(
        "SELECT gov.append_audit($1, $2, $3, $4::jsonb)",
        [
          `model:${modelVersion}`,
          "draft_lesson",
          lessonId,
          JSON.stringify({ case_id: caseId, is_ai_generated: true }),
        ]
      );

      await client.query("COMMIT");

      return {
        id: lessonId,
        tenant_id: tenantId,
        case_id: caseId,
        text,
        status: "draft",
        is_ai_generated: true,
        drafted_by_model: modelVersion,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Human decides whether a drafted lesson enters operational retrieval (LRN-6, ADR-031).
   */
  public async decideLesson(
    tenantId: string,
    lessonId: string,
    decidedBy: string,
    decision: "approved" | "rejected",
    reason?: string
  ): Promise<LessonDraft> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);

      const decidedAt = new Date().toISOString();

      const res = await client.query<{
        id: string;
        case_id: string;
        text: string;
        is_ai_generated: boolean;
        drafted_by_model: string;
      }>(
        `UPDATE learn.lesson
         SET status = $1, decided_by = $2, decided_at = $3, decision_reason = $4
         WHERE id = $5 AND status = 'draft'
         RETURNING id, case_id, text, is_ai_generated, drafted_by_model`,
        [decision, decidedBy, decidedAt, reason ?? null, lessonId]
      );

      if (res.rows.length === 0) {
        throw new Error(`Draft lesson ${lessonId} not found or already decided`);
      }

      const lesson = res.rows[0]!;

      // If approved, ingest into knowledge base for operational retrieval
      if (decision === "approved") {
        await this.knowledgeService.ingestDocument({
          id: `CIT-LES-${lesson.id}`,
          tenant_id: tenantId,
          content: lesson.text,
          metadata: {
            title: `Operational Lesson: ${lesson.id}`,
            section: "gated_lesson",
            version: "v1",
            effective_from: decidedAt,
            classification: "internal",
            verified: true,
          },
        });
      }

      // Record audit event
      await client.query(
        "SELECT gov.append_audit($1, $2, $3, $4::jsonb)",
        [
          `user:${decidedBy}`,
          decision === "approved" ? "approve_lesson" : "reject_lesson",
          lessonId,
          JSON.stringify({ decision, reason, case_id: lesson.case_id }),
        ]
      );

      await client.query("COMMIT");

      return {
        id: lesson.id,
        tenant_id: tenantId,
        case_id: lesson.case_id,
        text: lesson.text,
        status: decision,
        is_ai_generated: lesson.is_ai_generated,
        drafted_by_model: lesson.drafted_by_model,
        decided_by: decidedBy,
        decided_at: decidedAt,
        decision_reason: reason,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Stages a learning batch and evaluates it through the benchmark regression gate (LRN-7, AC-H10, ADR-031).
   * Activates ONLY if configured metrics do not regress beyond tolerances.
   */
  public async stageAndEvaluateBatch(input: EvaluateGateInput): Promise<{
    batch: LearningBatch;
    gate_passed: boolean;
    rejection_reasons?: string[];
  }> {
    const maxLeadTimeRegression = input.tolerances?.max_lead_time_regression_hours ?? 0.5;
    const maxFalseAlarmIncrease = input.tolerances?.max_false_alarm_rate_increase ?? 0.02;
    const maxAccuracyDrop = input.tolerances?.max_accuracy_drop ?? 0.02;

    const rejectionReasons: string[] = [];

    // Check 1: Lead time
    if (
      input.baseline_benchmark.detection_lead_time_hours - input.candidate_benchmark.detection_lead_time_hours >
      maxLeadTimeRegression
    ) {
      rejectionReasons.push(
        `Lead time regressed from ${input.baseline_benchmark.detection_lead_time_hours}h to ${input.candidate_benchmark.detection_lead_time_hours}h (tolerance: ${maxLeadTimeRegression}h)`
      );
    }

    // Check 2: False alarm rate
    if (
      input.candidate_benchmark.false_alarm_rate - input.baseline_benchmark.false_alarm_rate >
      maxFalseAlarmIncrease
    ) {
      rejectionReasons.push(
        `False alarm rate increased from ${input.baseline_benchmark.false_alarm_rate} to ${input.candidate_benchmark.false_alarm_rate} (tolerance: +${maxFalseAlarmIncrease})`
      );
    }

    // Check 3: RCA Accuracy
    if (
      input.baseline_benchmark.rca_top1_accuracy - input.candidate_benchmark.rca_top1_accuracy >
      maxAccuracyDrop
    ) {
      rejectionReasons.push(
        `RCA Top-1 accuracy dropped from ${input.baseline_benchmark.rca_top1_accuracy} to ${input.candidate_benchmark.rca_top1_accuracy} (tolerance: -${maxAccuracyDrop})`
      );
    }

    const gatePassed = rejectionReasons.length === 0;
    const finalStatus = gatePassed ? "active" : "rejected";
    const decidedAt = new Date().toISOString();

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [input.tenant_id]);

      await client.query(
        `INSERT INTO learn.learning_batch (
           id, tenant_id, status, updates, benchmark_result, created_at, decided_at, decided_by
         ) VALUES ($1, $2, $3, $4, $5, now(), $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           benchmark_result = EXCLUDED.benchmark_result,
           decided_at = EXCLUDED.decided_at,
           decided_by = EXCLUDED.decided_by`,
        [
          input.batch_id,
          input.tenant_id,
          finalStatus,
          JSON.stringify({ evaluated_at: decidedAt }),
          JSON.stringify(input.candidate_benchmark),
          decidedAt,
          input.decided_by,
        ]
      );

      // Record audit event
      await client.query(
        "SELECT gov.append_audit($1, $2, $3, $4::jsonb)",
        [
          `user:${input.decided_by}`,
          gatePassed ? "activate_learning_batch" : "reject_learning_batch",
          input.batch_id,
          JSON.stringify({
            gate_passed: gatePassed,
            rejection_reasons: rejectionReasons,
            metrics: input.candidate_benchmark,
          }),
        ]
      );

      await client.query("COMMIT");

      return {
        batch: {
          id: input.batch_id,
          tenant_id: input.tenant_id,
          status: finalStatus,
          updates: { evaluated_at: decidedAt },
          benchmark_result: input.candidate_benchmark,
          created_at: decidedAt,
          decided_at: decidedAt,
          decided_by: input.decided_by,
        },
        gate_passed: gatePassed,
        rejection_reasons: rejectionReasons.length > 0 ? rejectionReasons : undefined,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
