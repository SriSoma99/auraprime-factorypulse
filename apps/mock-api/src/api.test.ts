// API-level checks of the safety rules against the local database (pnpm local:up; migrations applied).
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { config, appPool, adminPool, seed } from "@fp/db";
import { principalToken } from "@fp/synthetic-data";
import { buildServer } from "./server.ts";
import type { Ctx } from "./context.ts";
import { ROUTE_RULES } from "./rbac.ts";

let app: FastifyInstance; let ctx: Ctx;
/** Live telemetry is judged against this clock, so plant-view tests control time. */
const telemetryClock = new Date("2026-11-05T12:00:00Z");
const tok = (id: string) => ({ authorization: `Bearer ${principalToken(ctx.cfg.synthetic.seed, id)}` });
const key = () => ({ "idempotency-key": crypto.randomUUID() });
async function level(l: string) { await app.inject({ method: "PUT", url: "/mock/state", payload: { fallbackLevel: l } }); }

beforeAll(async () => {
  const cfg = config();
  ctx = { cfg, app: appPool(cfg), admin: adminPool(cfg), now: () => new Date(cfg.synthetic.reference_time), telemetryNow: () => telemetryClock };
  app = await buildServer(ctx);
});
beforeEach(async () => { await seed(ctx.admin, ctx.cfg); });
afterAll(async () => { await app.close(); await ctx.app.end(); await ctx.admin.end(); });

describe("authentication and tenancy (invariant 4)", () => {
  it("rejects calls without a token", async () => {
    expect((await app.inject({ url: "/v1/alerts" })).statusCode).toBe(401);
  });
  it("never shows another tenant's data", async () => {
    const ids = (await app.inject({ url: "/v1/alerts", headers: tok("u-shift-lead") })).json().items.map((a: { id: string }) => a.id);
    expect(ids).not.toContain("AL-X01");
    expect((await app.inject({ url: "/v1/incidents/INC-0042", headers: tok("u-acme-lead") })).statusCode).toBe(404);
  });
});

describe("approvals (invariants 1, 2, 3)", () => {
  it("does not let an API key or agent token approve", async () => {
    for (const p of ["k-integration", "a-orchestrator"]) {
      const r = await app.inject({ method: "POST", url: "/v1/approvals/APR-0311/decision", headers: { ...tok(p), ...key() }, payload: { decision: "approve" } });
      expect(r.statusCode).toBe(403);
      expect(r.json().detail).toMatch(/signed-in person/);
    }
  });
  it("raises the tier at L3 so a shift lead cannot decide", async () => {
    await level("L3");
    const a = (await app.inject({ url: "/v1/approvals/APR-0311", headers: tok("u-shift-lead") })).json();
    expect(a.tier).toBe(2); expect(a.canDecide).toBe(false);
    const r = await app.inject({ method: "POST", url: "/v1/approvals/APR-0311/decision", headers: { ...tok("u-shift-lead"), ...key() }, payload: { decision: "approve" } });
    expect(r.statusCode).toBe(403);
    const re = await app.inject({ method: "POST", url: "/v1/approvals/APR-0311/decision", headers: { ...tok("u-reliability"), ...key() }, payload: { decision: "approve" } });
    expect(re.statusCode).toBe(200);
  });
  it("requires a reason to reject", async () => {
    const r = await app.inject({ method: "POST", url: "/v1/approvals/APR-0311/decision", headers: { ...tok("u-shift-lead"), ...key() }, payload: { decision: "reject" } });
    expect(r.statusCode).toBe(422);
  });
  it("records an approval once, in the audit chain, and keeps the work order a draft", async () => {
    const headers = { ...tok("u-shift-lead"), ...key() };
    const first = await app.inject({ method: "POST", url: "/v1/approvals/APR-0311/decision", headers, payload: { decision: "approve" } });
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe("approved");
    expect(first.json().auditEventId).toMatch(/^AUD-/);
    const replay = await app.inject({ method: "POST", url: "/v1/approvals/APR-0311/decision", headers, payload: { decision: "approve" } });
    expect(replay.json().auditEventId).toBe(first.json().auditEventId);
    const again = await app.inject({ method: "POST", url: "/v1/approvals/APR-0311/decision", headers: { ...tok("u-shift-lead"), ...key() }, payload: { decision: "approve" } });
    expect(again.statusCode).toBe(409);
    const wo = (await app.inject({ url: "/v1/work-orders/WO-0311", headers: tok("u-technician") })).json();
    expect(wo.isDraft).toBe(true); expect(wo.status).toBe("approved");
  });
});

describe("work order steps", () => {
  it("refuses steps before approval", async () => {
    const r = await app.inject({ method: "PUT", url: "/v1/work-orders/WO-0311/steps/1", headers: { ...tok("u-technician"), ...key() }, payload: { done: true } });
    expect(r.statusCode).toBe(409);
  });
  it("rejects a reading outside the instrument range and completes with a finding", async () => {
    await app.inject({ method: "POST", url: "/v1/approvals/APR-0311/decision", headers: { ...tok("u-shift-lead"), ...key() }, payload: { decision: "approve" } });
    const bad = await app.inject({ method: "PUT", url: "/v1/work-orders/WO-0311/steps/3", headers: { ...tok("u-technician"), ...key() }, payload: { value: 184 } });
    expect(bad.statusCode).toBe(422);
    for (const [no, body] of [[1, { done: true }], [2, { done: true }], [3, { value: 18.4, done: true }], [4, { done: true }], [5, { choice: "Strainer partly blocked", done: true }]] as const) {
      const r = await app.inject({ method: "PUT", url: `/v1/work-orders/WO-0311/steps/${no}`, headers: { ...tok("u-technician"), ...key() }, payload: body });
      expect(r.statusCode).toBe(200);
    }
    const inc = (await app.inject({ url: "/v1/incidents/INC-0042", headers: tok("u-shift-lead") })).json();
    expect(inc.state).toBe("verifying");
  });
});

describe("degradation and edition", () => {
  it("uses the template summary when no model is available (L2)", async () => {
    await level("L2");
    expect((await app.inject({ url: "/v1/incidents/INC-0042", headers: tok("u-shift-lead") })).json().summary.kind).toBe("template");
  });
  it("pauses non-basic trust checks at L4", async () => {
    await level("L4");
    const checks = (await app.inject({ url: "/v1/sensors/FT-401/trust", headers: tok("u-reliability") })).json().checks as Array<{ name: string; status: string }>;
    expect(checks.find(c => c.name === "Calibration age")?.status).toBe("not_running");
    expect(checks.find(c => c.name === "Flatline")?.status).toBe("ok");
  });
});

describe("plant view (ING-7, ING-12, W14)", () => {
  type Sensor = { id: string; status: string; direction: string | null; lastValue: number | null; normalRange: { min: number; max: number } | null; maxSilenceSeconds: number | null };
  type Machine = { id: string; state: string; plantTag: string | null; sensors: Sensor[] };
  type Plant = { counts: Record<string, number>; sites: { id: string; lines: { id: string; stations: { id: string; isBottleneck: boolean; bufferToNextMinutes: number | null; machines: Machine[] }[] }[] }[] };
  const plant = async (who = "u-shift-lead") => (await app.inject({ url: "/v1/plant", headers: tok(who) })).json() as Plant;
  const machinesOf = (p: Plant) => p.sites.flatMap(s => s.lines.flatMap(l => l.stations.flatMap(st => st.machines)));
  const sensor = (p: Plant, id: string) => machinesOf(p).flatMap(m => m.sensors).find(s => s.id === id)!;
  const machine = (p: Plant, id: string) => machinesOf(p).find(m => m.id === id)!;
  /** Writes readings for a sensor, newest last, one second apart, ending `ageS` seconds before the telemetry clock. */
  async function readings(sensorId: string, values: number[], ageS = 1, tenant = "t-demo") {
    const c = await ctx.admin.connect();
    try {
      for (const [k, v] of values.entries()) {
        await c.query("INSERT INTO tel.telemetry_point (tenant_id, sensor_id, ts, value) VALUES ($1, $2, $3, $4)",
          [tenant, sensorId, new Date(telemetryClock.getTime() - (ageS + values.length - 1 - k) * 1000), v]);
      }
    } finally { c.release(); }
  }

  it("lists every site, line, station, machine and sensor of the tenant with its limits", async () => {
    const p = await plant();
    expect(p.sites.map(s => s.id).sort()).toEqual(["SITE-DEMO", "site-a"]);
    const cnc = p.sites.find(s => s.id === "SITE-DEMO")!.lines[0]!;
    expect(cnc.stations.map(s => s.id)).toEqual(["ST-01", "ST-02", "ST-03", "ST-04", "ST-05", "ST-06", "ST-07", "ST-08", "ST-09", "ST-10"]);
    expect(cnc.stations.find(s => s.id === "ST-04")!.isBottleneck).toBe(true);
    expect(cnc.stations.find(s => s.id === "ST-03")!.bufferToNextMinutes).toBeNull();
    expect(machine(p, "M-05")).toMatchObject({ plantTag: "MC-05", state: "unknown" });
    expect(sensor(p, "S-05-SPD")).toMatchObject({ normalRange: { min: 5500, max: 6500 }, maxSilenceSeconds: 10 });
    expect(machinesOf(p).flatMap(m => m.sensors)).toHaveLength(39);
  });

  it("never shows another tenant's equipment (invariant 4)", async () => {
    const acme = await plant("u-acme-lead");
    expect(acme.sites.map(s => s.id)).toEqual(["site-x"]);
    expect(machinesOf(acme).flatMap(m => m.sensors).map(s => s.id)).toEqual(["PT-X1"]);
    expect(machinesOf(await plant()).flatMap(m => m.sensors).map(s => s.id)).not.toContain("PT-X1");
  });

  it("reports no data for every sensor before any telemetry arrives", async () => {
    const p = await plant();
    expect(p.counts).toEqual({ ok: 0, out_of_range: 0, flatline: 0, stale: 0, no_data: 39, not_configured: 0 });
  });

  it("judges ok, out of range, flatline and stale from real readings, and machine state from the state sensor", async () => {
    await readings("S-01-SPD", [5890, 5901, 5896, 5905, 5899, 5902, 5893, 5900, 5904, 5897]);
    await readings("S-05-SPD", [4.2, 4.2]);
    await readings("S-03-VIB", Array(10).fill(2.168));
    await readings("S-07-TMP", [50.7], 30);
    await readings("S-02-SPD", [500]);
    const p = await plant();
    expect(sensor(p, "S-01-SPD")).toMatchObject({ status: "ok", lastValue: 5897 });
    expect(sensor(p, "S-05-SPD")).toMatchObject({ status: "out_of_range", direction: "low", lastValue: 4.2 });
    expect(sensor(p, "S-03-VIB").status).toBe("flatline");
    expect(sensor(p, "S-07-TMP").status).toBe("stale");
    expect([machine(p, "M-01").state, machine(p, "M-05").state, machine(p, "M-02").state, machine(p, "M-07").state]).toEqual(["running", "stopped", "idle", "unknown"]);
    expect(p.counts).toMatchObject({ ok: 1, out_of_range: 2, flatline: 1, stale: 1, no_data: 34 });
  });

  it("does not report a steady signal on a stopped machine as a flatline", async () => {
    await readings("S-05-SPD", Array(10).fill(4.2));
    await readings("S-05-TMP", Array(10).fill(45.4));
    await readings("S-03-SPD", Array(10).fill(5900));
    await readings("S-03-VIB", Array(10).fill(2.168));
    const p = await plant();
    expect(machine(p, "M-05").state).toBe("stopped");
    expect(sensor(p, "S-05-TMP").status).toBe("ok");
    expect(machine(p, "M-03").state).toBe("running");
    expect(sensor(p, "S-03-VIB").status).toBe("flatline");
  });

  it("ignores readings older than the lookback window", async () => {
    await readings("S-01-SPD", [5900], ctx.cfg.telemetry_health.lookback_minutes * 60 + 5);
    expect(sensor(await plant(), "S-01-SPD").status).toBe("no_data");
  });

  it("requires authentication", async () => {
    expect((await app.inject({ url: "/v1/plant" })).statusCode).toBe(401);
  });

  it("mock telemetry control writes oldest-first readings ending ageSeconds ago", async () => {
    const r = await app.inject({ method: "POST", url: "/mock/telemetry", payload: { sensorId: "S-09-SPD", values: [6000, 10.8], ageSeconds: 2 } });
    expect(r.statusCode).toBe(204);
    const s = sensor(await plant(), "S-09-SPD");
    expect(s).toMatchObject({ status: "out_of_range", direction: "low", lastValue: 10.8 });
    expect((s as unknown as { silentForSeconds: number }).silentForSeconds).toBe(2);
    expect(machine(await plant(), "M-09").state).toBe("stopped");
  });

  it("mock telemetry control rejects unknown sensors and bad values", async () => {
    expect((await app.inject({ method: "POST", url: "/mock/telemetry", payload: { sensorId: "S-99", values: [1] } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/mock/telemetry", payload: { sensorId: "S-01-SPD", values: [] } })).statusCode).toBe(422);
    expect((await app.inject({ method: "POST", url: "/mock/telemetry", payload: { sensorId: "S-01-SPD", values: [1], ageSeconds: -1 } })).statusCode).toBe(422);
  });
});

describe("role-based access (NFR-S6, ADR-040)", () => {
  const get = (url: string, who: string) => app.inject({ url, headers: tok(who) });
  const session = async (who: string) => (await get("/v1/session", who)).json() as { role: string; permissions: Record<string, string> };
  const roles: Record<string, string> = { "u-operator": "operator", "u-technician": "technician", "u-shift-lead": "shift_lead", "u-reliability": "reliability_engineer", "u-ops-manager": "operations_manager", "u-admin": "admin" };
  const setPermission = (payload: object, who = "u-admin") => app.inject({ method: "PUT", url: "/v1/admin/permissions", headers: { ...tok(who), ...key() }, payload });
  const setRole = (id: string, role: string, who = "u-admin") => app.inject({ method: "PUT", url: `/v1/admin/users/${id}/role`, headers: { ...tok(who), ...key() }, payload: { role } });
  async function audit(action: string): Promise<{ object_id: string; payload: unknown }[]> {
    return (await ctx.admin.query<{ object_id: string; payload: unknown }>("SELECT object AS object_id, payload FROM gov.audit_event WHERE action = $1 ORDER BY seq", [action])).rows;
  }

  it("gives each role exactly its configured screen access in the session", async () => {
    for (const [who, role] of Object.entries(roles)) {
      const s = await session(who);
      expect(s.role).toBe(role);
      expect(s.permissions, who).toEqual(ctx.cfg.rbac.screens[role as keyof typeof ctx.cfg.rbac.screens]);
    }
  });

  it("has an access rule for every /v1 route and no rule for a route that does not exist", () => {
    const v1 = app.routeKeys.filter(k => k.split(" ")[1]!.startsWith("/v1/"));
    expect(v1.filter(k => !(k in ROUTE_RULES))).toEqual([]);
    expect(Object.keys(ROUTE_RULES).filter(k => !v1.includes(k))).toEqual([]);
  });

  it("enforces the matrix on the API, not only in the menu", async () => {
    const cases: [string, string, number][] = [
      ["u-operator", "/v1/plant", 200], ["u-operator", "/v1/alerts", 200], ["u-operator", "/v1/approvals", 403], ["u-operator", "/v1/sensors", 403], ["u-operator", "/v1/knowledge/documents", 403],
      ["u-technician", "/v1/approvals", 200], ["u-technician", "/v1/work-orders/WO-0311", 200], ["u-technician", "/v1/sensors", 403],
      ["u-shift-lead", "/v1/sensors", 200], ["u-reliability", "/v1/sensors/PT-310/trust", 200],
      ["u-ops-manager", "/v1/knowledge/stats", 403], ["u-admin", "/v1/alerts", 403], ["u-admin", "/v1/admin/users", 200], ["u-shift-lead", "/v1/admin/users", 403],
    ];
    for (const [who, url, status] of cases) expect((await get(url, who)).statusCode, `${who} ${url}`).toBe(status);
  });

  it("refuses actions for view-only access with a clear reason", async () => {
    const r = await app.inject({ method: "POST", url: "/v1/approvals/APR-0311/decision", headers: { ...tok("u-technician"), ...key() }, payload: { decision: "approve" } });
    expect(r.statusCode).toBe(403);
    expect(r.json().detail).toMatch(/no use access to approvals/);
  });

  it("lists only the admin's own tenant users and marks which roles can be assigned", async () => {
    const users = (await get("/v1/admin/users", "u-admin")).json() as { principalId: string; assignable: boolean }[];
    expect(users.map(u => u.principalId)).not.toContain("u-acme-lead");
    expect(users.find(u => u.principalId === "k-integration")!.assignable).toBe(false);
    expect(users.find(u => u.principalId === "u-technician")!.assignable).toBe(true);
  });

  it("assigns a role, takes effect on the next request and is audited", async () => {
    const r = await setRole("u-technician", "shift_lead");
    expect(r.statusCode).toBe(200);
    expect(r.json().user.role).toBe("shift_lead");
    expect((await session("u-technician")).permissions.trust).toBe("view");
    expect((await get("/v1/sensors", "u-technician")).statusCode).toBe(200);
    expect(await audit("rbac.role_assigned")).toEqual([{ object_id: "u-technician", payload: { from: "technician", to: "shift_lead" } }]);
  });

  it("refuses self-assignment, non-human principals, unknown roles, other tenants and missing idempotency keys", async () => {
    expect((await setRole("u-admin", "operator")).statusCode).toBe(409);
    expect((await setRole("k-integration", "admin")).statusCode).toBe(422);
    expect((await setRole("u-technician", "superuser")).statusCode).toBe(422);
    expect((await setRole("u-acme-lead", "operator")).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: "/v1/admin/users/u-technician/role", headers: tok("u-admin"), payload: { role: "operator" } })).statusCode).toBe(422);
    expect((await setRole("u-technician", "admin", "u-shift-lead")).statusCode).toBe(403);
    expect(await audit("rbac.role_assigned")).toEqual([]);
  });

  it("overrides one role's screen access, resets it to the default, and audits both", async () => {
    let r = await setPermission({ role: "technician", screen: "trust", access: "view" });
    expect(r.statusCode).toBe(200);
    expect(r.json().cell).toMatchObject({ role: "technician", screen: "trust", access: "view", defaultAccess: "none", overridden: true });
    expect((await get("/v1/sensors", "u-technician")).statusCode).toBe(200);
    const m = (await get("/v1/admin/permissions", "u-admin")).json() as { cells: { role: string; screen: string; overridden: boolean }[] };
    expect(m.cells.filter(c => c.overridden).map(c => `${c.role}:${c.screen}`)).toEqual(["technician:trust"]);
    r = await setPermission({ role: "technician", screen: "trust", access: "default" });
    expect(r.json().cell).toMatchObject({ access: "none", overridden: false });
    expect((await get("/v1/sensors", "u-technician")).statusCode).toBe(403);
    expect((await audit("rbac.permission_changed")).map(a => a.payload)).toEqual([{ from: "none", to: "view" }, { from: "view", to: "default" }]);
  });

  it("keeps the admin's own Admin access locked and validates input", async () => {
    expect((await setPermission({ role: "admin", screen: "admin", access: "none" })).statusCode).toBe(409);
    expect((await setPermission({ role: "admin", screen: "reports", access: "use" })).statusCode).toBe(422);
    expect((await setPermission({ role: "admin", screen: "plant", access: "write" })).statusCode).toBe(422);
    expect((await setPermission({ role: "operator", screen: "plant", access: "none" }, "u-ops-manager")).statusCode).toBe(403);
  });

  it("keeps one tenant's overrides out of another tenant", async () => {
    await setPermission({ role: "shift_lead", screen: "plant", access: "none" });
    expect((await get("/v1/plant", "u-shift-lead")).statusCode).toBe(403);
    expect((await get("/v1/plant", "u-acme-lead")).statusCode).toBe(200);
  });
});
