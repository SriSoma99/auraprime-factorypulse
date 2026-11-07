// The default role-to-screen matrix approved by the owner on 2026-11-05 (ADR-040).
import { describe, it, expect } from "vitest";
import { configSchema, SCREENS } from "./schema.ts";

const approved = `
               plant line alerts approvals field knowledge trust learning control_tower compliance developer admin settings
operator             u    u      u         -     -         -     -        -             -          -         -     -        u
technician           u    u      u         v     u         u     -        -             -          -         -     -        u
shift_lead           u    u      u         u     u         u     v        -             -          -         -     -        u
reliability_engineer u    u      u         u     -         u     u        u             -          -         -     -        u
operations_manager   u    u      u         u     -         -     -        v             v          v         -     -        u
admin                u    -      -         -     -         u     -        -             u          u         u     u        u`;

describe("rbac.screens defaults", () => {
  const cfg = configSchema.parse({});
  const code = { use: "u", view: "v", none: "-" } as const;

  it("match the approved matrix cell by cell", () => {
    const [header, ...rows] = approved.trim().split("\n").map(l => l.trim().split(/\s+/));
    expect(header).toEqual([...SCREENS]);
    for (const [role, ...cells] of rows) {
      const actual = SCREENS.map(sc => code[cfg.rbac.screens[role as keyof typeof cfg.rbac.screens][sc]]);
      expect(actual, role).toEqual(cells);
    }
  });

  it("refuse a configuration that removes the admin's own admin access", () => {
    const screens = { ...cfg.rbac.screens, admin: { ...cfg.rbac.screens.admin, admin: "view" as const } };
    expect(() => configSchema.parse({ rbac: { screens } })).toThrow(/no lockout/);
  });

  it("refuse unknown screens and access levels", () => {
    expect(() => configSchema.parse({ rbac: { screens: { ...cfg.rbac.screens, operator: { ...cfg.rbac.screens.operator, reports: "use" } } } })).toThrow();
    expect(() => configSchema.parse({ rbac: { screens: { ...cfg.rbac.screens, operator: { ...cfg.rbac.screens.operator, plant: "write" } } } })).toThrow();
  });
});
