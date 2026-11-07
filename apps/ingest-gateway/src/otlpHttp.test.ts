// Unit tests for the OTLP/HTTP receiver (ING-13): authentication, content type, size limit, partial success.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import { config } from "@fp/db";
import { createOtlpServer, type OtlpAuth } from "./otlpHttp.js";
import { IngestGateway } from "./gateway.js";

const cfg = { ...config().ingest.otlp_http, port: 0, max_body_bytes: 2048 };
const auth: OtlpAuth = { tenantFor: async (t) => (t === "device-key" ? "t-demo" : null) };
const gateway = new IngestGateway(config(), undefined, { lookup: async (_t, s) => (s === "S-01-SPD" ? { siteId: "SITE-DEMO", lineId: "LINE-01", stationId: "ST-01", assetId: "M-01" } : null) });
const server = createOtlpServer(cfg, auth, gateway);
let url = "";

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${cfg.path}`;
});
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

const metrics = (sensors: string[], attrs: Record<string, string> = {}) => ({
  resourceMetrics: [{
    resource: { attributes: Object.entries({ "factory.site.id": "SITE-DEMO", "factory.line.id": "LINE-01", "factory.machine.id": "M-01", ...attrs }).map(([key, v]) => ({ key, value: { stringValue: v } })) },
    scopeMetrics: [{ metrics: [{ name: "machine.spindle.speed", gauge: { dataPoints: sensors.map((s) => ({ timeUnixNano: `${BigInt(Date.now()) * 1_000_000n}`, asDouble: 5900, attributes: [{ key: "factory.sensor.id", value: { stringValue: s } }] })) } }] }],
  }],
});
const post = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer device-key", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("OTLP/HTTP receiver", () => {
  it("accepts a valid request from a device key with an empty OTLP response", async () => {
    const r = await post(metrics(["S-01-SPD"]));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
  });

  it("reports rejected points as OTLP partial success", async () => {
    const r = await post(metrics(["S-01-SPD", "S-99-SPD"]));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.partialSuccess.rejectedDataPoints).toBe(1);
    expect(body.partialSuccess.errorMessage).toContain("S-99-SPD");
  });

  it("rejects missing or unknown credentials with 401", async () => {
    expect((await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
    expect((await post(metrics(["S-01-SPD"]), { authorization: "Bearer someone-else" })).status).toBe(401);
  });

  it("files data under the key's tenant, so a payload naming another tenant is rejected", async () => {
    const r = await post(metrics(["S-01-SPD"], { "factory.tenant.id": "t-acme" }));
    expect(r.status).toBe(200);
    expect((await r.json()).partialSuccess.errorMessage).toContain("t-acme");
  });

  it("rejects non-JSON content types with 415, bad JSON with 400 and large bodies with 413", async () => {
    expect((await post("x", { "content-type": "application/x-protobuf" })).status).toBe(415);
    expect((await post("{not json")).status).toBe(400);
    expect((await post(JSON.stringify({ pad: "x".repeat(4096) }))).status).toBe(413);
  });

  it("answers 404 off the metrics path and 405 for other methods", async () => {
    expect((await fetch(url.replace(cfg.path, "/v1/traces"), { method: "POST" })).status).toBe(404);
    expect((await fetch(url, { method: "GET" })).status).toBe(405);
  });
});
