// Replays the sample OTLP fixture to the APP-02 OTLP/HTTP receiver with current timestamps (ING-13, SIM-1).
// Uses the synthetic demo device key (k-integration); local and synthetic only (ADR-019).
import { readFileSync } from "node:fs";
import { config } from "@fp/db";
import { principalToken } from "@fp/synthetic-data";
import { restamp } from "./otlpReplay.js";

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => args.find((_, i) => args[i - 1] === name);
  const repeat = Number(arg("--repeat") ?? 1);
  const intervalMs = Number(arg("--interval") ?? 1000);
  const cfg = config();
  const o = cfg.ingest.otlp_http;
  const url = `http://${o.host}:${o.port}${o.path}`;
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/sampleOtlpMetrics.json", import.meta.url), "utf8"));
  const token = principalToken(cfg.synthetic.seed, "k-integration");
  console.log(`[OTLP replay] ${repeat} request(s) to ${url}`);
  for (let i = 0; i < repeat; i++) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(restamp(fixture, new Date())) });
    const body = await r.text();
    console.log(`  ${i + 1}/${repeat}: HTTP ${r.status} ${body}`);
    if (!r.ok) process.exitCode = 1;
    if (i < repeat - 1) await new Promise((res) => setTimeout(res, intervalMs));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
