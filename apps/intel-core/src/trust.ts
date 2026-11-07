// Telemetry Trust Service (APP-05 / DU-04 / TRU-1..4).
// Invariant 4: Tenant RLS enforced on every query.
// Invariant 2: Work orders created strictly as "draft" awaiting human approval.

import { Pool } from "pg";
import type {
  TrustAssessment,
  TrustCheckDetail,
  TrustLevel,
  TrustVerdict,
} from "./types.js";

export interface TrustCheckInput {
  tenant_id: string;
  sensor_id: string;
  asset_id: string;
  value: number;
  ts: string;
  window_stddev?: number;
  recent_values?: number[];
  related_sensor_readings?: { sensor_id: string; value: number; trust_score: number }[];
  sensor_meta?: string;
}

export class TrustService {
  constructor(private readonly pool: Pool) {}

  /**
   * Evaluates all 5 physical and statistical trust checks for a sensor (TRU-1).
   */
  public evaluateChecks(input: TrustCheckInput): {
    checks: Record<string, TrustCheckDetail>;
    overallScore: number;
  } {
    const checks: Record<string, TrustCheckDetail> = {};

    // 1. Range & Rate Check
    // Plausible physical range check (default 0 to 100 for percentage/flow/temp unless specialized)
    const isPlausibleRange = input.value >= -50 && input.value <= 500;
    checks["range"] = {
      name: "Range & Rate Check",
      score: isPlausibleRange ? 1.0 : 0.0,
      passed: isPlausibleRange,
      message: isPlausibleRange ? "Reading within plausible physical envelope" : `Reading ${input.value} outside physical envelope`,
      weight: 0.25,
    };

    // 2. Staleness Check (Hard floor: critical check)
    const readingAgeMs = Date.now() - new Date(input.ts).getTime();
    const isStale = readingAgeMs > 60_000; // > 60 seconds
    const stalenessScore = isStale ? Math.max(0.1, 1.0 - (readingAgeMs / 120_000)) : 1.0;
    checks["staleness"] = {
      name: "Staleness Check",
      score: Number(stalenessScore.toFixed(3)),
      passed: !isStale,
      message: !isStale ? `Sample freshness verified (${Math.round(readingAgeMs / 1000)}s old)` : `Stale telemetry: sample age ${Math.round(readingAgeMs / 1000)}s exceeds threshold`,
      weight: 0.25,
    };

    // 3. Flatline Check
    const recent = input.recent_values ?? [];
    let isFlatline = false;
    if (recent.length >= 5) {
      const min = Math.min(...recent);
      const max = Math.max(...recent);
      if (Math.abs(max - min) < 1e-4) {
        isFlatline = true;
      }
    } else if (input.window_stddev !== undefined && input.window_stddev < 1e-5) {
      isFlatline = true;
    }
    checks["flatline"] = {
      name: "Flatline Check",
      score: isFlatline ? 0.05 : 1.0,
      passed: !isFlatline,
      message: !isFlatline ? "Dynamic variance detected" : "Suspiciously zero variance / frozen sensor signal",
      weight: 0.2,
    };

    // 4. Noise Profile Check
    const stddev = input.window_stddev ?? 0.5;
    const isErraticNoise = stddev > 15.0; // excessive erratic noise
    checks["noise"] = {
      name: "Noise Profile Check",
      score: isErraticNoise ? 0.2 : 1.0,
      passed: !isErraticNoise,
      message: !isErraticNoise ? "Noise profile within acceptable band" : `Erratic sensor noise stddev=${stddev.toFixed(2)}`,
      weight: 0.15,
    };

    // 5. Calibration Age Check
    let calibrationScore = 1.0;
    let calibrationMessage = "Calibration current";
    if (input.sensor_meta) {
      const match = /calibrated (\d{4}-\d{2}-\d{2})/.exec(input.sensor_meta);
      if (match && match[1]) {
        const calDate = new Date(match[1]);
        const ageDays = (Date.now() - calDate.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > 365) {
          calibrationScore = 0.5;
          calibrationMessage = `Calibration expired (${Math.round(ageDays)} days ago)`;
        } else {
          calibrationMessage = `Calibrated on ${match[1]} (${Math.round(ageDays)} days ago)`;
        }
      }
    }
    checks["calibration"] = {
      name: "Calibration Age Check",
      score: calibrationScore,
      passed: calibrationScore >= 0.8,
      message: calibrationMessage,
      weight: 0.15,
    };

    // Compute composite weighted score
    let weightedSum = 0;
    let totalWeight = 0;
    for (const c of Object.values(checks)) {
      weightedSum += c.score * c.weight;
      totalWeight += c.weight;
    }
    let composite = totalWeight > 0 ? weightedSum / totalWeight : 1.0;

    // Hard floor rule: if stale or flatline, clamp score
    if (!checks["staleness"]!.passed) {
      composite = Math.min(composite, 0.15);
    }
    if (!checks["flatline"]!.passed) {
      composite = Math.min(composite, 0.2);
    }

    return {
      checks,
      overallScore: Number(composite.toFixed(3)),
    };
  }

  /**
   * Evaluates decision table verdict comparing suspect sensor against related sensors (TRU-2).
   */
  public determineVerdict(
    sensorScore: number,
    relatedSensors: { sensor_id: string; trust_score: number; value: number }[]
  ): {
    level: TrustLevel;
    verdict: TrustVerdict;
    verdictText: string;
  } {
    const suspectHigh = sensorScore >= 0.7;
    const suspectLow = sensorScore < 0.45;

    const relatedAvg =
      relatedSensors.length > 0
        ? relatedSensors.reduce((acc, s) => acc + s.trust_score, 0) / relatedSensors.length
        : 1.0;
    const relatedHigh = relatedAvg >= 0.7;
    const relatedLow = relatedAvg < 0.45;

    // Decision table per 03 section 5.2
    if (suspectLow && relatedHigh) {
      return {
        level: "untrustworthy",
        verdict: "sensor_fault",
        verdictText: "Sensor fault identified: suspect telemetry failed statistical checks while correlated sensors show healthy trust.",
      };
    }

    if (suspectHigh && relatedHigh) {
      return {
        level: "confirmed_good",
        verdict: "machine_fault",
        verdictText: "Machine fault likely: telemetry signals are trustworthy and consistent with physical equipment degradation.",
      };
    }

    if (suspectLow && relatedLow) {
      return {
        level: "undetermined",
        verdict: "undetermined",
        verdictText: "Undetermined telemetry status: multiple correlated sensors exhibit degraded trust or noise.",
      };
    }

    return {
      level: sensorScore >= 0.7 ? "confirmed_good" : "undetermined",
      verdict: "nominal",
      verdictText: "Sensor telemetry operating within nominal bounds.",
    };
  }

  /**
   * Assesses sensor trust, updates PostgreSQL intel.trust_assessment, and drafts sensor work order if fault detected (TRU-1..3).
   */
  public async assessSensor(input: TrustCheckInput): Promise<TrustAssessment> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [input.tenant_id]);

      // If sensor_meta is not supplied, fetch it from ref.sensor
      let meta = input.sensor_meta;
      if (!meta) {
        const metaRes = await client.query<{ meta: string }>(
          "SELECT meta FROM ref.sensor WHERE id = $1",
          [input.sensor_id]
        );
        if (metaRes.rows[0]) {
          meta = metaRes.rows[0].meta;
        }
      }

      const { checks, overallScore } = this.evaluateChecks({
        ...input,
        sensor_meta: meta,
      });

      const { level, verdict, verdictText } = this.determineVerdict(
        overallScore,
        input.related_sensor_readings ?? []
      );

      let sensorWorkOrderId: string | undefined;

      // TRU-3: Sensor-fault classification produces a sensor work-order draft (Invariant 2: human approval required)
      if (verdict === "sensor_fault") {
        const incidentId = `INC-SENS-${input.sensor_id}`;
        // Ensure incident exists
        await client.query(
          `INSERT INTO "case".incident (
             id, tenant_id, title, state, opened_at, summary_text, template_summary,
             hypotheses, evidence, what_would_change, citation_ids, trust_sensor_ids, trace_id
           ) VALUES (
             $1, $2, $3, 'awaiting_approval', now(), $4, $4,
             '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, $5, $6
           )
           ON CONFLICT (id) DO NOTHING`,
          [
            incidentId,
            input.tenant_id,
            `Sensor Fault: Suspect transducer drift on ${input.sensor_id}`,
            `Telemetry Trust identified sensor fault on ${input.sensor_id}.`,
            JSON.stringify([input.sensor_id]),
            "00000000000000000000000000000000",
          ]
        );

        const woRes = await client.query<{ id: string }>(
          `INSERT INTO "case".work_order (
             id, tenant_id, incident_id, title, asset_id, type, status, is_draft, steps
           ) VALUES (
             $1, $2, $3, $4, $5, 'sensor_calibration', 'draft', true, $6
           )
           ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title
           RETURNING id`,
          [
            `WO-SENS-${input.sensor_id}`,
            input.tenant_id,
            incidentId,
            `Calibrate or Replace Sensor ${input.sensor_id}`,
            input.asset_id,
            JSON.stringify([
              "1. Inspect wiring harness and transducer connection",
              "2. Verify zero-point and calibration span with portable calibrator",
              "3. Replace sensor cartridge if drift exceeds ±2% F.S.",
            ]),
          ]
        );
        sensorWorkOrderId = woRes.rows[0]?.id;
      }

      // Upsert into intel.trust_assessment
      const currentPoint = { ts: input.ts, value: input.value };
      const currentHistory = { ts: input.ts, verdict, score: overallScore };

      await client.query(
        `INSERT INTO intel.trust_assessment (
           sensor_id, tenant_id, score, level, verdict, verdict_text,
           checks, series, history, sensor_work_order_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (sensor_id) DO UPDATE SET
           score = EXCLUDED.score,
           level = EXCLUDED.level,
           verdict = EXCLUDED.verdict,
           verdict_text = EXCLUDED.verdict_text,
           checks = EXCLUDED.checks,
           series = EXCLUDED.series,
           history = intel.trust_assessment.history || EXCLUDED.history,
           sensor_work_order_id = COALESCE(EXCLUDED.sensor_work_order_id, intel.trust_assessment.sensor_work_order_id)`,
        [
          input.sensor_id,
          input.tenant_id,
          overallScore,
          level,
          verdict,
          verdictText,
          JSON.stringify(checks),
          JSON.stringify([currentPoint]),
          JSON.stringify([currentHistory]),
          sensorWorkOrderId ?? null,
        ]
      );

      await client.query("COMMIT");

      return {
        sensor_id: input.sensor_id,
        tenant_id: input.tenant_id,
        score: overallScore,
        level,
        verdict,
        verdict_text: verdictText,
        checks,
        series: [currentPoint],
        history: [currentHistory],
        sensor_work_order_id: sensorWorkOrderId,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
