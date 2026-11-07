// Baseline scenarios for the Fault Injection Simulator (SIM-1, SIM-2).
import type { ScenarioDefinition, SimulatedMessage } from "./types.js";

const DEFAULT_TENANT = "t-demo";
const DEFAULT_SITE = "site-a";
const DEFAULT_LINE = "line-body-1";
const DEFAULT_STATION = "st-cell4";
const DEFAULT_ASSET = "as-wc4-coolant";

function topicFor(sensorId: string, asset = DEFAULT_ASSET, station = DEFAULT_STATION, line = DEFAULT_LINE, site = DEFAULT_SITE, tenant = DEFAULT_TENANT): string {
  return `fp/v1/${tenant}/${site}/${line}/${station}/${asset}/telemetry`;
}

export const nominalScenario: ScenarioDefinition = {
  id: "nominal",
  name: "Nominal Steady-State Operation",
  description: "Standard operating envelope for Weld Cell 4 coolant loop with normal small fluctuations",
  defaultTickIntervalMs: 1000,
  totalTicks: 60,
  generateTick: (tick: number, now: Date): SimulatedMessage[] => {
    const ts = new Date(now.getTime() + tick * 1000).toISOString();
    const noise = Math.sin(tick * 0.5) * 0.2;
    return [
      {
        topic: topicFor("FT-401"),
        payload: { sensor_id: "FT-401", ts, value: Number((24.0 + noise).toFixed(2)), quality_flag: "good" },
        groundTruth: { is_anomaly: false, description: "Nominal coolant flow (24 L/min)" },
      },
      {
        topic: topicFor("TT-402"),
        payload: { sensor_id: "TT-402", ts, value: Number((42.0 + noise * 0.5).toFixed(2)), quality_flag: "good" },
        groundTruth: { is_anomaly: false, description: "Nominal coolant return temp (42 °C)" },
      },
      {
        topic: topicFor("IT-405"),
        payload: { sensor_id: "IT-405", ts, value: Number((12.2 + noise * 0.1).toFixed(2)), quality_flag: "good" },
        groundTruth: { is_anomaly: false, description: "Nominal pump current (12.2 A)" },
      },
    ];
  },
};

export const coolantDegradationScenario: ScenarioDefinition = {
  id: "coolant_degradation",
  name: "Hero Scenario: Coolant Loop Flow Drop and Thermal Runaway",
  description: "Coolant flow drops steadily from 24 to 8 L/min, causing return temperature to surge past 65 °C",
  defaultTickIntervalMs: 1000,
  totalTicks: 40,
  generateTick: (tick: number, now: Date): SimulatedMessage[] => {
    const ts = new Date(now.getTime() + tick * 1000).toISOString();

    // Flow behavior:
    // Ticks 0-9: nominal (~24 L/min)
    // Ticks 10-39: linear drop from 24 to 8.0 L/min (crosses warning at 15.0, critical at 12.0)
    let flowValue = 24.0 + (Math.sin(tick) * 0.15);
    let flowIsAnomaly = false;
    let flowType: "drift" | "threshold_low" | undefined;
    let flowSeverity: "info" | "warning" | "critical" | undefined;

    if (tick >= 10) {
      const progress = Math.min((tick - 10) / 25, 1.0); // 0 to 1 over 25 ticks
      flowValue = 24.0 - progress * 16.0 + (Math.sin(tick) * 0.1);
      flowIsAnomaly = true;
      if (flowValue < 12.0) {
        flowType = "threshold_low";
        flowSeverity = "critical";
      } else if (flowValue < 15.0) {
        flowType = "threshold_low";
        flowSeverity = "warning";
      } else {
        flowType = "drift";
        flowSeverity = "info";
      }
    }

    // Temperature behavior:
    // Ticks 0-14: nominal (~42 °C)
    // Ticks 15-39: thermal rise lagging flow drop, up to 72 °C (crosses critical at 65 °C)
    let tempValue = 42.0 + (Math.cos(tick) * 0.1);
    let tempIsAnomaly = false;
    let tempType: "drift" | "threshold_high" | undefined;
    let tempSeverity: "info" | "warning" | "critical" | undefined;

    if (tick >= 15) {
      const progress = Math.min((tick - 15) / 20, 1.0);
      tempValue = 42.0 + progress * 30.0 + (Math.cos(tick) * 0.15);
      if (tempValue > 65.0) {
        tempIsAnomaly = true;
        tempType = "threshold_high";
        tempSeverity = "critical";
      } else if (tempValue > 55.0) {
        tempIsAnomaly = true;
        tempType = "threshold_high";
        tempSeverity = "warning";
      }
    }

    return [
      {
        topic: topicFor("FT-401"),
        payload: { sensor_id: "FT-401", ts, value: Number(flowValue.toFixed(2)), quality_flag: "good" },
        groundTruth: {
          is_anomaly: flowIsAnomaly,
          anomaly_type: flowType,
          expected_severity: flowSeverity,
          description: flowIsAnomaly ? `Flow degraded to ${flowValue.toFixed(1)} L/min` : "Nominal",
        },
      },
      {
        topic: topicFor("TT-402"),
        payload: { sensor_id: "TT-402", ts, value: Number(tempValue.toFixed(2)), quality_flag: "good" },
        groundTruth: {
          is_anomaly: tempIsAnomaly,
          anomaly_type: tempType,
          expected_severity: tempSeverity,
          description: tempIsAnomaly ? `Thermal surge to ${tempValue.toFixed(1)} °C` : "Nominal",
        },
      },
    ];
  },
};

export const bearingVibrationScenario: ScenarioDefinition = {
  id: "bearing_vibration_spike",
  name: "Drive Bearing Vibration Spike",
  description: "Conveyor C2 drive bearing vibration jumps from 0.8 mm/s to 5.4 mm/s at tick 12",
  defaultTickIntervalMs: 1000,
  totalTicks: 25,
  generateTick: (tick: number, now: Date): SimulatedMessage[] => {
    const ts = new Date(now.getTime() + tick * 1000).toISOString();
    const isSpike = tick >= 12;
    const value = isSpike
      ? Number((5.2 + Math.random() * 0.5).toFixed(2))
      : Number((0.8 + Math.random() * 0.1).toFixed(2));

    return [
      {
        topic: topicFor("VT-102", "as-conv-c2", "st-load"),
        payload: { sensor_id: "VT-102", ts, value, quality_flag: "good" },
        groundTruth: {
          is_anomaly: isSpike,
          anomaly_type: isSpike ? "threshold_high" : undefined,
          expected_severity: isSpike ? "critical" : undefined,
          description: isSpike ? `Bearing vibration spike at ${value} mm/s` : "Nominal vibration",
        },
      },
    ];
  },
};

/** Sensor faults in the CNC scenario: a frozen reading (flatline) and a sensor that goes silent (no data, then stale). */
export const STUCK_SENSOR = "S-03-VIB";
export const SILENT_SENSOR = "S-07-TMP";
export const SILENT_FROM_TICK = 10;

export const cncMachiningLineScenario: ScenarioDefinition = {
  id: "cnc_machining_line",
  name: "CNC Machining Line 10-Station Replay with M-05 & M-09 Stoppage",
  description:
    "Replays 10-station CNC mill line (SITE-DEMO / LINE-01). M-05 (Op 50) and M-09 (Op 90) are stopped (<100 rpm), cascading buffer blocking to ST-04 (bottleneck) and direct starvation to ST-10. " +
    `Two sensor faults: ${STUCK_SENSOR} freezes at one value, and ${SILENT_SENSOR} stops reporting from tick ${SILENT_FROM_TICK}.`,
  defaultTickIntervalMs: 1000,
  totalTicks: 30,
  generateTick: (tick: number, now: Date): SimulatedMessage[] => {
    const ts = new Date(now.getTime() + tick * 1000).toISOString();
    const noise = Math.sin(tick * 0.2);

    const machines = [
      { id: "M-01", st: "ST-01", spd: 5896.8, vib: 2.264, tmp: 47.0, stopped: false },
      { id: "M-02", st: "ST-02", spd: 6078.3, vib: 1.785, tmp: 49.1, stopped: false },
      { id: "M-03", st: "ST-03", spd: 5904.7, vib: 2.168, tmp: 47.5, stopped: false },
      { id: "M-04", st: "ST-04", spd: 6014.1, vib: 2.091, tmp: 48.8, stopped: false },
      { id: "M-05", st: "ST-05", spd: 4.2, vib: 0.062, tmp: 45.4, stopped: true, reason: "Op 50 stopped (4.2 rpm) - upstream buffer (4 min) will block bottleneck ST-04" },
      { id: "M-06", st: "ST-06", spd: 5950.7, vib: 2.268, tmp: 51.2, stopped: false },
      { id: "M-07", st: "ST-07", spd: 6008.6, vib: 2.031, tmp: 50.7, stopped: false },
      { id: "M-08", st: "ST-08", spd: 6145.2, vib: 1.977, tmp: 50.7, stopped: false },
      { id: "M-09", st: "ST-09", spd: 10.8, vib: 0.052, tmp: 37.2, stopped: true, reason: "Op 90 stopped (10.8 rpm) - immediate zero-buffer starvation on ST-10" },
      { id: "M-10", st: "ST-10", spd: 6110.0, vib: 2.067, tmp: 50.8, stopped: false },
    ];

    const messages: SimulatedMessage[] = [];

    for (const m of machines) {
      const num = m.id.split("-")[1];
      const speedVal = m.stopped ? m.spd : Number((m.spd + noise * 5.0).toFixed(1));
      const vibVal = m.stopped ? m.vib : Number((m.vib + noise * 0.05).toFixed(3));
      const tmpVal = m.stopped ? m.tmp : Number((m.tmp + noise * 0.2).toFixed(1));

      // Spindle Speed
      messages.push({
        topic: topicFor(`S-${num}-SPD`, m.id, m.st, "LINE-01", "SITE-DEMO"),
        payload: { sensor_id: `S-${num}-SPD`, ts, value: speedVal, quality_flag: "good" },
        groundTruth: {
          is_anomaly: m.stopped,
          anomaly_type: m.stopped ? "threshold_low" : undefined,
          expected_severity: m.stopped ? "critical" : undefined,
          description: m.stopped ? m.reason : `Nominal speed (${speedVal} rpm)`,
        },
      });

      // Spindle Vibration
      const vibId = `S-${num}-VIB`;
      const stuck = vibId === STUCK_SENSOR;
      messages.push({
        topic: topicFor(vibId, m.id, m.st, "LINE-01", "SITE-DEMO"),
        payload: { sensor_id: vibId, ts, value: stuck ? m.vib : vibVal, quality_flag: "good" },
        groundTruth: stuck
          ? { is_anomaly: true, anomaly_type: "flatline", expected_severity: "warning", description: `${vibId} frozen at ${m.vib} mm/s while the spindle runs (sensor fault)` }
          : { is_anomaly: false, description: m.stopped ? "Residual stopped vibration" : `Nominal vibration (${vibVal} mm/s)` },
      });

      // Spindle Temperature (the silent sensor publishes nothing once it has failed)
      if (`S-${num}-TMP` === SILENT_SENSOR && tick >= SILENT_FROM_TICK) continue;
      messages.push({
        topic: topicFor(`S-${num}-TMP`, m.id, m.st, "LINE-01", "SITE-DEMO"),
        payload: { sensor_id: `S-${num}-TMP`, ts, value: tmpVal, quality_flag: "good" },
        groundTruth: {
          is_anomaly: false,
          description: m.stopped ? "Cooled bearing temperature" : `Nominal temperature (${tmpVal} °C)`,
        },
      });
    }

    return messages;
  },
};

export const scenarioCatalog: Record<string, ScenarioDefinition> = {
  nominal: nominalScenario,
  coolant_degradation: coolantDegradationScenario,
  bearing_vibration_spike: bearingVibrationScenario,
  cnc_machining_line: cncMachiningLineScenario,
};

