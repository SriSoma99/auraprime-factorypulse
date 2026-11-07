// OTLP/HTTP JSON metrics receiver for APP-02 (ING-13, ADR-039). The tenant comes from the bearer token, never from the payload (invariant 4).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import type pg from "pg";
import type { Config } from "@fp/config";
import type { OtlpDecodeResult } from "./otlp.js";

/** Resolves a bearer token to the tenant of a device credential, or null. */
export interface OtlpAuth {
  tenantFor(token: string): Promise<string | null>;
}

/** Device credentials are API-key principals; human sessions and agent tokens cannot push telemetry. */
export class PgOtlpAuth implements OtlpAuth {
  constructor(private readonly pool: pg.Pool) {}
  async tenantFor(token: string): Promise<string | null> {
    const hash = createHash("sha256").update(token).digest("hex");
    const r = await this.pool.query<{ tenant_id: string; session_type: string }>("SELECT tenant_id, session_type FROM plat.resolve_principal($1)", [hash]);
    const p = r.rows[0];
    return p && p.session_type === "api_key" ? p.tenant_id : null;
  }
}

export interface OtlpSink {
  handleOtlpMetrics(payload: unknown, options: { tenantId: string }): Promise<OtlpDecodeResult>;
}

type Reply = { status: number; body: unknown };
const problem = (status: number, title: string): Reply => ({ status, body: { type: "about:blank", title, status } });

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function handleOtlpRequest(req: IncomingMessage, cfg: Config["ingest"]["otlp_http"], auth: OtlpAuth, sink: OtlpSink): Promise<Reply> {
  if ((req.url ?? "").split("?")[0] !== cfg.path) return problem(404, "Not found");
  if (req.method !== "POST") return problem(405, "Method not allowed");
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const tenantId = token ? await auth.tenantFor(token) : null;
  if (!tenantId) return problem(401, "A device API key is required");
  if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) return problem(415, "Only OTLP/HTTP JSON is supported");
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > cfg.max_body_bytes) return problem(413, "Request body too large");
  const raw = await readBody(req, cfg.max_body_bytes);
  if (!raw) return problem(413, "Request body too large");
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    payload = raw.toString("utf8"); // still dead-lettered, so a bad sender is visible in DLQ tooling (ING-9)
  }
  const result = await sink.handleOtlpMetrics(payload, { tenantId });
  if (result.summary.totalDataPoints === 0 && result.dlqErrors.length) return problem(400, result.dlqErrors[0]!.error_detail ?? "Invalid OTLP payload");
  // OTLP partial success: the request is accepted, rejected points are reported and dead-lettered.
  const rejected = result.dlqErrors.length;
  return { status: 200, body: rejected ? { partialSuccess: { rejectedDataPoints: rejected, errorMessage: result.dlqErrors.map((d) => d.error_detail).join("; ") } } : {} };
}

export function createOtlpServer(cfg: Config["ingest"]["otlp_http"], auth: OtlpAuth, sink: OtlpSink): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    handleOtlpRequest(req, cfg, auth, sink)
      .catch((err: Error): Reply => {
        console.error("[APP-02] OTLP request failed:", err.message);
        return problem(500, "Internal error");
      })
      .then(({ status, body }) => {
        res.writeHead(status, { "content-type": status >= 400 ? "application/problem+json" : "application/json" });
        res.end(JSON.stringify(body));
      });
  });
}
