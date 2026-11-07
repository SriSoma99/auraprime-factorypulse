import { config, appPool, adminPool } from "@fp/db";
import { buildServer } from "./server.ts";

const cfg = config();
const ctx = { cfg, app: appPool(cfg), admin: adminPool(cfg), now: () => new Date(cfg.synthetic.reference_time), telemetryNow: () => new Date() };
const app = await buildServer(ctx);
await app.listen({ host: cfg.api.host, port: cfg.api.port });
console.log(`mock API on http://${cfg.api.host}:${cfg.api.port} (edition ${cfg.edition}, environment ${cfg.environment})`);
