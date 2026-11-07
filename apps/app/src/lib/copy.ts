// User-facing wording for system states (02 section 7.4). Kept in one place so it can move to tenant label config.
import type { FallbackLevel } from "@fp/sdk-ts";
export const fallbackBanner: Record<FallbackLevel, { tone: "warn" | "bad"; text: string } | null> = {
  L0: null,
  L1: { tone: "warn", text: "Reduced explanation quality: a smaller model is in use." },
  L2: { tone: "warn", text: "Explanations use templates. Alerts and evidence are unaffected." },
  L3: { tone: "bad", text: "Knowledge search unavailable: guidance is unverified and a higher approval tier is required." },
  L4: { tone: "bad", text: "Basic detection only (thresholds). Impact and trust use basic checks." },
  L5: { tone: "bad", text: "Offline: edge alerts only. Changes will sync." },
};
export const advisoryNote = "This app does not control equipment. Work orders are drafts until a person approves them.";
