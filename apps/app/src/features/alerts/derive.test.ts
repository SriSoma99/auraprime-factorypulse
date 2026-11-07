import { describe, it, expect } from "vitest";
import type { Alert, AlertList, FallbackLevel } from "@fp/sdk-ts";
import { deriveQueue } from "./derive";

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "alt-001",
    assetName: "Robotic Cell 4",
    stationName: "Station 4",
    signalName: "Weld Cell 4 Coolant Flow",
    detail: "Flow trending down (-18%) while transformer return temperature rises",
    impact: "high",
    trust: { level: "medium", score: 0.78 },
    status: "new",
    arrivedAt: "2026-10-05T08:00:00Z",
    leadTime: { minHours: 6, maxHours: 14, confidence: "medium" },
    incidentId: "inc-001",
    rank: 1,
    isSynthetic: false,
    ...overrides,
  };
}

describe("deriveQueue (W02 alert queue view derivation)", () => {
  it("formats single alert row correctly with impact and lead time", () => {
    const alert = makeAlert();
    const list: AlertList = {
      items: [alert],
      groups: [],
      total: 1,
      likelyCauses: 1,
      sortedBy: "impact",
    };

    const res = deriveQueue(list, "L0");
    expect(res.header).toBe("1 alerts · 1 likely causes");
    expect(res.showImpact).toBe(true);
    expect(res.sortNote).toBe("Sorted by line impact");
    expect(res.rows).toHaveLength(1);

    const row = res.rows[0];
    expect(row.kind).toBe("alert");
    if (row.kind === "alert") {
      expect(row.id).toBe("alt-001");
      expect(row.rank).toBe("1");
      expect(row.leadTime).toBe("6–14 h");
      expect(row.leadHint).toBe("medium confidence");
      expect(row.impactBasic).toBe(false);
      expect(row.child).toBe(false);
      expect(row.status).toBe("New");
    }
  });

  it("marks impactBasic: true when degradation level is L4 or L5", () => {
    const alert = makeAlert();
    const list: AlertList = {
      items: [alert],
      groups: [],
      total: 1,
      likelyCauses: 1,
      sortedBy: "impact",
    };

    const resL4 = deriveQueue(list, "L4");
    expect((resL4.rows[0] as any).impactBasic).toBe(true);

    const resL5 = deriveQueue(list, "L5");
    expect((resL5.rows[0] as any).impactBasic).toBe(true);

    const resL0 = deriveQueue(list, "L0");
    expect((resL0.rows[0] as any).impactBasic).toBe(false);
  });

  it("groups correlated alerts into a group row and child alert rows", () => {
    const alert1 = makeAlert({ id: "alt-001", groupId: "grp-1", arrivedAt: "2026-10-05T08:00:00Z" });
    const alert2 = makeAlert({
      id: "alt-002",
      groupId: "grp-1",
      signalName: "Transformer Temperature Secondary",
      arrivedAt: "2026-10-05T08:02:00Z",
    });

    const list: AlertList = {
      items: [alert1, alert2],
      groups: [
        {
          id: "grp-1",
          title: "Coolant Loop Restriction & Temperature Spike",
          alertIds: ["alt-001", "alt-002"],
          likelyCauses: 1,
          incidentId: "inc-001",
        },
      ],
      total: 2,
      likelyCauses: 1,
      sortedBy: "impact",
    };

    const res = deriveQueue(list, "L0");
    // Should have 1 group header row + 2 child alert rows = 3 rows
    expect(res.rows).toHaveLength(3);

    const groupRow = res.rows[0];
    expect(groupRow.kind).toBe("group");
    if (groupRow.kind === "group") {
      expect(groupRow.id).toBe("grp-1");
      expect(groupRow.title).toBe("Coolant Loop Restriction & Temperature Spike");
      expect(groupRow.summary).toContain("2 correlated alerts");
      expect(groupRow.summary).toContain("1 likely cause");
    }

    const childRow1 = res.rows[1];
    expect(childRow1.kind).toBe("alert");
    if (childRow1.kind === "alert") {
      expect(childRow1.child).toBe(true);
      expect(childRow1.id).toBe("alt-001");
    }

    const childRow2 = res.rows[2];
    expect(childRow2.kind).toBe("alert");
    if (childRow2.kind === "alert") {
      expect(childRow2.child).toBe(true);
      expect(childRow2.id).toBe("alt-002");
    }
  });

  it("handles non-impact sort order correctly for Community edition", () => {
    const alert = makeAlert();
    const list: AlertList = {
      items: [alert],
      groups: [],
      total: 1,
      likelyCauses: 1,
      sortedBy: "newest",
    };

    const res = deriveQueue(list, "L0");
    expect(res.showImpact).toBe(false);
    expect(res.sortNote).toContain("impact ranking and lead time are Full only");
  });
});

