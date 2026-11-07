import { describe, expect, it } from "vitest";
import { deriveComplianceState } from "./derive";
import type { ComplianceData } from "./types";

const mockCompliance: ComplianceData = {
  auditChainVerified: true,
  verifiedEventsCount: 1280,
  brokenLinkIndex: null,
  rootHash: "0000000000000000000000000000000000000000000000000000000000000000",
  headHash: "8f3b2a1c9e4d5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a",
  sbomStatus: "signed",
  sbomPackageCount: 148,
  modelRegister: [
    { name: "all-MiniLM-L6-v2", version: "2.0", role: "Embedding 384-dim", evalTolerancePct: 2.0, hash: "9a8b7c6d" },
  ],
  evidencePackGeneratedAt: "2026-10-05T12:00:00Z",
};

describe("deriveComplianceState", () => {
  it("returns loading when loading is true", () => {
    expect(deriveComplianceState(null, true, false)).toBe("loading");
  });

  it("returns error on error", () => {
    expect(deriveComplianceState(null, false, true)).toBe("error");
  });

  it("returns verified when audit chain passes", () => {
    expect(deriveComplianceState(mockCompliance, false, false)).toBe("verified");
  });

  it("returns tampered when audit chain breaks or has broken index", () => {
    expect(deriveComplianceState({ ...mockCompliance, auditChainVerified: false }, false, false)).toBe("tampered");
    expect(deriveComplianceState({ ...mockCompliance, brokenLinkIndex: 42 }, false, false)).toBe("tampered");
  });
});
