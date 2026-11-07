import { describe, it, expect } from "vitest";
import { generate } from "./generate.ts";

const opts = { seed: 7, referenceTime: "2026-10-04T08:50:00Z" };

describe("synthetic dataset", () => {
  it("is deterministic for a seed", () => {
    expect(JSON.stringify(generate(opts))).toBe(JSON.stringify(generate(opts)));
  });
  it("labels every alert synthetic (BR-12)", () => {
    expect(generate(opts).alerts.every(a => a.isSynthetic)).toBe(true);
  });
  it("gives every row a tenant that exists (invariant 4)", () => {
    const d = generate(opts); const tenants = new Set(d.tenants.map(t => t.id));
    const rows = [...d.principals, ...d.sites, ...d.lines, ...d.stations, ...d.assets, ...d.sensors, ...d.alerts, ...d.incidents, ...d.workOrders, ...d.approvals];
    expect(rows.every(r => tenants.has(r.tenantId))).toBe(true);
  });
  it("keeps the hero alert first by impact", () => {
    const top = generate(opts).alerts.filter(a => a.tenantId === "t-demo").sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0];
    expect(top?.incidentId).toBe("INC-0042");
  });
  it("only creates draft work orders and pending approvals", () => {
    const d = generate(opts);
    expect(d.approvals.every(a => a.status === "pending" && a.tier >= 1)).toBe(true);
    expect(d.workOrders.every(w => w.status === "pending_approval")).toBe(true);
  });
});
