// Pure view-state derivation for W02 (testable without rendering, ADR-028).
import type { Alert, AlertList, FallbackLevel } from "@fp/sdk-ts";
import { leadTimeText } from "../../lib/format";

export interface AlertRowVM { kind: "alert"; id: string; rank: string; title: string; detail: string; impact: Alert["impact"]; impactBasic: boolean; leadTime: string | null; leadHint: string | null; trust: Alert["trust"]; status: string; incidentId: string | null; child: boolean }
export interface GroupRowVM { kind: "group"; id: string; rank: string; title: string; summary: string; incidentId: string | null }
export type QueueRowVM = AlertRowVM | GroupRowVM;

const STATUS: Record<Alert["status"], string> = { new: "New", acknowledged: "Acknowledged", assigned: "Assigned", grouped: "Grouped", incident_open: "Incident", resolved: "Resolved" };

export function deriveQueue(list: AlertList, level: FallbackLevel): { rows: QueueRowVM[]; header: string; sortNote: string; showImpact: boolean } {
  const basic = level === "L4" || level === "L5";
  const showImpact = list.sortedBy === "impact";
  const toRow = (a: Alert, child: boolean): AlertRowVM => ({
    kind: "alert", id: a.id, rank: child ? "" : a.rank !== null && a.rank !== undefined ? String(a.rank) : "", title: a.signalName, detail: a.detail,
    impact: a.impact, impactBasic: basic, leadTime: leadTimeText(a.leadTime), leadHint: a.leadTime ? `${a.leadTime.confidence} confidence` : null,
    trust: a.trust, status: [STATUS[a.status], a.statusNote].filter(Boolean).join(" · "), incidentId: a.incidentId ?? null, child,
  });
  const rows: QueueRowVM[] = []; const seen = new Set<string>();
  for (const a of list.items) {
    if (seen.has(a.id)) continue;
    const g = a.groupId ? list.groups.find(x => x.id === a.groupId) : undefined;
    if (g) {
      const members = list.items.filter(x => x.groupId === g.id).sort((x, y) => Number(y.status === "incident_open") - Number(x.status === "incident_open") || x.arrivedAt.localeCompare(y.arrivedAt));
      members.forEach(m => seen.add(m.id));
      rows.push({ kind: "group", id: g.id, rank: a.rank ? String(a.rank) : "", title: g.title, summary: `${members.length} correlated alerts, ${g.likelyCauses} likely cause${g.likelyCauses === 1 ? "" : "s"}${g.incidentId ? ` · incident ${g.incidentId} open` : ""}`, incidentId: g.incidentId ?? null });
      members.forEach(m => rows.push(toRow(m, true)));
    } else { seen.add(a.id); rows.push(toRow(a, false)); }
  }
  return {
    rows,
    header: `${list.total} alerts · ${list.likelyCauses} likely causes`,
    sortNote: showImpact ? "Sorted by line impact" : "Sorted by newest · impact ranking and lead time are Full only (LIM-3, DET-3)",
    showImpact,
  };
}
