// Integration test for DetectionService (APP-04 / DU-04).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Kafka } from "kafkajs";
import { config, appPool } from "@fp/db";
import { DetectionService } from "./detector.js";
import type { TelemetryFeatureEnvelope, AlertEnvelope } from "./types.js";

const cfg = config();
const pool = appPool(cfg);
const detector = new DetectionService(cfg, pool);

beforeAll(async () => {
  await detector.start({ groupId: `test-det-${Date.now()}` });
});

afterAll(async () => {
  await detector.stop();
  await pool.end();
});

describe("DetectionService integration (APP-04)", () => {
  it(
    "detects threshold breach, persists alert in PostgreSQL intel.alert, and emits to Kafka with traceparent",
    async () => {
      const kafka = new Kafka({
        clientId: "test-alert-verifier",
        brokers: cfg.kafka.brokers,
      });
      const consumer = kafka.consumer({ groupId: `test-ag-${Date.now()}` });
      await consumer.connect();
      // Latest offset only: replaying earlier runs from the beginning can outlast the wait.
      await consumer.subscribe({ topic: cfg.kafka.alerts_topic, fromBeginning: false });

      const receivedAlerts: AlertEnvelope[] = [];
      const joinedPromise = new Promise<void>((resolve) => {
        consumer.on(consumer.events.GROUP_JOIN, () => resolve());
      });

      await consumer.run({
        eachMessage: async ({ message }) => {
          if (message.value) {
            receivedAlerts.push(JSON.parse(message.value.toString("utf8")));
          }
        },
      });

      await joinedPromise;

      const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
      const criticalFeature: TelemetryFeatureEnvelope = {
        tenant_id: "t-demo",
        site_id: "site-a",
        line_id: "line-body-1",
        station_id: "st-cell4",
        asset_id: "as-wc4-coolant",
        sensor_id: "FT-401",
        ts: new Date().toISOString(),
        value: 10.4, // Critical low (< 12.0)
        quality_flag: "good",
        traceparent,
        window: {
          count: 10,
          mean: 14.0,
          min: 10.4,
          max: 18.0,
          stddev: 2.2,
        },
      };

      const alert = await detector.processFeature(criticalFeature);
      expect(alert).not.toBeNull();
      expect(alert!.severity).toBe("critical");
      expect(alert!.detail).toContain("dropped to 10.4 L/min");
      expect(alert!.traceparent).toBe(traceparent);

      // Verify written to PostgreSQL intel.alert
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");
        const res = await client.query<{ id: string; detail: string; status: string }>(
          "SELECT id, detail, status FROM intel.alert WHERE id = $1",
          [alert!.id]
        );
        await client.query("COMMIT");
        expect(res.rows.length).toBe(1);
        expect(res.rows[0]!.status).toBe("open");
        expect(res.rows[0]!.detail).toContain("dropped to 10.4 L/min");
      } finally {
        client.release();
      }

      // Wait for Kafka alert emission
      const start = Date.now();
      while (
        !receivedAlerts.some((a) => a.id === alert!.id) &&
        Date.now() - start < 5000
      ) {
        await new Promise((r) => setTimeout(r, 200));
      }

      await consumer.disconnect();
      expect(receivedAlerts.length).toBeGreaterThanOrEqual(1);
      const kafkaAlert = receivedAlerts.find((a) => a.id === alert!.id);
      expect(kafkaAlert).toBeDefined();
      expect(kafkaAlert!.traceparent).toBe(traceparent);
      expect(kafkaAlert!.severity).toBe("critical");

      // Verify deduplication
      const duplicateAlert = await detector.processFeature(criticalFeature);
      expect(duplicateAlert).toBeNull();
    },
    15000
  );
});
