import { describe, expect, it } from "vitest";
import { roleLockReason, roleRows, screenTitle } from "./derive";

const user = (over: object) => ({ principalId: "u-technician", displayName: "Jordan Lee", role: "technician" as const, sessionType: "human" as const, siteId: "site-a", assignable: true, ...over });

describe("roleLockReason", () => {
  it("allows changing another human user's role", () => expect(roleLockReason(user({}), "u-admin")).toBeNull());
  it("refuses the admin's own role", () => expect(roleLockReason(user({ principalId: "u-admin" }), "u-admin")).toMatch(/Your own role/));
  it("refuses API keys and agent tokens", () => expect(roleLockReason(user({ assignable: false, sessionType: "api_key" }), "u-admin")).toMatch(/API keys/));
});

describe("roleRows", () => {
  it("lists one role's cells in sidebar order with titles and edition flags", () => {
    const m = {
      roles: ["technician" as const], screens: ["trust" as const, "plant" as const], editionHidden: ["trust" as const],
      cells: [
        { role: "technician" as const, screen: "trust" as const, access: "none" as const, defaultAccess: "none" as const, overridden: false, locked: false },
        { role: "technician" as const, screen: "plant" as const, access: "use" as const, defaultAccess: "use" as const, overridden: false, locked: false },
        { role: "admin" as const, screen: "plant" as const, access: "use" as const, defaultAccess: "use" as const, overridden: false, locked: false },
      ],
    };
    expect(roleRows(m, "technician").map(r => [r.title, r.editionHidden])).toEqual([["Plant", false], ["Trust", true]]);
    expect(roleRows(undefined, "technician")).toEqual([]);
  });
  it("titles screens like the navigation does", () => expect(screenTitle("control_tower")).toBe("Control Tower"));
});
