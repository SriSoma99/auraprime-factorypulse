// Knowledge Service standalone daemon (DU-05 / APP-07 / WP-4)
import { config, appPool } from "@fp/db";
import { KnowledgeService } from "./service.ts";

const cfg = config();
const pool = appPool(cfg);
const service = new KnowledgeService(cfg, pool);

console.log(`Knowledge Service initialized (edition: ${cfg.edition}, env: ${cfg.environment})`);
