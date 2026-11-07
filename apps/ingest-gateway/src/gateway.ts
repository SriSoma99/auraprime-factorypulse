// Ingest Gateway runtime (APP-02 / DU-02).
// Bridges Mosquitto MQTT to Apache Kafka KRaft with validation, idempotency, and DLQ routing.
import mqtt, { type MqttClient } from "mqtt";
import { Kafka, type Producer } from "kafkajs";
import type pg from "pg";
import type { Config } from "@fp/config";
import { validateAndEnrich } from "./validator.js";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { decodeOtlpMetrics, type OtlpDecodeOptions, type OtlpDecodeResult } from "./otlp.js";
import { PgSensorRegistry, placeEnvelope, type SensorRegistry } from "./registry.js";
import { createOtlpServer, PgOtlpAuth } from "./otlpHttp.js";
import type { ValidatedTelemetryEnvelope, DeadLetterEnvelope } from "./types.js";

export { decodeOtlpMetrics, type OtlpDecodeOptions, type OtlpDecodeResult } from "./otlp.js";

export interface IngestGatewayStats {
  receivedCount: number;
  forwardedCount: number;
  dlqCount: number;
}

export class IngestGateway {
  private mqttClient: MqttClient | null = null;
  private kafkaProducer: Producer | null = null;
  private isRunning = false;
  private stats: IngestGatewayStats = {
    receivedCount: 0,
    forwardedCount: 0,
    dlqCount: 0,
  };

  private otlpServer: Server | null = null;
  /** Null only when constructed without a database and without a registry (unit tests); then readings are not checked against ING-7. */
  private readonly registry: SensorRegistry | null;

  constructor(
    private readonly config: Config,
    private readonly pool?: pg.Pool,
    registry?: SensorRegistry | null
  ) {
    this.registry = registry !== undefined ? registry : pool ? new PgSensorRegistry(pool, config.ingest.registry_refresh_s) : null;}

  public getStats(): Readonly<IngestGatewayStats> {
    return { ...this.stats };
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    // 1. Initialize Kafka Producer (Idempotent producer, acks=all per doc/09)
    const kafka = new Kafka({
      clientId: this.config.kafka.client_id,
      brokers: this.config.kafka.brokers,
    });
    this.kafkaProducer = kafka.producer({
      idempotent: true,
      allowAutoTopicCreation: true,
    });
    await this.kafkaProducer.connect();

    // 2. Initialize MQTT Subscriber (Mosquitto site broker)
    const topicPattern = `${this.config.mqtt.topic_prefix}/+/+/+/+/+/telemetry`;
    this.mqttClient = mqtt.connect(this.config.mqtt.url, {
      clientId: `${this.config.mqtt.client_id}-${Math.random().toString(16).slice(2, 8)}`,
      clean: true,
    });

    await new Promise<void>((resolve, reject) => {
      this.mqttClient!.on("connect", () => {
        this.mqttClient!.subscribe(topicPattern, { qos: 1 }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.mqttClient!.on("error", (err) => {
        // Log error without crashing
        console.error("MQTT error:", err.message);
      });
    });

    // 3. Handle incoming telemetry messages
    this.mqttClient.on("message", (topic, message, packet) => {
      void this.handleMessage(topic, message, packet);
    });

    // 4. OTLP/HTTP JSON receiver; device credentials are resolved through the database (ING-13)
    const otlp = this.config.ingest.otlp_http;
    if (otlp.enabled && this.pool) {
      const server = createOtlpServer(otlp, new PgOtlpAuth(this.pool), this);
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(otlp.port, otlp.host, () => resolve());
      });
      this.otlpServer = server;
    }

    this.isRunning = true;
  }

  public async handleMessage(
    topic: string,
    message: Buffer,
    packet?: mqtt.IPublishPacket
  ): Promise<ValidatedTelemetryEnvelope | DeadLetterEnvelope> {
    this.stats.receivedCount++;

    // Extract W3C traceparent from MQTT 5 user properties if provided (ING-10)
    let traceparent: string | undefined;
    const userProperties = packet?.properties?.userProperties as Record<string, string | string[]> | undefined;
    if (userProperties?.traceparent) {
      traceparent = Array.isArray(userProperties.traceparent)
        ? userProperties.traceparent[0]
        : userProperties.traceparent;
    }

    const now = new Date();
    const result = validateAndEnrich(topic, message, now, {
      topicPrefix: this.config.mqtt.topic_prefix,
      traceparent,
      maxFutureSkewMs: this.config.ingest.max_future_skew_s * 1000,
      maxPastSkewMs: this.config.ingest.max_past_skew_s * 1000,
    });

    // The MQTT topic names the full hierarchy, so every level must match the registry
    const placed = !result.success ? { dlq: result.dlq } : this.registry ? await placeEnvelope(result.envelope, this.registry, { topic, now, trustStation: true }) : { envelope: result.envelope };

    if ("envelope" in placed) {
      await this.forwardToKafka(placed.envelope);
      this.stats.forwardedCount++;
      return placed.envelope;
    } else {
      await this.routeToDlq(placed.dlq);
      this.stats.dlqCount++;
      return placed.dlq;
    }
  }

  /**
   * Processes a batch of OTLP JSON resourceMetrics (e.g. from OTLP/HTTP receiver or demo-replay)
   * for the authenticated tenant in options.tenantId,
   * validates each metric, routes valid points to Kafka and invalid points to DLQ.
   */
  public async handleOtlpMetrics(
    payload: unknown,
    options?: OtlpDecodeOptions
  ): Promise<OtlpDecodeResult> {
    const now = options?.now ?? new Date();
    const decoded = decodeOtlpMetrics(payload, {
      validateSkew: true,
      maxFutureSkewMs: this.config.ingest.max_future_skew_s * 1000,
      maxPastSkewMs: this.config.ingest.max_past_skew_s * 1000,
      ...options,
      now,
    });

    // OTLP may leave the station to be derived, so the registry supplies it; site, line and machine must match (ING-7)
    const result: OtlpDecodeResult = { ...decoded, envelopes: [], dlqErrors: [...decoded.dlqErrors] };
    for (const envelope of decoded.envelopes) {
      const placed = this.registry ? await placeEnvelope(envelope, this.registry, { topic: "otlp/http/metrics", now, trustStation: false }) : { envelope };
      if ("envelope" in placed) result.envelopes.push(placed.envelope);
      else result.dlqErrors.push(placed.dlq);
    }
    result.success = result.dlqErrors.length === 0;
    result.summary = { ...decoded.summary, validCount: result.envelopes.length, errorCount: result.dlqErrors.length };

    for (const envelope of result.envelopes) {
      await this.forwardToKafka(envelope);
      this.stats.forwardedCount++;
    }

    for (const dlq of result.dlqErrors) {
      await this.routeToDlq(dlq);
      this.stats.dlqCount++;
    }

    // A payload rejected before its points could be counted is still one received message
    this.stats.receivedCount += result.summary.totalDataPoints || result.dlqErrors.length;
    return result;
  }

  private async forwardToKafka(envelope: ValidatedTelemetryEnvelope): Promise<void> {
    if (!this.kafkaProducer) return;

    // Partition key = tenant_id:asset_id (ensures ordering per asset, ING-11)
    const partitionKey = `${envelope.tenant_id}:${envelope.asset_id}`;

    await this.kafkaProducer.send({
      topic: this.config.kafka.raw_topic,
      messages: [
        {
          key: partitionKey,
          value: JSON.stringify(envelope),
          headers: {
            traceparent: envelope.traceparent,
            tenant_id: envelope.tenant_id,
            sensor_id: envelope.sensor_id,
            source_ts: envelope.ts,
          },
        },
      ],
    });
  }

  private async routeToDlq(dlq: DeadLetterEnvelope): Promise<void> {
    // 1. Publish to Kafka tel.dlq.v1 topic (ING-9)
    if (this.kafkaProducer) {
      await this.kafkaProducer.send({
        topic: this.config.kafka.dlq_topic,
        messages: [
          {
            key: dlq.tenant_id,
            value: JSON.stringify(dlq),
            headers: {
              reason: dlq.reason,
              tenant_id: dlq.tenant_id,
            },
          },
        ],
      });
    }

    // 2. Persist to PostgreSQL tel.dead_letter table if pool provided
    if (this.pool && dlq.tenant_id !== "unknown") {
      try {
        const client = await this.pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT set_config('app.tenant_id', $1, true)", [dlq.tenant_id]);
          await client.query(
            `INSERT INTO tel.dead_letter (id, tenant_id, topic, reason, payload, error_detail, received_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              dlq.id,
              dlq.tenant_id,
              dlq.topic,
              dlq.reason,
              JSON.stringify(dlq.payload),
              dlq.error_detail,
              dlq.received_at,
            ]
          );
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          console.error("Failed to insert into tel.dead_letter:", (e as Error).message);
        } finally {
          client.release();
        }
      } catch (err) {
        console.error("Pool connection error during DLQ write:", (err as Error).message);
      }
    }
  }

  /** Where the OTLP/HTTP receiver listens, or null when it is disabled or not started. */
  public otlpAddress(): AddressInfo | null {
    const a = this.otlpServer?.address();
    return a && typeof a === "object" ? a : null;
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    if (this.otlpServer) {
      const server = this.otlpServer;
      this.otlpServer = null;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    if (this.mqttClient) {
      await new Promise<void>((resolve) => {
        this.mqttClient!.end(false, {}, () => resolve());
      });
      this.mqttClient = null;
    }

    if (this.kafkaProducer) {
      await this.kafkaProducer.disconnect();
      this.kafkaProducer = null;
    }

    this.isRunning = false;
  }
}
