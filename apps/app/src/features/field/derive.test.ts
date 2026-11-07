import { describe, expect, it } from "vitest";
import { countPendingSync, validateNumericReading } from "./derive";
import type { OfflineQueueItem } from "./types";

const mockQueue: OfflineQueueItem[] = [
  { id: "q1", assetId: "ast-01", type: "reading", data: "4.2 L/min", timestamp: "12:00", syncStatus: "pending" },
  { id: "q2", assetId: "ast-02", type: "note", data: "Strainer mesh cleaned", timestamp: "12:05", syncStatus: "synced" },
];

describe("countPendingSync", () => {
  it("counts pending offline items", () => {
    expect(countPendingSync(mockQueue)).toBe(1);
  });
});

describe("validateNumericReading", () => {
  it("validates within range", () => {
    expect(validateNumericReading("4.2", 0, 10).valid).toBe(true);
    expect(validateNumericReading("15.0", 0, 10).valid).toBe(false);
    expect(validateNumericReading("abc", 0, 10).valid).toBe(false);
  });
});
