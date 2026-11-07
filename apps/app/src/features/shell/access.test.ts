import { describe, expect, it } from "vitest";
import { canUse, canView, firstAllowedHref, navigation, pathAllowed, screensForPath, type Permissions } from "./access";

const none: Permissions = { plant: "none", line: "none", alerts: "none", approvals: "none", field: "none", knowledge: "none", trust: "none", learning: "none", control_tower: "none", compliance: "none", developer: "none", admin: "none", settings: "none" };
const operator: Permissions = { ...none, plant: "use", line: "use", alerts: "use", settings: "use" };
const technician: Permissions = { ...operator, approvals: "view", field: "use", knowledge: "use" };
const admin: Permissions = { ...none, plant: "use", knowledge: "use", control_tower: "use", compliance: "use", developer: "use", admin: "use", settings: "use" };

describe("access checks", () => {
  it("distinguishes view from use", () => {
    expect([canView(technician, "approvals"), canUse(technician, "approvals")]).toEqual([true, false]);
    expect([canView(technician, "trust"), canView(null, "plant")]).toEqual([false, false]);
  });
});

describe("paths", () => {
  it("maps routes to screens, including detail routes", () => {
    expect(screensForPath("/")).toEqual(["plant"]);
    expect(screensForPath("/approvals/APR-0311")).toEqual(["approvals"]);
    expect(screensForPath("/incidents/INC-0042")).toEqual(["alerts", "approvals"]);
    expect(screensForPath("/work-orders/WO-0311")).toEqual(["field"]);
    expect(screensForPath("/control-tower")).toEqual(["control_tower"]);
    expect(screensForPath("/more")).toBeNull();
  });
  it("allows or refuses a path for a role", () => {
    expect(pathAllowed(operator, "/trust")).toBe(false);
    expect(pathAllowed(operator, "/incidents/INC-0042")).toBe(true);
    expect(pathAllowed(admin, "/alerts")).toBe(false);
    expect(pathAllowed(admin, "/admin")).toBe(true);
  });
  it("sends a user to the first screen they may view", () => {
    expect(firstAllowedHref(operator)).toBe("/");
    expect(firstAllowedHref({ ...none, knowledge: "view" })).toBe("/knowledge");
    expect(firstAllowedHref(none)).toBeNull();
  });
});

describe("navigation", () => {
  it("shows only permitted screens in the sidebar, in catalog order", () => {
    expect(navigation(operator, true).tabs.map(s => s.title)).toEqual(["Plant", "Line", "Alerts", "Settings"]);
    expect(navigation(admin, true).tabs.map(s => s.title)).toEqual(["Plant", "Control Tower", "Knowledge", "Compliance", "Developer", "Admin", "Settings"]);
  });
  it("keeps main screens in the phone bar and the rest under More", () => {
    const n = navigation(technician, false);
    expect(n.tabs.map(s => s.title)).toEqual(["Plant", "Line", "Alerts", "Approvals", "Field"]);
    expect(n.more.map(s => s.title)).toEqual(["Knowledge", "Settings"]);
  });
});
