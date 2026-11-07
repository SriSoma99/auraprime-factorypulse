// ViewModel for W01 Line overview. Map, bottleneck and cascade are Full-only (LIM-1 to LIM-4).
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { unwrap } from "@fp/sdk-ts";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { relativeTime } from "@/lib/format";
import { useStatusVM } from "@/features/shell/useStatusVM";
import { useAlertQueueVM } from "@/features/alerts/useAlertQueueVM";

export function useLineOverviewVM() {
  const status = useStatusVM();
  const lines = useQuery({ queryKey: ["lines"], queryFn: async () => unwrap(await api.GET("/v1/lines")) });
  const lineId = lines.data?.[0]?.id;
  const q = useQuery({ queryKey: ["line", lineId], enabled: !!lineId, refetchInterval: env.pollIntervalMs, queryFn: async () => unwrap(await api.GET("/v1/lines/{lineId}/overview", { params: { path: { lineId: lineId! } } })) });
  const queue = useAlertQueueVM();
  const o = q.data;
  const full = o?.impactStatus !== "not_available";
  return {
    state: lines.isLoading || q.isLoading ? "loading" : q.isError ? "error" : !o ? "empty" : o.line.openAlerts === 0 ? "noAlerts" : o.impactStatus === "unknown" ? "impactUnknown" : "live",
    full,
    lineName: o?.line.name ?? "",
    impactStatus: o?.impactStatus,
    stations: (o?.stations ?? []).map(s => ({ ...s, buffer: o?.links.find(l => l.fromStationId === s.id)?.bufferMinutes ?? null, lastReading: relativeTime(s.lastReadingAt, status.now) })),
    cascade: o?.cascade ?? null,
    stationImpact: o?.stationImpact ? { ...o.stationImpact, name: o.stations.find(s => s.id === o.stationImpact!.stationId)?.name ?? "" } : null,
    queue: queue.rows.filter(r => r.kind === "group" || !r.child).slice(0, 5),
    open: (incidentId: string | null | undefined) => { if (incidentId) router.push(`/incidents/${incidentId}`); },
  };
}
