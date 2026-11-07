// API Gateway standalone runtime entrypoint (DU-11 / API-1..6)
import { config, appPool } from "@fp/db";
import { buildApiGateway } from "./server.ts";

const cfg = config();
const pool = appPool(cfg);
const server = buildApiGateway({ pool });

const host = process.env.HOST || cfg.api.host || "0.0.0.0";
const port = Number(process.env.PORT || cfg.api.port || 8080);

await server.listen({ host, port });
console.log(`API Gateway listening on http://${host}:${port} (edition ${cfg.edition}, env ${cfg.environment})`);
