// Line-Impact Prioritisation Service (APP-06 / DU-04 / LIM-1..5).
// Invariant 4: Tenant RLS enforced on every query.

import { Pool } from "pg";
import type { AlertEnvelope, LineImpactAssessment, StationNode } from "./types.js";

export interface LineTopology {
  lineId: string;
  name: string;
  nominalTaktSeconds: number;
  stations: StationNode[];
}

export class LineImpactService {
  // Pre-configured baseline topology for the factory line (LIM-1)
  private readonly lineTopologies: Map<string, LineTopology> = new Map([
    [
      "line-body-1",
      {
        lineId: "line-body-1",
        name: "Body Shop Line 1",
        nominalTaktSeconds: 45, // 80 units/hour
        stations: [
          { id: "st-press1", name: "Stamping Press 1", lineId: "line-body-1", cycleTimeSeconds: 40, bufferCapacityUnits: 20 },
          { id: "st-weld2", name: "Robotic Framing 2", lineId: "line-body-1", cycleTimeSeconds: 42, bufferCapacityUnits: 15 },
          { id: "st-cell3", name: "Sub-assembly Cell 3", lineId: "line-body-1", cycleTimeSeconds: 45, bufferCapacityUnits: 18 },
          { id: "st-cell4", name: "Weld Cell 4", lineId: "line-body-1", cycleTimeSeconds: 45, bufferCapacityUnits: 29 }, // 22-min buffer to QGate
          { id: "st-qgate", name: "Inline Quality Gate", lineId: "line-body-1", cycleTimeSeconds: 50, bufferCapacityUnits: 12, isBottleneck: true },
          { id: "st-paint", name: "Paint Shop Transfer", lineId: "line-body-1", cycleTimeSeconds: 46, bufferCapacityUnits: 0 },
        ],
      },
    ],
  ]);

  constructor(private readonly pool: Pool) {}

  /**
   * Returns line topology or a synthesized default if not explicitly registered (LIM-1).
   */
  public getTopology(lineId: string): LineTopology {
    const existing = this.lineTopologies.get(lineId);
    if (existing) return existing;

    return {
      lineId,
      name: `Production Line ${lineId}`,
      nominalTaktSeconds: 45,
      stations: [
        { id: "st-cell3", name: "Station Upstream", lineId, cycleTimeSeconds: 45, bufferCapacityUnits: 15 },
        { id: "st-cell4", name: "Weld Cell 4", lineId, cycleTimeSeconds: 45, bufferCapacityUnits: 29 },
        { id: "st-qgate", name: "Quality Gate", lineId, cycleTimeSeconds: 50, bufferCapacityUnits: 10, isBottleneck: true },
      ],
    };
  }

  /**
   * Calculates buffer starvation time and lost good units over a 60-min horizon (LIM-2).
   */
  public calculateStationImpact(
    lineId: string,
    stationId: string,
    severity: "warning" | "critical"
  ): {
    starvationTimeMinutes: number;
    bottleneckStationId: string;
    lostUnitsEstimate: number;
    throughputAtRiskPct: number;
    cascadePath: string[];
    confidence: number;
  } {
    const topo = this.getTopology(lineId);
    const stationIndex = topo.stations.findIndex((s) => s.id === stationId);
    const fallbackStation: StationNode = {
      id: stationId,
      name: stationId,
      lineId,
      cycleTimeSeconds: topo.nominalTaktSeconds,
      bufferCapacityUnits: 15,
    };
    const station = (stationIndex >= 0 ? topo.stations[stationIndex] : topo.stations[0]) ?? fallbackStation;

    // Find line bottleneck (station with longest cycle time)
    const bottleneck = topo.stations.reduce((prev, curr) =>
      curr.cycleTimeSeconds > prev.cycleTimeSeconds ? curr : prev
    );

    // Calculate buffer time to downstream station
    // buffer capacity * cycle time in seconds / 60 = buffer minutes
    const starvationTimeMinutes = Number(
      ((station.bufferCapacityUnits * station.cycleTimeSeconds) / 60).toFixed(1)
    );

    // Compute cascade path
    const cascadePath: string[] = [];
    for (let i = stationIndex; i < topo.stations.length; i++) {
      cascadePath.push(topo.stations[i]!.id);
    }

    // Impact simulation over 60-minute prediction horizon
    const horizonMinutes = 60;
    const nominalUnitsPerHour = (3600 / topo.nominalTaktSeconds);
    const slowdownFactor = severity === "critical" ? 1.0 : 0.45; // Critical = total stoppage; Warning = 45% derating

    const unbufferedDurationMinutes = Math.max(0, horizonMinutes - starvationTimeMinutes);
    const lostUnits = Math.round(
      (unbufferedDurationMinutes / 60) * nominalUnitsPerHour * slowdownFactor
    );

    const throughputAtRiskPct = Number(
      Math.min(100, (lostUnits / nominalUnitsPerHour) * 100).toFixed(1)
    );

    const confidence = severity === "critical" ? 0.92 : 0.82;

    return {
      starvationTimeMinutes,
      bottleneckStationId: bottleneck.id,
      lostUnitsEstimate: lostUnits,
      throughputAtRiskPct,
      cascadePath,
      confidence,
    };
  }

  /**
   * Prioritizes and ranks the open alert queue by predicted lost good units (LIM-3).
   */
  public rankAlertQueue(alerts: AlertEnvelope[]): (AlertEnvelope & { impactAssessment: LineImpactAssessment })[] {
    const assessed = alerts.map((alert) => {
      // Extract station_id from alert or default to cell4
      const stationId = alert.sensor_id.includes("FT") || alert.sensor_id.includes("TT") ? "st-cell4" : "st-cell3";
      const impact = this.calculateStationImpact(alert.line_id, stationId, alert.severity);

      const assessment: LineImpactAssessment = {
        line_id: alert.line_id,
        tenant_id: alert.tenant_id,
        station_id: stationId,
        starvation_time_minutes: impact.starvationTimeMinutes,
        bottleneck_station_id: impact.bottleneckStationId,
        lost_units_estimate: impact.lostUnitsEstimate,
        throughput_at_risk_pct: impact.throughputAtRiskPct,
        cascade_path: impact.cascadePath,
        confidence: impact.confidence,
        rank: 1, // Will be set after sorting
      };

      return {
        ...alert,
        impactAssessment: assessment,
      };
    });

    // Rank descending by lost units, then by confidence, breaking ties by lead time
    assessed.sort((a, b) => {
      if (b.impactAssessment.lost_units_estimate !== a.impactAssessment.lost_units_estimate) {
        return b.impactAssessment.lost_units_estimate - a.impactAssessment.lost_units_estimate;
      }
      if (b.impactAssessment.confidence !== a.impactAssessment.confidence) {
        return b.impactAssessment.confidence - a.impactAssessment.confidence;
      }
      return a.lead_time.hours - b.lead_time.hours;
    });

    // Assign final ranks
    assessed.forEach((item, idx) => {
      item.impactAssessment.rank = idx + 1;
      item.rank = idx + 1;
    });

    return assessed;
  }

  /**
   * Persists line impact calculation into PostgreSQL intel.line_impact under tenant RLS (LIM-4).
   */
  public async persistLineImpact(assessment: LineImpactAssessment): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [assessment.tenant_id]);

      await client.query(
        `INSERT INTO intel.line_impact (
           line_id, tenant_id, cascade, station_impact
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (line_id) DO UPDATE SET
           cascade = EXCLUDED.cascade,
           station_impact = EXCLUDED.station_impact`,
        [
          assessment.line_id,
          assessment.tenant_id,
          JSON.stringify({
            cascade_path: assessment.cascade_path,
            starvation_time_minutes: assessment.starvation_time_minutes,
            bottleneck_station_id: assessment.bottleneck_station_id,
          }),
          JSON.stringify({
            station_id: assessment.station_id,
            lost_units_estimate: assessment.lost_units_estimate,
            throughput_at_risk_pct: assessment.throughput_at_risk_pct,
            confidence: assessment.confidence,
            calculated_at: new Date().toISOString(),
          }),
        ]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
