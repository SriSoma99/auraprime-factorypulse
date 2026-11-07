// Unit tests for screen-access resolution and route rules (ADR-040).
import { describe, it, expect } from "vitest";
import { configSchema } from "@fp/config";
import { denyReason, resolvePermissions, ROUTE_RULES } from "./rbac.ts";

const defaults = configSchema.parse({}).rbac.screens;

describe("resolvePermissions", () => {
  it("starts from the role's config defaults", () => {
    expect(resolvePermissions(defaults.technician, [], "full")).toEqual(defaults.technician);
  });
  it("applies tenant overrides and ignores unknown screens", () => {
    const p = resolvePermissions(defaults.technician, [{ screen: "trust", access: "view" }, { screen: "reports", access: "use" }], "full");
    expect(p.trust).toBe("view");
    expect(Object.keys(p)).not.toContain("reports");
  });
  it("hides Full-only screens in Community whatever the role or override grants", () => {
    const p = resolvePermissions(defaults.reliability_engineer, [{ screen: "compliance", access: "use" }], "community");
    expect([p.trust, p.learning, p.control_tower, p.compliance]).toEqual(["none", "none", "none", "none"]);
    expect(p.approvals).toBe("use");
  });
});

describe("denyReason", () => {
  const tech = resolvePermissions(defaults.technician, [], "full");
  it("allows routes open to every signed-in user", () => {
    expect(denyReason("any", tech)).toBeNull();
  });
  it("denies a route with no rule (default deny)", () => {
    expect(denyReason(undefined, tech)).toMatch(/No access rule/);
  });
  it("needs use for actions and accepts view for reads", () => {
    expect(denyReason(ROUTE_RULES["GET /v1/approvals"], tech)).toBeNull();
    expect(denyReason(ROUTE_RULES["POST /v1/approvals/:approvalId/decision"], tech)).toMatch(/no use access to approvals/);
  });
  it("accepts any of several screens that share a route", () => {
    const relia = resolvePermissions(defaults.reliability_engineer, [], "full");
    expect(relia.field).toBe("none");
    expect(denyReason(ROUTE_RULES["GET /v1/work-orders/:workOrderId"], relia)).toBeNull();
    expect(denyReason(ROUTE_RULES["PUT /v1/work-orders/:workOrderId/steps/:stepNo"], relia)).toMatch(/field/);
  });
});
