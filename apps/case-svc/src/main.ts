// Case Service standalone daemon (DU-07 / APP-11, APP-12 / WP-7)
import { config, appPool } from "@fp/db";
import { KnowledgeService } from "@fp/knowledge-svc";
import { LearningService } from "./learning.ts";
import { ResolutionVerificationService } from "./resolution.ts";

const cfg = config();
const pool = appPool(cfg);
const knowledge = new KnowledgeService(cfg, pool);
const learning = new LearningService(pool, knowledge);
const resolution = new ResolutionVerificationService(pool);

console.log(`Case Service initialized (edition ${cfg.edition}, case memory active)`);
