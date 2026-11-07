import { describe, it, expect } from "vitest";
import {
  scenarioCatalog,
  nominalScenario,
  coolantDegradationScenario,
  bearingVibrationScenario,
  cncMachiningLineScenario,
} from "./scenarios.js";

describe("Simulator Scenario Generator", () => {
  it("provides valid catalog of scenarios", () => {
    expect(scenarioCatalog.nominal).toBeDefined();
    expect(scenarioCatalog.coolant_degradation).toBeDefined();
    expect(scenarioCatalog.bearing_vibration_spike).toBeDefined();
    expect(scenarioCatalog.cnc_machining_line).toBeDefined();
  });

  it("generates nominal scenario without any anomalies", () => {
    const now = new Date();
    for (let tick = 0; tick < 10; tick++) {
      const messages = nominalScenario.generateTick(tick, now);
      expect(messages.length).toBe(3); // FT-401, TT-402, IT-405
      for (const m of messages) {
        expect(m.groundTruth.is_anomaly).toBe(false);
        expect(m.payload.quality_flag).toBe("good");
        expect(m.payload.value).toBeGreaterThan(0);
        expect(m.topic).toMatch(/^fp\/v1\/t-demo\/site-a\/line-body-1\/st-cell4\/as-wc4-coolant\/telemetry$/);
      }
    }
  });

  it("generates coolant_degradation scenario with progressive drift and threshold breach", () => {
    const now = new Date();
    // Early ticks are nominal
    const early = coolantDegradationScenario.generateTick(0, now);
    const earlyFlow = early.find((m) => m.payload.sensor_id === "FT-401")!;
    expect(earlyFlow.groundTruth.is_anomaly).toBe(false);
    expect(earlyFlow.payload.value).toBeGreaterThan(20);

    // Later ticks (tick 35) breach critical low flow
    const late = coolantDegradationScenario.generateTick(35, now);
    const lateFlow = late.find((m) => m.payload.sensor_id === "FT-401")!;
    expect(lateFlow.groundTruth.is_anomaly).toBe(true);
    expect(lateFlow.groundTruth.anomaly_type).toBe("threshold_low");
    expect(lateFlow.groundTruth.expected_severity).toBe("critical");
    expect(lateFlow.payload.value).toBeLessThan(12.0);

    // Later temperature breaches critical high
    const lateTemp = late.find((m) => m.payload.sensor_id === "TT-402")!;
    expect(lateTemp.groundTruth.is_anomaly).toBe(true);
    expect(lateTemp.groundTruth.anomaly_type).toBe("threshold_high");
    expect(lateTemp.groundTruth.expected_severity).toBe("critical");
    expect(lateTemp.payload.value).toBeGreaterThan(65.0);
  });

  it("generates bearing vibration spike anomaly starting at tick 12", () => {
    const now = new Date();
    const beforeSpike = bearingVibrationScenario.generateTick(5, now)[0]!;
    expect(beforeSpike.groundTruth.is_anomaly).toBe(false);
    expect(beforeSpike.payload.value).toBeLessThan(2.0);

    const duringSpike = bearingVibrationScenario.generateTick(15, now)[0]!;
    expect(duringSpike.groundTruth.is_anomaly).toBe(true);
    expect(duringSpike.groundTruth.anomaly_type).toBe("threshold_high");
    expect(duringSpike.groundTruth.expected_severity).toBe("critical");
    expect(duringSpike.payload.value).toBeGreaterThan(4.5);
  });

  it("generates 30 signals for 10 CNC machines with M-05 & M-09 stoppages in cnc_machining_line scenario", () => {
    const now = new Date();
    const messages = cncMachiningLineScenario.generateTick(0, now);

    // 10 machines * 3 sensors = 30 messages per tick
    expect(messages).toHaveLength(30);

    // All topics belong to SITE-DEMO / LINE-01
    for (const m of messages) {
      expect(m.topic).toMatch(/^fp\/v1\/t-demo\/SITE-DEMO\/LINE-01\/ST-\d{2}\/M-\d{2}\/telemetry$/);
      expect(m.payload.quality_flag).toBe("good");
    }

    // M-05 Spindle Speed stoppage verification
    const m5Speed = messages.find((m) => m.payload.sensor_id === "S-05-SPD")!;
    expect(m5Speed).toBeDefined();
    expect(m5Speed.payload.value).toBe(4.2);
    expect(m5Speed.groundTruth.is_anomaly).toBe(true);
    expect(m5Speed.groundTruth.anomaly_type).toBe("threshold_low");
    expect(m5Speed.groundTruth.expected_severity).toBe("critical");

    // M-09 Spindle Speed stoppage verification
    const m9Speed = messages.find((m) => m.payload.sensor_id === "S-09-SPD")!;
    expect(m9Speed).toBeDefined();
    expect(m9Speed.payload.value).toBe(10.8);
    expect(m9Speed.groundTruth.is_anomaly).toBe(true);
    expect(m9Speed.groundTruth.anomaly_type).toBe("threshold_low");
    expect(m9Speed.groundTruth.expected_severity).toBe("critical");

    // M-04 Bottleneck machine verification (nominal operation)
    const m4Speed = messages.find((m) => m.payload.sensor_id === "S-04-SPD")!;
    expect(m4Speed).toBeDefined();
    expect(m4Speed.payload.value).toBeGreaterThan(5500);
    expect(m4Speed.groundTruth.is_anomaly).toBe(false);
  });
});

