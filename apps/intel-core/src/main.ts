// Service entrypoint for Intelligence Services (DU-04). Importing the package (index.ts) starts nothing.
import { config, appPool } from "@fp/db";
import { DetectionService } from "./detector.js";

async function main() {
  const cfg = config();
  const pool = appPool(cfg);
  const detector = new DetectionService(cfg, pool);

  console.log(`[DetectionService] Starting on Kafka features topic: ${cfg.kafka.features_topic}`);
  await detector.start();

  const shutdown = async () => {
    console.log("[DetectionService] Shutting down...");
    await detector.stop();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main().catch((err) => {
  console.error("DetectionService fatal error:", err);
  process.exit(1);
});
