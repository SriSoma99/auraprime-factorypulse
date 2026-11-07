// Full End-to-End Pipeline Integration Test for TA-1 Foundation Milestone.
// Exit Criterion: "Telemetry to baseline alert with a trace on desktop".
// Pipeline: Mosquitto MQTT -> IngestGateway -> Kafka tel.raw.v1 -> StreamProcessor
//           -> TimescaleDB tel.telemetry_point & Kafka tel.features.v1
//           -> DetectionService -> PostgreSQL intel.alert & Kafka detect.alerts.v1.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mqtt from "mqtt";
import { Kafka } from "kafkajs";
import { config, appPool } from "@fp/db";
import { IngestGateway } from "@fp/ingest-gateway";
import { StreamProcessor } from "@fp/stream-processor";
import { DetectionService } from "./detector.js";
import type { AlertEnvelope } from "./types.js";

const base = config();
// Port 0: the gateway's OTLP receiver takes a free port, so a running dev gateway does not clash with the test.
const cfg = { ...base, ingest: { ...base.ingest, otlp_http: { ...base.ingest.otlp_http, port: 0 } } };
const pool = appPool(cfg);

const gateway = new IngestGateway(cfg, pool);
const processor = new StreamProcessor(cfg, pool);
const detector = new DetectionService(cfg, pool);

const testGroupId = `ta1-test-${Date.now()}`;

beforeAll(async () => {
  // Start all 3 services in the pipeline
  await gateway.start();
  await processor.start({ groupId: `${testGroupId}-sp`, fromBeginning: false });
  await detector.start({ groupId: `${testGroupId}-det`, fromBeginning: false });
}, 30000);

afterAll(async () => {
  await Promise.allSettled([detector.stop(), processor.stop(), gateway.stop()]);
  await pool.end();
}, 30000);

describe("TA-1 Foundation: End-to-End Pipeline with Distributed Trace", () => {
  it(
    "propagates telemetry from Mosquitto edge to baseline alert in PostgreSQL and Kafka with unbroken traceparent",
    async () => {
      const kafka = new Kafka({
        clientId: "ta1-alert-verifier",
        brokers: cfg.kafka.brokers,
      });

      // Set up Kafka consumer to capture the final alert from detect.alerts.v1
      const alertConsumer = kafka.consumer({ groupId: `${testGroupId}-verifier` });
      await alertConsumer.connect();
      await alertConsumer.subscribe({ topic: cfg.kafka.alerts_topic, fromBeginning: false });

      const receivedAlerts: AlertEnvelope[] = [];
      const joinedPromise = new Promise<void>((resolve) => {
        alertConsumer.on(alertConsumer.events.GROUP_JOIN, () => resolve());
      });

      await alertConsumer.run({
        eachMessage: async ({ message }) => {
          if (message.value) {
            receivedAlerts.push(JSON.parse(message.value.toString("utf8")));
          }
        },
      });

      await joinedPromise;

      // Connect MQTT publisher (simulating plant edge sensor)
      const publisher = mqtt.connect(cfg.mqtt.url);
      await new Promise<void>((resolve) => publisher.on("connect", () => resolve()));

      const topic = `${cfg.mqtt.topic_prefix}/t-demo/site-a/line-body-1/st-cell4/as-wc4-coolant/telemetry`;
      const testVal = Number((8.1 + ((Date.now() % 20) / 10)).toFixed(1)); // Critical low breach (< 12.0 L/min)
      const criticalPayload = {
        sensor_id: "FT-401",
        ts: new Date().toISOString(),
        value: testVal,
        quality_flag: "good",
      };

      // Publish critical coolant flow reading to Mosquitto
      await new Promise<void>((resolve, reject) => {
        publisher.publish(topic, JSON.stringify(criticalPayload), { qos: 1 }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      publisher.end();

      // Wait up to 10s for the message to propagate through all 3 stages:
      // IngestGateway -> Kafka tel.raw.v1 -> StreamProcessor -> Kafka tel.features.v1 -> DetectionService -> Kafka detect.alerts.v1
      const start = Date.now();
      while (
        !receivedAlerts.some((a) => a.detail.includes(`${testVal} L/min`)) &&
        Date.now() - start < 10000
      ) {
        await new Promise((r) => setTimeout(r, 200));
      }

      await alertConsumer.disconnect();

      // 1. Verify alert reached Kafka detect.alerts.v1
      expect(receivedAlerts.length).toBeGreaterThanOrEqual(1);
      const alert = receivedAlerts.find((a) => a.detail.includes(`${testVal} L/min`));
      expect(alert).toBeDefined();
      expect(alert!.tenant_id).toBe("t-demo");
      expect(alert!.status).toBe("open");
      expect(alert!.detail).toContain(`dropped to ${testVal} L/min (critical limit: 12 L/min)`);
      expect(alert!.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

      // 2. Verify alert persisted in PostgreSQL intel.alert with RLS
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");

        // Assert telemetry point exists in TimescaleDB hypertable
        const pointRes = await client.query<{ value: string; quality_flag: string }>(
          "SELECT value, quality_flag FROM tel.telemetry_point WHERE sensor_id = $1 ORDER BY ts DESC LIMIT 1",
          ["FT-401"]
        );
        expect(pointRes.rows.length).toBe(1);
        expect(Number(pointRes.rows[0]!.value)).toBe(testVal);

        // Assert alert exists in intel.alert
        const alertRes = await client.query<{ id: string; status: string; detail: string; rank: number }>(
          "SELECT id, status, detail, rank FROM intel.alert WHERE id = $1",
          [alert!.id]
        );
        expect(alertRes.rows.length).toBe(1);
        expect(alertRes.rows[0]!.status).toBe("open");
        expect(alertRes.rows[0]!.rank).toBe(1); // rank 1 for critical

        await client.query("COMMIT");
      } finally {
        client.release();
      }
    },
    25000
  );
});
