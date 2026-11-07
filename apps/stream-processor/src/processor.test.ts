// Integration test for StreamProcessor (APP-03 / DU-03).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Kafka } from "kafkajs";
import { config, appPool } from "@fp/db";
import { StreamProcessor } from "./processor.js";
import type { RawTelemetryEnvelope, TelemetryFeatureEnvelope } from "./types.js";

const cfg = config();
const pool = appPool(cfg);
const processor = new StreamProcessor(cfg, pool);

beforeAll(async () => {
  await processor.start({ groupId: `test-sp-${Date.now()}` });
});

afterAll(async () => {
  await processor.stop();
  await pool.end();
});

describe("StreamProcessor integration (APP-03)", () => {
  it(
    "writes point to TimescaleDB tel.telemetry_point and emits feature to Kafka",
    async () => {
      const kafka = new Kafka({
        clientId: "test-feature-consumer",
        brokers: cfg.kafka.brokers,
      });
      const consumer = kafka.consumer({ groupId: `test-fg-${Date.now()}` });
      await consumer.connect();
      // Latest offset only: replaying earlier runs from the beginning can outlast the wait.
      await consumer.subscribe({ topic: cfg.kafka.features_topic, fromBeginning: false });

      const receivedFeatures: TelemetryFeatureEnvelope[] = [];
      const joinedPromise = new Promise<void>((resolve) => {
        consumer.on(consumer.events.GROUP_JOIN, () => resolve());
      });

      await consumer.run({
        eachMessage: async ({ message }) => {
          if (message.value) {
            receivedFeatures.push(JSON.parse(message.value.toString("utf8")));
          }
        },
      });

      await joinedPromise;

      const insertTs = new Date().toISOString();
      const testEnvelope: RawTelemetryEnvelope = {
        tenant_id: "t-demo",
        site_id: "site-a",
        line_id: "line-body-1",
        station_id: "st-cell4",
        asset_id: "as-wc4-coolant",
        sensor_id: "FT-401",
        ts: insertTs,
        value: 23.4,
        quality_flag: "good",
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        received_at: new Date().toISOString(),
      };

      const result = await processor.processMessage(testEnvelope);
      expect(result.window.count).toBeGreaterThanOrEqual(1);
      expect(result.window.mean).toBe(23.4);

      // Verify point is persisted in PostgreSQL TimescaleDB hypertable
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");
        const res = await client.query<{ value: string }>(
          "SELECT value FROM tel.telemetry_point WHERE sensor_id = $1 AND ts = $2",
          ["FT-401", insertTs]
        );
        await client.query("COMMIT");
        expect(res.rows.length).toBe(1);
        expect(Number(res.rows[0]!.value)).toBe(23.4);
      } finally {
        client.release();
      }

      // Wait for feature publication in Kafka
      const start = Date.now();
      while (
        !receivedFeatures.some((f) => f.traceparent === testEnvelope.traceparent) &&
        Date.now() - start < 5000
      ) {
        await new Promise((r) => setTimeout(r, 200));
      }

      await consumer.disconnect();
      expect(receivedFeatures.length).toBeGreaterThanOrEqual(1);
      const feature = receivedFeatures.find((f) => f.traceparent === testEnvelope.traceparent);
      expect(feature).toBeDefined();
      expect(feature!.window.count).toBeGreaterThanOrEqual(1);
      expect(feature!.traceparent).toBe(testEnvelope.traceparent);
    },
    15000
  );

  it("enforces RLS isolation on tel.telemetry_point", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Query as t-acme (different tenant)
      await client.query("SELECT set_config('app.tenant_id', 't-acme', true)");
      const res = await client.query(
        "SELECT count(*) FROM tel.telemetry_point WHERE sensor_id = 'FT-401'"
      );
      await client.query("COMMIT");
      // t-acme cannot see t-demo's FT-401 rows!
      expect(Number(res.rows[0]?.count)).toBe(0);
    } finally {
      client.release();
    }
  });
});
