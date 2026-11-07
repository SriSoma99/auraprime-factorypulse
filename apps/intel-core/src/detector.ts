// Detection Service runtime (APP-04 / DU-04).
// Consumes tel.features.v1, evaluates threshold rules (DET-4) and baseline anomalies (DET-1),
// persists alerts to PostgreSQL intel.alert with RLS, and publishes to detect.alerts.v1.
import { randomUUID } from "node:crypto";
import { Kafka, type Consumer, type Producer } from "kafkajs";
import type pg from "pg";
import type { Config } from "@fp/config";
import { evaluateFeatureEnvelope, LIMIT_SPECS } from "./rules.js";
import type { TelemetryFeatureEnvelope, AlertEnvelope } from "./types.js";

export interface DetectionServiceStats {
  featuresEvaluatedCount: number;
  alertsTriggeredCount: number;
  alertsDeduplicatedCount: number;
  alertsPublishedCount: number;
}

export class DetectionService {
  private consumer: Consumer | null = null;
  private producer: Producer | null = null;
  private isRunning = false;
  private readonly recentAlerts = new Map<string, number>(); // key -> timestamp
  private readonly cooldownMs = 60_000; // 60s deduplication cooldown

  private stats: DetectionServiceStats = {
    featuresEvaluatedCount: 0,
    alertsTriggeredCount: 0,
    alertsDeduplicatedCount: 0,
    alertsPublishedCount: 0,
  };

  constructor(
    private readonly config: Config,
    private readonly pool: pg.Pool
  ) {}

  public getStats(): Readonly<DetectionServiceStats> {
    return { ...this.stats };
  }

  public async start(options: { fromBeginning?: boolean; groupId?: string } = {}): Promise<void> {
    if (this.isRunning) return;

    const kafka = new Kafka({
      clientId: "fp-intel-detection",
      brokers: this.config.kafka.brokers,
    });

    // 1. Initialize Producer for detect.alerts.v1
    this.producer = kafka.producer({
      idempotent: true,
      allowAutoTopicCreation: true,
    });
    await this.producer.connect();

    // 2. Initialize Consumer for tel.features.v1
    const groupId = options.groupId ?? "fp-detection-group";
    this.consumer = kafka.consumer({ groupId });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: this.config.kafka.features_topic,
      fromBeginning: options.fromBeginning ?? false,
    });

    const joinedPromise = new Promise<void>((resolve) => {
      this.consumer!.on(this.consumer!.events.GROUP_JOIN, () => resolve());
    });

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        try {
          const feature: TelemetryFeatureEnvelope = JSON.parse(message.value.toString("utf8"));
          await this.processFeature(feature);
        } catch (err) {
          console.error("DetectionService failed to process feature:", (err as Error).message);
        }
      },
    });

    await joinedPromise;
    this.isRunning = true;
  }

  public async processFeature(feature: TelemetryFeatureEnvelope): Promise<AlertEnvelope | null> {
    this.stats.featuresEvaluatedCount++;

    const result = evaluateFeatureEnvelope(feature);
    if (!result.triggered || !result.severity || !result.detail) {
      return null;
    }

    this.stats.alertsTriggeredCount++;

    // Deduplication check per sensor
    const dedupKey = `${feature.tenant_id}:${feature.sensor_id}`;
    const now = Date.now();
    const lastAlert = this.recentAlerts.get(dedupKey);
    if (lastAlert && now - lastAlert < this.cooldownMs) {
      this.stats.alertsDeduplicatedCount++;
      return null;
    }
    this.recentAlerts.set(dedupKey, now);

    const spec = LIMIT_SPECS[feature.sensor_id];
    const alert: AlertEnvelope = {
      id: `alt-${randomUUID()}`,
      tenant_id: feature.tenant_id,
      sensor_id: feature.sensor_id,
      line_id: feature.line_id,
      signal_name: spec?.signal_name ?? feature.sensor_id,
      detail: result.detail,
      severity: result.severity,
      rank: result.severity === "critical" ? 1 : 2,
      impact: spec?.default_impact ?? "Station throughput at risk",
      lead_time: { hours: result.leadTimeHours ?? 2.0, confidence: 0.88 },
      status: "open",
      traceparent: feature.traceparent,
      arrived_at: new Date().toISOString(),
      is_synthetic: true,
    };

    // 1. Persist alert to PostgreSQL intel.alert with RLS
    await this.persistAlert(alert);

    // 2. Publish alert to Kafka detect.alerts.v1
    if (this.producer) {
      await this.producer.send({
        topic: this.config.kafka.alerts_topic,
        messages: [
          {
            key: `${alert.tenant_id}:${alert.id}`,
            value: JSON.stringify(alert),
            headers: {
              traceparent: alert.traceparent,
              tenant_id: alert.tenant_id,
              sensor_id: alert.sensor_id,
              severity: alert.severity,
            },
          },
        ],
      });
      this.stats.alertsPublishedCount++;
    }

    return alert;
  }

  private async persistAlert(alert: AlertEnvelope): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [alert.tenant_id]);
      await client.query(
        `INSERT INTO intel.alert (
           id, tenant_id, sensor_id, line_id, signal_name, detail, status, rank, impact, lead_time, arrived_at, is_synthetic
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          alert.id,
          alert.tenant_id,
          alert.sensor_id,
          alert.line_id,
          alert.signal_name,
          alert.detail,
          alert.status,
          alert.rank,
          alert.impact,
          JSON.stringify(alert.lead_time),
          alert.arrived_at,
          alert.is_synthetic,
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
