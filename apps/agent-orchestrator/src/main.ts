// Service entrypoint for Agent Orchestrator (APP-09 / DU-06). Importing the package (index.ts) starts nothing.
import { config, appPool } from "@fp/db";
import { AgentOrchestratorService } from "./service.js";

async function main() {
  const cfg = config();
  const pool = appPool(cfg);
  const orchestrator = new AgentOrchestratorService(cfg, pool);

  console.log(`[AgentOrchestrator] Starting on Kafka alerts topic: ${cfg.kafka.alerts_topic}`);
  await orchestrator.start();

  const shutdown = async () => {
    console.log("[AgentOrchestrator] Shutting down...");
    await orchestrator.stop();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main().catch((err) => {
  console.error("AgentOrchestrator fatal error:", err);
  process.exit(1);
});
