// Integration test for SimulatorPublisher (SIM-1).
import { describe, it, expect, afterAll } from "vitest";
import mqtt from "mqtt";
import { config } from "@fp/db";
import { SimulatorPublisher } from "./publisher.js";
import { nominalScenario } from "./scenarios.js";

const cfg = config();

describe("SimulatorPublisher integration", () => {
  const publisher = new SimulatorPublisher(cfg);

  afterAll(async () => {
    await publisher.disconnect();
  });

  it("publishes ticks to Mosquitto broker", async () => {
    // Subscribe to test topic
    const subscriber = mqtt.connect(cfg.mqtt.url);
    await new Promise<void>((resolve) => subscriber.on("connect", () => resolve()));

    const received: string[] = [];
    subscriber.subscribe("fp/v1/t-demo/site-a/line-body-1/st-cell4/as-wc4-coolant/telemetry", { qos: 1 });
    subscriber.on("message", (_topic, msg) => {
      received.push(msg.toString());
    });

    // Run 2 ticks with 50ms interval
    const result = await publisher.runScenario(nominalScenario, {
      maxTicks: 2,
      tickIntervalMs: 50,
    });

    expect(result.totalTicks).toBe(2);
    expect(result.totalMessages).toBe(6); // 3 sensors * 2 ticks

    // Wait 500ms for MQTT receipt
    const start = Date.now();
    while (received.length < 6 && Date.now() - start < 2000) {
      await new Promise((r) => setTimeout(r, 100));
    }

    subscriber.end();
    expect(received.length).toBeGreaterThanOrEqual(6);
    const parsed = JSON.parse(received[0]!);
    expect(parsed.sensor_id).toBeDefined();
    expect(parsed.value).toBeDefined();
  });
});
