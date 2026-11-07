// ViewModel for W08 Compliance Evidence (ADR-028; REG-1..8, POL-3, ADR-015).
import { useState } from "react";
import { deriveComplianceState } from "./derive";
import type { ComplianceData } from "./types";

export function useComplianceVM() {
  const [downloading, setDownloading] = useState(false);

  const brokenLinkIndex: number | null = null;
  const verifiedEventsCount = 1280;
  const sbomPackageCount = 148;
  const isAuditChainValid = brokenLinkIndex === null && verifiedEventsCount > 0;
  const activeSbomState: "signed" | "pending" | "failed" = sbomPackageCount > 0 ? "signed" : "pending";

  // Synthetic governance and compliance ledger status (POL-3, REG-7)
  const data: ComplianceData = {
    auditChainVerified: isAuditChainValid,
    verifiedEventsCount,
    brokenLinkIndex,
    rootHash: "0000000000000000000000000000000000000000000000000000000000000000",
    headHash: "8f3b2a1c9e4d5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a",
    sbomStatus: activeSbomState,
    sbomPackageCount,
    modelRegister: [
      { name: "all-MiniLM-L6-v2", version: "2.0", role: "Hybrid Vector Embedding (384-dim)", evalTolerancePct: 2.0, hash: "9a8b7c6d5e4f" },
      { name: "isolation-forest-baseline", version: "1.1", role: "Univariate & Multivariate Outlier Detection", evalTolerancePct: 1.5, hash: "1a2b3c4d5e6f" },
      { name: "fmea-causal-dag", version: "2.0", role: "Deterministic Root-Cause Ranking (AGT-2)", evalTolerancePct: 0.0, hash: "3f4e5d6c7b8a" },
    ],
    evidencePackGeneratedAt: "2026-10-05T12:00:00Z",
  };

  const state = deriveComplianceState(data, false, false);

  const generateEvidencePack = () => {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
    }, 1200);
  };

  return {
    state,
    data,
    downloading,
    generateEvidencePack,
  };
}
