// Types for Mobile Field Companion (02 section 6.2; UI-5, M05 to M07).

export type SyncStatus = "synced" | "pending" | "failed";

export interface OfflineQueueItem {
  id: string;
  assetId: string;
  type: "reading" | "note" | "checklist_step";
  data: string;
  timestamp: string;
  syncStatus: SyncStatus;
}

export interface AssetScanResult {
  assetId: string;
  name: string;
  line: string;
  station: string;
  status: "normal" | "investigating" | "alert";
}

export type FieldScreenState = "scan" | "reading" | "queue";
