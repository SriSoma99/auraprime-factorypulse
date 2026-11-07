// Display formatting shared by ViewModels. Times use the server's clock, relative to the platform status time.
import type { LeadTime } from "@fp/sdk-ts";
type L = LeadTime;

export function leadTimeText(l: L | null | undefined): string | null {
  if (!l) return null;
  if (l.maxHours >= 48) return `${Math.round(l.minHours / 24)}–${Math.round(l.maxHours / 24)} d`;
  return `${l.minHours}–${l.maxHours} h`;
}
export function minutesBetween(fromIso: string, toIso: string): number { return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000); }
export function relativeTime(fromIso: string, nowIso: string): string {
  const m = minutesBetween(fromIso, nowIso);
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
export function untilText(toIso: string, nowIso: string): string {
  const m = minutesBetween(nowIso, toIso);
  if (m <= 0) return "expired"; if (m < 60) return `expires in ${m} min`;
  return `expires in ${Math.round(m / 60)} h`;
}
export const roleLabel = (r: string) => r.replace(/_/g, " ");
