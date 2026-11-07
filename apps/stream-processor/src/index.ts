// CLI Entrypoint for Stream Processor Service (APP-03).
import { config, appPool } from "@fp/db";
import { StreamProcessor } from "./processor.js";

async function main() {
  const cfg = config();
  const pool = appPool(cfg);
  const processor = new StreamProcessor(cfg, pool);

  console.log(`[StreamProcessor] Starting on Kafka raw topic: ${cfg.kafka.raw_topic}`);
  await processor.start();

  const shutdown = async () => {
    console.log("[StreamProcessor] Shutting down...");
    await processor.stop();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main().catch((err) => {
  console.error("StreamProcessor fatal error:", err);
  process.exit(1);
});
