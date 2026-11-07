// ViewModel for W13 Learning Review (ADR-028; LRN-1..7, ADR-031).
import { useState } from "react";
import { countPendingDraftLessons, deriveLearningState } from "./derive";
import type { EpisodicCaseSummary, LearningBatchItem, LessonItem } from "./types";

export function useLearningVM() {
  const [lessons, setLessons] = useState<LessonItem[]>([
    {
      id: "LES-WELD-001",
      sourceIncidentId: "INC-HERO-WELD-04",
      title: "Coolant Strainer Preventive Flush Interval",
      summary: "When secondary coil temp rises by >3°C while flow drops >12%, initiate strainer flush before waiting for thermal alarm.",
      status: "draft",
      createdAt: "2026-10-05T12:00:00Z",
      aiDrafted: true,
    },
    {
      id: "LES-FLOW-002",
      sourceIncidentId: "INC-DRIFT-FLOW-02",
      title: "Flow Electrode Zero-Offset Recalibration Rule",
      summary: "Check ultrasonic portable reference before declaring sensor failure when single-channel drift occurs in absence of thermal delta.",
      status: "approved",
      createdAt: "2026-10-04T16:30:00Z",
      aiDrafted: true,
    },
  ]);

  const [batches, setBatches] = useState<LearningBatchItem[]>([
    {
      id: "BATCH-2026-10-05-A",
      status: "staged",
      goldenSetScorePct: 98.5,
      benchmarkDeltaPct: +1.2,
      evaluationPassed: true,
      evaluatedAt: "2026-10-05T13:00:00Z",
    },
    {
      id: "BATCH-2026-10-03-B",
      status: "active",
      goldenSetScorePct: 97.3,
      benchmarkDeltaPct: +0.8,
      evaluationPassed: true,
      evaluatedAt: "2026-10-03T18:00:00Z",
    },
    {
      id: "BATCH-2026-09-28-C",
      status: "rejected",
      goldenSetScorePct: 88.0,
      benchmarkDeltaPct: -3.5,
      evaluationPassed: false,
      evaluatedAt: "2026-09-28T09:00:00Z",
    },
  ]);

  const cases: EpisodicCaseSummary[] = [
    {
      id: "CASE-HERO-001",
      title: "Weld Cell 4 Coolant Restriction",
      assetId: "AST-WELD-TRANSFORMER-04",
      resolution: "Manual Strainer Flush and Mesh Replacement",
      driftReversalCycles: 6,
      verifiedAt: "2026-10-05T11:45:00Z",
    },
    {
      id: "CASE-FLOW-002",
      title: "Conveyor 2 Sensor False Alarm",
      assetId: "AST-FLOW-SENSOR-02",
      resolution: "Sensor Zero Point Calibration",
      driftReversalCycles: 8,
      verifiedAt: "2026-10-04T15:20:00Z",
    },
  ];

  const approveLesson = (id: string) => {
    setLessons(ls => ls.map(l => l.id === id ? { ...l, status: "approved" as const } : l));
  };

  const rejectLesson = (id: string) => {
    setLessons(ls => ls.map(l => l.id === id ? { ...l, status: "rejected" as const } : l));
  };

  const state = deriveLearningState(false, false);
  const pendingCount = countPendingDraftLessons(lessons);

  return {
    state,
    lessons,
    batches,
    cases,
    pendingCount,
    approveLesson,
    rejectLesson,
  };
}
