import { describe, expect, it } from "vitest";
import { countPendingDraftLessons, deriveLearningState } from "./derive";
import type { LessonItem } from "./types";

const mockLessons: LessonItem[] = [
  { id: "les-01", sourceIncidentId: "inc-01", title: "Strainer inspection interval", summary: "Shorten strainer cleaning cycle", status: "draft", createdAt: "2026-10-05", aiDrafted: true },
  { id: "les-02", sourceIncidentId: "inc-02", title: "Sensor recalibration SOP", summary: "Verify electrode cleanliness", status: "approved", createdAt: "2026-10-04", aiDrafted: true },
];

describe("deriveLearningState", () => {
  it("returns loading when loading is true", () => {
    expect(deriveLearningState(true, false)).toBe("loading");
  });

  it("returns error on error", () => {
    expect(deriveLearningState(false, true)).toBe("error");
  });

  it("returns ready when ready", () => {
    expect(deriveLearningState(false, false)).toBe("ready");
  });
});

describe("countPendingDraftLessons", () => {
  it("counts pending draft lessons", () => {
    expect(countPendingDraftLessons(mockLessons)).toBe(1);
  });
});
