import { describe, expect, it } from "vitest";
import { deriveDeveloperState, deriveQuotaPercent } from "./derive";

describe("deriveDeveloperState", () => {
  it("returns loading when loading is true", () => {
    expect(deriveDeveloperState(true, false)).toBe("loading");
  });

  it("returns error on error", () => {
    expect(deriveDeveloperState(false, true)).toBe("error");
  });

  it("returns normal when ready", () => {
    expect(deriveDeveloperState(false, false)).toBe("normal");
  });
});

describe("deriveQuotaPercent", () => {
  it("calculates quota consumption percentage", () => {
    expect(deriveQuotaPercent(2500, 10000)).toBe(25);
    expect(deriveQuotaPercent(12000, 10000)).toBe(100);
  });
});
