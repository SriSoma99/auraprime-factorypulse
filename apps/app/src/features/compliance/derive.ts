// Pure view-state derivation for W08 Compliance Evidence (ADR-028).
import type { ComplianceData, ComplianceScreenState } from "./types";

export function deriveComplianceState(
  data: ComplianceData | null | undefined,
  loading: boolean,
  error: boolean
): ComplianceScreenState {
  if (loading) return "loading";
  if (error || !data) return "error";
  if (!data.auditChainVerified || data.brokenLinkIndex !== null) return "tampered";
  return "verified";
}
