// Pure view-state derivation for W13 Learning Review (ADR-028).
import type { LearningScreenState, LessonItem } from "./types";

export function deriveLearningState(
  loading: boolean,
  error: boolean
): LearningScreenState {
  if (loading) return "loading";
  if (error) return "error";
  return "ready";
}

export function countPendingDraftLessons(lessons: LessonItem[]): number {
  return lessons.filter(l => l.status === "draft").length;
}
