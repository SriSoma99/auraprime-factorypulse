// Governance Service standalone daemon (DU-08 / APP-10, APP-20 / WP-7)
import { config, appPool } from "@fp/db";
import { PolicyEngine } from "./policy.ts";

const cfg = config();
const pool = appPool(cfg);
const engine = new PolicyEngine(pool);

console.log(`Governance Service initialized (edition ${cfg.edition}, Invariants 1-3 active)`);
