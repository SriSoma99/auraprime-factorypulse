import { describe, it, expect } from "vitest";
import type { Incident } from "@fp/sdk-ts";
import { screenState } from "./derive";

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: "inc-001",
    title: "Coolant Flow Restriction (Robotic Weld Cell 4)",
    state: "awaiting_approval",
    openedAt: "2026-10-05T08:00:00Z",
    summary: {
      text: "Diagnosed restriction in coolant line.",
      kind: "ai",
    },
    hypotheses: [
      { rank: 1, name: "Coolant line blockage", probability: 0.82, confirmed: false },
    ],
    evidence: [
      { polarity: "for", text: "Sensor delta across inlet/outlet exceeded threshold", citationId: "cit-001" },
    ],
    whatWouldChange: ["Check manual bypass valve"],
    citations: [
      {
        id: "cit-001",
        title: "Standard Operating Procedure: Coolant Loop Maintenance",
        section: "Section 4.2",
        version: "v2.1",
        effectiveFrom: "2026-01-15",
        verified: true,
      },
    ],
    sensorTrust: [],
    timeline: [
      { step: "Alert detected", done: true },
      { step: "Diagnosis completed", done: true },
    ],
    traceId: "trc-001",
    ...overrides,
  };
}

describe("Incident screenState derivation (W03 / M02)", () => {
  it("returns 'diagnosed' for standard AI summary with confirmed citation", () => {
    const inc = makeIncident();
    expect(screenState(inc)).toBe("diagnosed");
  });

  it("returns 'reopened' when state is reopened", () => {
    const inc = makeIncident({ state: "reopened" });
    expect(screenState(inc)).toBe("reopened");
  });

  it("returns 'verified' when state is verified", () => {
    const inc = makeIncident({ state: "verified" });
    expect(screenState(inc)).toBe("verified");
  });

  it("returns 'citationBlocked' when citationBlocked flag is set (RAG-6)", () => {
    const inc = makeIncident({ citationBlocked: true });
    expect(screenState(inc)).toBe("citationBlocked");
  });

  it("returns 'degraded' when summary.kind is template (L2-L5 fallback)", () => {
    const inc = makeIncident({
      summary: { text: "Deterministic rule match", kind: "template" },
    });
    expect(screenState(inc)).toBe("degraded");
  });

  it("returns 'abstained' when abstention metadata is present", () => {
    const inc = makeIncident({
      abstention: {
        reason: "Sensor trust below diagnostic threshold",
        proposedCheck: "Calibrate primary flowmeter FM-04",
        minutes: 15,
      },
    });
    expect(screenState(inc)).toBe("abstained");
  });
});
