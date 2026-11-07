import { describe, it, expect } from "vitest";
import type { Approval } from "@fp/sdk-ts";
import {
  deriveApprovalScreenState,
  deriveCanDecide,
  deriveApprovalListItems,
} from "./derive";

function makeApproval(overrides: Partial<Approval> = {}): Approval {
  return {
    id: "appr-001",
    incidentId: "inc-001",
    workOrderId: "wo-001",
    title: "Inspect and flush weld cell 4 coolant loop",
    assetName: "Robotic Weld Cell 4",
    isDraft: true,
    tier: 1,
    requiredRole: "shift_lead",
    rationale: "Coolant flow restriction detected with 82% confidence",
    ruleIds: ["POL-SAF-001"],
    policyVersion: "v1.2",
    expiresAt: "2026-10-05T12:00:00Z",
    status: "pending",
    evidenceSummary: ["Flow dropped below 14.2 L/min"],
    canDecide: true,
    ...overrides,
  };
}

describe("Approvals pure view-state derivation (W04 / M03)", () => {
  it("determines screen states correctly", () => {
    const pending = makeApproval();
    expect(deriveApprovalScreenState(pending, false, false)).toBe("pending");

    expect(deriveApprovalScreenState(null, true, false)).toBe("loading");
    expect(deriveApprovalScreenState(null, false, true)).toBe("error");

    const approved = makeApproval({ status: "approved" });
    expect(deriveApprovalScreenState(approved, false, false)).toBe("decided");

    const rejected = makeApproval({ status: "rejected" });
    expect(deriveApprovalScreenState(rejected, false, false)).toBe("decided");

    const escalated = makeApproval({ status: "escalated" });
    expect(deriveApprovalScreenState(escalated, false, false)).toBe("escalated");

    const expired = makeApproval({ status: "expired" });
    expect(deriveApprovalScreenState(expired, false, false)).toBe("expired");

    const unauthorized = makeApproval({ canDecide: false });
    expect(deriveApprovalScreenState(unauthorized, false, false)).toBe("cannotDecide");
  });

  it("enforces decision permissions and rejection reason requirement", () => {
    const appr = makeApproval({ canDecide: true });

    // Without reason, cannot reject, but can submit approve
    const withoutReason = deriveCanDecide(appr, "", false);
    expect(withoutReason.canSubmit).toBe(true);
    expect(withoutReason.canReject).toBe(false);

    // With reason, can reject
    const withReason = deriveCanDecide(appr, "Sensor looks miscalibrated", false);
    expect(withReason.canSubmit).toBe(true);
    expect(withReason.canReject).toBe(true);

    // When busy/submitting, both disabled
    const busyState = deriveCanDecide(appr, "Reason", true);
    expect(busyState.canSubmit).toBe(false);
    expect(busyState.canReject).toBe(false);

    // When user has no authority (canDecide: false)
    const unauthorized = makeApproval({ canDecide: false });
    const noAuth = deriveCanDecide(unauthorized, "Reason", false);
    expect(noAuth.canSubmit).toBe(false);
    expect(noAuth.canReject).toBe(false);
  });

  it("calculates list items and soon expiration flag correctly", () => {
    const now = "2026-10-05T11:45:00Z"; // 15 mins before 12:00:00Z
    const appr1 = makeApproval({ id: "appr-1", expiresAt: "2026-10-05T12:00:00Z" });
    const appr2 = makeApproval({ id: "appr-2", expiresAt: "2026-10-05T15:00:00Z" });

    const items = deriveApprovalListItems([appr1, appr2], now);
    expect(items).toHaveLength(2);

    expect(items[0].id).toBe("appr-1");
    expect(items[0].soon).toBe(true); // < 60 mins

    expect(items[1].id).toBe("appr-2");
    expect(items[1].soon).toBe(false); // > 60 mins
  });
});
