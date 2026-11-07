// ViewModel for Mobile Field Companion (ADR-028; UI-5, M05..M07).
import { useState } from "react";
import { countPendingSync, validateNumericReading } from "./derive";
import type { AssetScanResult, FieldScreenState, OfflineQueueItem } from "./types";

export function useFieldVM() {
  const [activeTab, setActiveTab] = useState<FieldScreenState>("scan");
  const [readingInput, setReadingInput] = useState("");
  const [readingError, setReadingError] = useState<string | null>(null);

  const scannedAsset: AssetScanResult = {
    assetId: "AST-WELD-TRANSFORMER-04",
    name: "Primary Weld Transformer (Water-Cooled)",
    line: "Body Shop Line 1",
    station: "Weld Cell 4 (Bottleneck)",
    status: "investigating",
  };

  const [queue, setQueue] = useState<OfflineQueueItem[]>([
    { id: "q-101", assetId: "AST-WELD-TRANSFORMER-04", type: "reading", data: "4.8 L/min (Manual Flow Gauge)", timestamp: "5 min ago", syncStatus: "pending" },
    { id: "q-102", assetId: "AST-WELD-TRANSFORMER-04", type: "checklist_step", data: "Step 1: Visual strainer check complete", timestamp: "12 min ago", syncStatus: "synced" },
  ]);

  const submitReading = () => {
    const val = validateNumericReading(readingInput, 0.5, 20.0);
    if (!val.valid) {
      setReadingError(val.error ?? "Invalid reading");
      return;
    }
    setReadingError(null);
    const item: OfflineQueueItem = {
      id: `q-${Date.now()}`,
      assetId: scannedAsset.assetId,
      type: "reading",
      data: `${readingInput} L/min`,
      timestamp: "Just now",
      syncStatus: "pending",
    };
    setQueue(q => [item, ...q]);
    setReadingInput("");
    setActiveTab("queue");
  };

  const syncQueue = () => {
    setQueue(q => q.map(item => ({ ...item, syncStatus: "synced" as const })));
  };

  const pendingCount = countPendingSync(queue);

  return {
    activeTab,
    setActiveTab,
    scannedAsset,
    queue,
    pendingCount,
    readingInput,
    setReadingInput,
    readingError,
    submitReading,
    syncQueue,
  };
}
