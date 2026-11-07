// Pure view-state derivation for W03 Incident detail and M02 Alert summary (ADR-028).
import type { Incident } from "@fp/sdk-ts";

export type IncidentScreenState =
  | "loading"
  | "error"
  | "abstained"
  | "verified"
  | "degraded"
  | "citationBlocked"
  | "reopened"
  | "diagnosed";

export function screenState(i: Incident): IncidentScreenState {
  if (i.state === "reopened") return "reopened";
  if (i.state === "verified") return "verified";
  if (i.citationBlocked) return "citationBlocked";
  if (i.summary.kind === "template") return "degraded";
  if (i.abstention) return "abstained";
  return "diagnosed";
}
