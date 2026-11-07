// CLI runner for Fault Injection Simulator (SIM-1, SIM-2).
import { config } from "@fp/db";
import { scenarioCatalog } from "./scenarios.js";
import { SimulatorPublisher } from "./publisher.js";

async function main() {
  const args = process.argv.slice(2);
  const scenarioName = args.find((a, i) => args[i - 1] === "--scenario") ?? "coolant_degradation";
  const ticksArg = args.find((a, i) => args[i - 1] === "--ticks");
  const intervalArg = args.find((a, i) => args[i - 1] === "--interval");
  const isDryRun = args.includes("--dry-run");

  const scenario = scenarioCatalog[scenarioName];
  if (!scenario) {
    console.error(`Unknown scenario "${scenarioName}". Available: ${Object.keys(scenarioCatalog).join(", ")}`);
    process.exit(1);
  }

  const ticksToRun = ticksArg ? parseInt(ticksArg, 10) : scenario.totalTicks;

  if (isDryRun) {
    console.log(`[Simulator:DryRun] Running scenario "${scenario.name}" (${ticksToRun} ticks)...`);
    const now = new Date();
    let totalMessages = 0;
    let totalAnomalies = 0;

    for (let tick = 0; tick < ticksToRun; tick++) {
      const messages = scenario.generateTick(tick, now);
      totalMessages += messages.length;
      const anomalies = messages.filter((m) => m.groundTruth.is_anomaly);
      totalAnomalies += anomalies.length;

      console.log(`\n--- Tick ${tick + 1}/${ticksToRun} (${messages.length} messages) ---`);
      if (anomalies.length > 0) {
        for (const a of anomalies) {
          console.log(`  [ANOMALY] ${a.payload.sensor_id} = ${a.payload.value} (severity: ${a.groundTruth.expected_severity}): ${a.groundTruth.description}`);
        }
      } else {
        console.log(`  All signals nominal.`);
      }
    }

    console.log(`\n[Simulator:DryRun] Completed "${scenarioName}": ${totalMessages} messages evaluated, ${totalAnomalies} anomalies injected.`);
    return;
  }

  const cfg = config();
  console.log(`[Simulator] Starting scenario "${scenario.name}" on broker ${cfg.mqtt.url}`);

  const publisher = new SimulatorPublisher(cfg);
  try {
    const result = await publisher.runScenario(scenario, {
      maxTicks: ticksToRun,
      tickIntervalMs: intervalArg ? parseInt(intervalArg, 10) : undefined,
      onTick: (tick, msgs) => {
        const anomalies = msgs.filter((m) => m.groundTruth.is_anomaly);
        const anomalyStr = anomalies.length > 0 ? ` [ANOMALY: ${anomalies.map((a) => a.groundTruth.description).join("; ")}]` : "";
        console.log(`  Tick ${tick + 1}/${ticksToRun}: ${msgs.length} messages published${anomalyStr}`);
      },
    });

    console.log(`[Simulator] Completed scenario "${scenarioName}": ${result.totalMessages} messages, ${result.anomaliesInjected} anomalies injected.`);
  } finally {
    await publisher.disconnect();
  }
}

void main().catch((err) => {
  console.error("Simulator failed:", err);
  process.exit(1);
});
