// Integration test for IngestGateway (APP-02 / WP-1).
// Verifies end-to-end bridge from Mosquitto MQTT to Kafka KRaft and PostgreSQL tel.dead_letter.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mqtt from "mqtt";
import { Kafka } from "kafkajs";
import { config, appPool } from "@fp/db";
import { principalToken } from "@fp/synthetic-data";
import { IngestGateway } from "./gateway.js";
import type { ValidatedTelemetryEnvelope } from "./types.js";

const base = config();
// Port 0: the OTLP receiver takes a free port, so a running dev gateway does not clash with the test.
const cfg = { ...base, ingest: { ...base.ingest, otlp_http: { ...base.ingest.otlp_http, port: 0 } } };
const pool = appPool(cfg);
const gateway = new IngestGateway(cfg, pool);
// A registered sensor (ING-7): FT-401 on the Weld Cell 4 coolant loop.
const HERO_TOPIC = `${cfg.mqtt.topic_prefix}/t-demo/site-a/line-body-1/st-cell4/as-wc4-coolant/telemetry`;

async function collect(topic: string, until: (m: ValidatedTelemetryEnvelope[]) => boolean, act: () => Promise<void>): Promise<ValidatedTelemetryEnvelope[]> {
  const kafka = new Kafka({ clientId: "test-verifier", brokers: cfg.kafka.brokers });
  const consumer = kafka.consumer({ groupId: `test-group-${Date.now()}-${Math.random().toString(16).slice(2)}` });
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });
  const got: ValidatedTelemetryEnvelope[] = [];
  const joined = new Promise<void>((resolve) => consumer.on(consumer.events.GROUP_JOIN, () => resolve()));
  await consumer.run({ eachMessage: async ({ message }) => { if (message.value) got.push(JSON.parse(message.value.toString("utf8"))); } });
  await joined;
  await act();
  const start = Date.now();
  while (!until(got) && Date.now() - start < 8000) await new Promise((r) => setTimeout(r, 200));
  await consumer.disconnect();
  return got;
}

async function deadLetters(where: string, arg: string): Promise<{ reason: string; error_detail: string }[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");
    const res = await client.query<{ reason: string; error_detail: string }>(`SELECT reason, error_detail FROM tel.dead_letter WHERE ${where} ORDER BY received_at DESC`, [arg]);
    await client.query("COMMIT");
    return res.rows;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  await gateway.start();
});

afterAll(async () => {
  await gateway.stop();
  await pool.end();
});

describe("IngestGateway end-to-end integration (WP-1)", () => {
  it(
    "bridges MQTT telemetry to Kafka tel.raw.v1 with traceparent and partition key",
    async () => {
      const kafka = new Kafka({
        clientId: "test-verifier",
        brokers: cfg.kafka.brokers,
      });
      const consumer = kafka.consumer({ groupId: `test-group-${Date.now()}` });
      await consumer.connect();
      // Latest offset only: the topic keeps every earlier run (simulator included), and replaying that backlog can outlast the wait below.
      await consumer.subscribe({ topic: cfg.kafka.raw_topic, fromBeginning: false });

      const receivedMessages: ValidatedTelemetryEnvelope[] = [];
      const joinedPromise = new Promise<void>((resolve) => {
        consumer.on(consumer.events.GROUP_JOIN, () => resolve());
      });

      await consumer.run({
        eachMessage: async ({ message }) => {
          if (message.value) {
            receivedMessages.push(JSON.parse(message.value.toString("utf8")));
          }
        },
      });

      // Wait for consumer group assignment before publishing
      await joinedPromise;

      // Publish to Mosquitto
      const publisher = mqtt.connect(cfg.mqtt.url);
      await new Promise<void>((resolve) => publisher.on("connect", () => resolve()));

      const testTopic = HERO_TOPIC;
      const payload = JSON.stringify({
        sensor_id: "FT-401",
        ts: new Date().toISOString(),
        value: 14.8,
        quality_flag: "good",
      });

      await new Promise<void>((resolve, reject) => {
        publisher.publish(testTopic, payload, { qos: 1 }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Wait up to 5s for Kafka consumption
      const start = Date.now();
      while (
        !receivedMessages.some((m) => m.sensor_id === "FT-401" && m.value === 14.8) &&
        Date.now() - start < 5000
      ) {
        await new Promise((r) => setTimeout(r, 200));
      }

      publisher.end();
      await consumer.disconnect();

      expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
      const msg = receivedMessages.find((m) => m.sensor_id === "FT-401" && m.value === 14.8);
      expect(msg).toBeDefined();
      expect(msg!.tenant_id).toBe("t-demo");
      expect(msg!.asset_id).toBe("as-wc4-coolant");
      expect(msg!.value).toBe(14.8);
      expect(msg!.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    },
    15000
  );

  it("routes malformed telemetry payload to DLQ (ING-9)", async () => {
    const publisher = mqtt.connect(cfg.mqtt.url);
    await new Promise<void>((resolve) => publisher.on("connect", () => resolve()));

    const testTopic = HERO_TOPIC;
    // Malformed JSON (missing closing brace)
    publisher.publish(testTopic, "{ invalid-json: ", { qos: 1 });

    // Wait 1 second for processing
    await new Promise((r) => setTimeout(r, 1000));
    publisher.end();

    const stats = gateway.getStats();
    expect(stats.dlqCount).toBeGreaterThanOrEqual(1);

    // Verify written to PostgreSQL tel.dead_letter
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', 't-demo', true)");
      const res = await client.query<{ reason: string }>(
        "SELECT reason FROM tel.dead_letter WHERE topic = $1 ORDER BY received_at DESC LIMIT 1",
        [testTopic]
      );
      await client.query("COMMIT");
      expect(res.rows.length).toBeGreaterThanOrEqual(1);
      expect(res.rows[0]?.reason).toBe("malformed_json");
    } finally {
      client.release();
    }
  });

  it("dead-letters MQTT readings for unregistered sensors or the wrong place (ING-7)", async () => {
    const publisher = mqtt.connect(cfg.mqtt.url);
    await new Promise<void>((resolve) => publisher.on("connect", () => resolve()));
    const marker = `sn-unregistered-${Date.now()}`;
    const wrongPlace = `${cfg.mqtt.topic_prefix}/t-demo/site-a/line-body-1/st-cell3/as-wc4-coolant/telemetry`;
    await new Promise<void>((r) => publisher.publish(HERO_TOPIC, JSON.stringify({ sensor_id: marker, ts: new Date().toISOString(), value: 1, quality_flag: "good" }), { qos: 1 }, () => r()));
    await new Promise<void>((r) => publisher.publish(wrongPlace, JSON.stringify({ sensor_id: "FT-401", ts: new Date().toISOString(), value: 2, quality_flag: "good" }), { qos: 1 }, () => r()));
    await new Promise((r) => setTimeout(r, 1500));
    publisher.end();

    // At least one row: another gateway on the same broker (for example pnpm dev:ingest) may dead-letter the reading too.
    const unknown = await deadLetters("payload->>'sensor_id' = $1", marker);
    expect(unknown.length).toBeGreaterThanOrEqual(1);
    expect(new Set(unknown.map((d) => d.reason))).toEqual(new Set(["unknown_sensor"]));
    const misplaced = await deadLetters("topic = $1", wrongPlace);
    expect(misplaced[0]?.reason).toBe("unknown_sensor");
    expect(misplaced[0]?.error_detail).toContain("station st-cell4");
  }, 15000);

  it("accepts OTLP/HTTP metrics with a device key, takes the station from the registry and forwards to Kafka (ING-13)", async () => {
    const addr = gateway.otlpAddress()!;
    expect(addr).not.toBeNull();
    const url = `http://127.0.0.1:${addr.port}${cfg.ingest.otlp_http.path}`;
    const value = 6000 + (Date.now() % 1000);
    const body = {
      resourceMetrics: [{
        resource: { attributes: [["factory.site.id", "SITE-DEMO"], ["factory.line.id", "LINE-01"], ["factory.machine.id", "M-01"]].map(([key, v]) => ({ key, value: { stringValue: v } })) },
        scopeMetrics: [{ metrics: [{ name: "machine.spindle.speed", gauge: { dataPoints: [
          { timeUnixNano: `${BigInt(Date.now()) * 1_000_000n}`, asDouble: value, attributes: [{ key: "factory.sensor.id", value: { stringValue: "S-01-SPD" } }] },
          { timeUnixNano: `${BigInt(Date.now()) * 1_000_000n}`, asDouble: 1, attributes: [{ key: "factory.sensor.id", value: { stringValue: "S-01-NOPE" } }] },
        ] } }] }],
      }],
    };
    const deviceKey = principalToken(cfg.synthetic.seed, "k-integration");
    let status = 0; let reply: { partialSuccess?: { rejectedDataPoints: number } } = {};
    const got = await collect(cfg.kafka.raw_topic, (m) => m.some((x) => x.sensor_id === "S-01-SPD" && x.value === value), async () => {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${deviceKey}` }, body: JSON.stringify(body) });
      status = r.status; reply = await r.json();
    });
    expect(status).toBe(200);
    expect(reply.partialSuccess?.rejectedDataPoints).toBe(1);
    const msg = got.find((x) => x.sensor_id === "S-01-SPD" && x.value === value);
    expect(msg).toMatchObject({ tenant_id: "t-demo", site_id: "SITE-DEMO", line_id: "LINE-01", station_id: "ST-01", asset_id: "M-01" });

    // A human session token is not a device credential
    const human = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${principalToken(cfg.synthetic.seed, "u-shift-lead")}` }, body: JSON.stringify(body) });
    expect(human.status).toBe(401);
  }, 20000);
});
