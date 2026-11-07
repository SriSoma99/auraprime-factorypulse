// Ingest Gateway Service Entrypoint (APP-02 / DU-02).
import { config, appPool } from "@fp/db";
import { IngestGateway } from "./gateway.js";

const cfg = config();
const pool = appPool(cfg);
const gateway = new IngestGateway(cfg, pool);

async function main() {
  console.log(`[APP-02] Starting Ingest Gateway on ${cfg.mqtt.url} -> Kafka ${cfg.kafka.brokers.join(",")}`);
  await gateway.start();
  console.log(`[APP-02] Subscribed to ${cfg.mqtt.topic_prefix}/+/+/+/+/+/telemetry`);
  const otlp = gateway.otlpAddress();
  if (otlp) console.log(`[APP-02] OTLP/HTTP JSON metrics on http://${otlp.address}:${otlp.port}${cfg.ingest.otlp_http.path}`);

  const shutdown = async (signal: string) => {
    console.log(`[APP-02] Received ${signal}, shutting down gracefully...`);
    await gateway.stop();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[APP-02] Fatal error:", err);
  process.exit(1);
});
