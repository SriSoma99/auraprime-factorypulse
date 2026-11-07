import { config, adminPool } from "./connect.ts";
import { migrate } from "./migrate.ts";
import { seed } from "./seed.ts";

const cmd = process.argv[2];
const cfg = config();
const pool = adminPool(cfg);
try {
  if (cmd === "migrate" || cmd === "reset") console.log(`migrations applied: ${(await migrate(pool, cfg)).join(", ") || "none pending"}`);
  if (cmd === "seed" || cmd === "reset") { const d = await seed(pool, cfg); console.log(`seeded ${d.tenants.length} tenants, ${d.alerts.length} alerts, ${d.incidents.length} incidents`); }
  if (!["migrate", "seed", "reset"].includes(cmd ?? "")) throw new Error("usage: cli.ts migrate|seed|reset");
} finally { await pool.end(); }
