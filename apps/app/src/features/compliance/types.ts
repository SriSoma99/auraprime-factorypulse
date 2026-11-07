// Types for W08 Compliance Evidence (02 section 6.1; REG-1 to REG-8, POL-3, ADR-015).

export interface ModelRegistration {
  name: string;
  version: string;
  role: string;
  evalTolerancePct: number;
  hash: string;
}

export interface ComplianceData {
  auditChainVerified: boolean;
  verifiedEventsCount: number;
  brokenLinkIndex: number | null;
  rootHash: string;
  headHash: string;
  sbomStatus: "signed" | "pending" | "failed";
  sbomPackageCount: number;
  modelRegister: ModelRegistration[];
  evidencePackGeneratedAt: string;
}

export type ComplianceScreenState = "loading" | "error" | "verified" | "tampered";
