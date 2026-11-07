// MQTT Publisher for the Telemetry Simulator (SIM-1).
import mqtt, { type MqttClient } from "mqtt";
import type { Config } from "@fp/config";
import type { ScenarioDefinition, SimulatedMessage } from "./types.js";

export interface PublishResult {
  totalTicks: number;
  totalMessages: number;
  anomaliesInjected: number;
}

export class SimulatorPublisher {
  private client: MqttClient | null = null;

  constructor(private readonly config: Config) {}

  public async connect(): Promise<void> {
    if (this.client) return;

    this.client = mqtt.connect(this.config.mqtt.url, {
      clientId: `sim-${Math.random().toString(16).slice(2, 8)}`,
      clean: true,
    });

    await new Promise<void>((resolve, reject) => {
      this.client!.once("connect", () => resolve());
      this.client!.once("error", (err) => reject(err));
    });
  }

  public async publishTick(messages: SimulatedMessage[]): Promise<void> {
    if (!this.client) {
      throw new Error("SimulatorPublisher is not connected to MQTT broker");
    }

    const promises = messages.map(
      (m) =>
        new Promise<void>((resolve, reject) => {
          this.client!.publish(
            m.topic,
            JSON.stringify(m.payload),
            { qos: 1 },
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        })
    );

    await Promise.all(promises);
  }

  public async runScenario(
    scenario: ScenarioDefinition,
    options: {
      tickIntervalMs?: number;
      maxTicks?: number;
      onTick?: (tick: number, messages: SimulatedMessage[]) => void;
    } = {}
  ): Promise<PublishResult> {
    await this.connect();

    const interval = options.tickIntervalMs ?? scenario.defaultTickIntervalMs;
    const ticksToRun = options.maxTicks ?? scenario.totalTicks;
    let totalMessages = 0;
    let anomaliesInjected = 0;
    const startTime = new Date();

    for (let tick = 0; tick < ticksToRun; tick++) {
      const messages = scenario.generateTick(tick, startTime);
      await this.publishTick(messages);

      totalMessages += messages.length;
      anomaliesInjected += messages.filter((m) => m.groundTruth.is_anomaly).length;

      if (options.onTick) {
        options.onTick(tick, messages);
      }

      if (tick < ticksToRun - 1 && interval > 0) {
        await new Promise((r) => setTimeout(r, interval));
      }
    }

    return {
      totalTicks: ticksToRun,
      totalMessages,
      anomaliesInjected,
    };
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      await new Promise<void>((resolve) => {
        this.client!.end(false, {}, () => resolve());
      });
      this.client = null;
    }
  }
}
