// Types for W13 Learning Review (02 section 6.1; LRN-1 to LRN-7, ADR-031).

export type LessonStatus = "draft" | "approved" | "rejected";
export type BatchStatus = "staged" | "active" | "rejected" | "reverted";

export interface LessonItem {
  id: string;
  sourceIncidentId: string;
  title: string;
  summary: string;
  status: LessonStatus;
  createdAt: string;
  aiDrafted: boolean;
}

export interface LearningBatchItem {
  id: string;
  status: BatchStatus;
  goldenSetScorePct: number;
  benchmarkDeltaPct: number;
  evaluationPassed: boolean;
  evaluatedAt: string;
}

export interface EpisodicCaseSummary {
  id: string;
  title: string;
  assetId: string;
  resolution: string;
  driftReversalCycles: number;
  verifiedAt: string;
}

export type LearningScreenState = "loading" | "error" | "ready";
