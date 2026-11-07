// Creates every configured Kafka topic on the local broker and waits for partition leaders (09 messaging, ADR-011).
// A fresh broker has no topics; producers and consumers that race auto-creation fail with "does not host this topic-partition".
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { loadConfig, findRepoRoot } from "@fp/config";

const root = findRepoRoot(process.cwd());
const cfg = loadConfig({ rootDir: root });
const topics = Object.entries(cfg.kafka)
  .filter(([k, v]) => k.endsWith("_topic") && typeof v === "string")
  .map(([, v]) => v as string);

const compose = ["compose", "-f", join(root, "infra/local/docker-compose.yml"), "--env-file", join(root, "infra/local/.env.local")];
const kafkaTopics = (...args: string[]) =>
  execFileSync("docker", [...compose, "exec", "-T", "kafka", "/opt/kafka/bin/kafka-topics.sh", "--bootstrap-server", "localhost:9092", ...args], { encoding: "utf8" });

for (const topic of topics) kafkaTopics("--create", "--if-not-exists", "--topic", topic);

// --create returns before leaders are elected; wait until every partition reports one.
for (const topic of topics) {
  for (let attempt = 0; ; attempt++) {
    const desc = kafkaTopics("--describe", "--topic", topic);
    const partitions = desc.split("\n").filter(l => l.includes("Partition:"));
    if (partitions.length > 0 && partitions.every(l => !/Leader:\s*(none|-1)/.test(l))) break;
    if (attempt >= 30) throw new Error(`no leader for ${topic}`);
    execFileSync("sleep", ["1"]);
  }
}
console.log(`kafka topics ready: ${topics.join(", ")}`);
