// Pure view-state derivation for Mobile Field Companion (ADR-028; UI-5).
import type { OfflineQueueItem } from "./types";

export function countPendingSync(items: OfflineQueueItem[]): number {
  return items.filter(i => i.syncStatus === "pending").length;
}

export function validateNumericReading(value: string, min: number, max: number): { valid: boolean; error?: string } {
  const num = parseFloat(value.trim());
  if (isNaN(num)) return { valid: false, error: "Must be a valid number" };
  if (num < min || num > max) return { valid: false, error: `Value must be between ${min} and ${max}` };
  return { valid: true };
}
