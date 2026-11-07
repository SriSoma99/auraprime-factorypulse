// Stream Processor Service (APP-03 / DU-03).
// Consumes tel.raw.v1, writes points to TimescaleDB tel.telemetry_point with tenant RLS,
// computes rolling window features, and emits tel.features.v1.
import { Kafka, type Consumer, type Producer } from "kafkajs";
import type pg from "pg";
import type { Config } from "@fp/config";
import { WindowAggregator } from "./aggregator.js";
import type { RawTelemetryEnvelope, TelemetryFeatureEnvelope } from "./types.js";

export interface StreamProcessorStats {
  processedCount: number;
  dbWriteCount: number;
  featuresEmittedCount: number;
}

export class StreamProcessor {
  private consumer: Consumer | null = null;
  private producer: Producer | null = null;
  private readonly aggregator = new WindowAggregator(20);
  private isRunning = false;
  private stats: StreamProcessorStats = {
    processedCount: 0,
    dbWriteCount: 0,
    featuresEmittedCount: 0,
  };

  constructor(
    private readonly config: Config,
    private readonly pool: pg.Pool
  ) {}

  public getStats(): Readonly<StreamProcessorStats> {
    return { ...this.stats };
  }

  public async start(options: { fromBeginning?: boolean; groupId?: string } = {}): Promise<void> {
    if (this.isRunning) return;

    const kafka = new Kafka({
      clientId: "fp-stream-processor",
      brokers: this.config.kafka.brokers,
    });

    // 1. Initialize Producer
    this.producer = kafka.producer({
      idempotent: true,
      allowAutoTopicCreation: true,
    });
    await this.producer.connect();

    // 2. Initialize Consumer
    const groupId = options.groupId ?? "fp-stream-processor-group";
    this.consumer = kafka.consumer({ groupId });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: this.config.kafka.raw_topic,
      fromBeginning: options.fromBeginning ?? false,
    });

    const joinedPromise = new Promise<void>((resolve) => {
      this.consumer!.on(this.consumer!.events.GROUP_JOIN, () => resolve());
    });

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        try {
          const envelope: RawTelemetryEnvelope = JSON.parse(message.value.toString("utf8"));
          await this.processMessage(envelope);
        } catch (err) {
          console.error("StreamProcessor failed to process message:", (err as Error).message);
        }
      },
    });

    await joinedPromise;
    this.isRunning = true;
  }

  public async processMessage(envelope: RawTelemetryEnvelope): Promise<TelemetryFeatureEnvelope> {
    this.stats.processedCount++;

    // 1. Persist point to PostgreSQL TimescaleDB hypertable with forced RLS (Invariant 4)
    await this.writeTelemetryPoint(envelope);
    this.stats.dbWriteCount++;

    // 2. Compute rolling window stats
    const stats = this.aggregator.addPoint(
      envelope.tenant_id,
      envelope.sensor_id,
      envelope.value,
      envelope.ts
    );

    // 3. Construct Feature Envelope
    const featureEnvelope: TelemetryFeatureEnvelope = {
      ...envelope,
      window: stats,
    };

    // 4. Publish feature envelope to Kafka tel.features.v1
    if (this.producer) {
      await this.producer.send({
        topic: this.config.kafka.features_topic,
        messages: [
          {
            key: `${envelope.tenant_id}:${envelope.asset_id}`,
            value: JSON.stringify(featureEnvelope),
            headers: {
              traceparent: envelope.traceparent,
              tenant_id: envelope.tenant_id,
              sensor_id: envelope.sensor_id,
              source_ts: envelope.ts,
            },
          },
        ],
      });
      this.stats.featuresEmittedCount++;
    }

    return featureEnvelope;
  }

  private async writeTelemetryPoint(envelope: RawTelemetryEnvelope): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [envelope.tenant_id]);
      await client.query(
        `INSERT INTO tel.telemetry_point (
           tenant_id, sensor_id, ts, value, quality_flag
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          envelope.tenant_id,
          envelope.sensor_id,
          envelope.ts,
          envelope.value,
          envelope.quality_flag,
        ]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }

    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }

    this.isRunning = false;
  }
}
