// The cnc_machining_line scenario against the plant topology template it replays (SIM-1, ING-7).
import { describe, it, expect } from "vitest";
import { cncMachiningLineTopology as topology } from "@fp/synthetic-data";
import { cncMachiningLineScenario, STUCK_SENSOR, SILENT_SENSOR, SILENT_FROM_TICK } from "./scenarios.js";

const line = topology.lines[0]!;
const machines = line.stations.flatMap((s) => s.machines.map((m) => ({ station: s, machine: m })));
const sensors = new Map(machines.flatMap(({ machine }) => machine.sensors.map((s) => [s.sensor_id, { sensor: s, machine }] as const)));
const ticks = Array.from({ length: cncMachiningLineScenario.totalTicks }, (_, k) => cncMachiningLineScenario.generateTick(k, new Date(0)));

describe("cnc_machining_line scenario against the topology", () => {
  it("only publishes sensors that exist in the topology, on their machine's station topic", () => {
    for (const msgs of ticks) {
      for (const m of msgs) {
        const entry = sensors.get(m.payload.sensor_id);
        expect(entry, m.payload.sensor_id).toBeDefined();
        const station = machines.find(({ machine }) => machine === entry!.machine)!.station;
        expect(m.topic).toBe(`fp/v1/t-demo/${topology.site.site_id}/${line.line_id}/${station.station_id}/${entry!.machine.machine_id}/telemetry`);
      }
    }
  });

  it("keeps running machines' healthy sensors inside the normal range on every tick", () => {
    for (const msgs of ticks) {
      for (const m of msgs.filter((x) => !x.groundTruth.is_anomaly)) {
        const { sensor, machine } = sensors.get(m.payload.sensor_id)!;
        if (["M-05", "M-09"].includes(machine.machine_id)) continue; // stopped machines: residual readings
        expect(m.payload.value, m.payload.sensor_id).toBeGreaterThanOrEqual(sensor.normal_range.min);
        expect(m.payload.value, m.payload.sensor_id).toBeLessThanOrEqual(sensor.normal_range.max);
      }
    }
  });

  it("stops M-05 and M-09 below their own mode rule", () => {
    for (const msgs of ticks) {
      for (const id of ["S-05-SPD", "S-09-SPD"]) {
        const m = msgs.find((x) => x.payload.sensor_id === id)!;
        const { machine } = sensors.get(id)!;
        expect(m.groundTruth).toMatchObject({ is_anomaly: true, anomaly_type: "threshold_low" });
        expect(m.payload.value).toBeLessThan(machine.operating_profile.mode_rules.stopped_below);
      }
    }
  });

  it("flags only the two stopped machines and the stuck sensor", () => {
    for (const msgs of ticks) {
      expect(msgs.filter((m) => m.groundTruth.is_anomaly).map((m) => m.payload.sensor_id).sort()).toEqual(["S-05-SPD", "S-09-SPD", STUCK_SENSOR].sort());
    }
  });

  it("freezes the stuck sensor at one value while its machine runs", () => {
    const values = new Set(ticks.map((msgs) => msgs.find((m) => m.payload.sensor_id === STUCK_SENSOR)!.payload.value));
    expect(values.size).toBe(1);
    expect(ticks[0]!.find((m) => m.payload.sensor_id === STUCK_SENSOR)!.groundTruth.anomaly_type).toBe("flatline");
  });

  it("silences one sensor from its failure tick onwards", () => {
    ticks.forEach((msgs, tick) => {
      const present = msgs.some((m) => m.payload.sensor_id === SILENT_SENSOR);
      expect(present, `tick ${tick}`).toBe(tick < SILENT_FROM_TICK);
      expect(msgs).toHaveLength(tick < SILENT_FROM_TICK ? 30 : 29);
    });
  });

  it("is deterministic for the same tick and start time", () => {
    expect(cncMachiningLineScenario.generateTick(7, new Date(0))).toEqual(cncMachiningLineScenario.generateTick(7, new Date(0)));
  });
});
