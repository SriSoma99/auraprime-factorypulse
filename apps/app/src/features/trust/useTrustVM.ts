// ViewModel for W05 Telemetry trust (TRU-1 to TRU-4, Full-only).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { unwrap } from "@fp/sdk-ts";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useStatusVM } from "@/features/shell/useStatusVM";

const VERDICT = { machine_fault: { label: "Machine fault likely", tone: "bad" }, sensor_fault: { label: "Sensor or data fault", tone: "bad" }, undetermined: { label: "Undetermined", tone: "warn" }, no_fault: { label: "No fault", tone: "ok" }, not_scored: { label: "No verdict yet", tone: "default" } } as const;

export function useTrustVM() {
  const status = useStatusVM();
  const list = useQuery({ queryKey: ["sensors"], queryFn: async () => unwrap(await api.GET("/v1/sensors")) });
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? list.data?.find(s => s.trust?.level !== "high")?.id ?? list.data?.[0]?.id ?? null;
  const d = useQuery({ queryKey: ["trust", selected], enabled: !!selected, queryFn: async () => unwrap(await api.GET("/v1/sensors/{sensorId}/trust", { params: { path: { sensorId: selected! } } })) });
  const groups = (list.data ?? []).reduce<Record<string, NonNullable<typeof list.data>>>((acc, s) => { (acc[s.assetName] ??= []).push(s); return acc; }, {});
  const t = d.data;
  return {
    state: list.isLoading ? "loading" : list.isError ? "error" : (list.data?.length ?? 0) === 0 ? "empty" : t?.verdict ?? "loading",
    groups, selected, select: setPicked,
    detail: t ? {
      ...t,
      verdictLabel: VERDICT[t.verdict].label, verdictTone: VERDICT[t.verdict].tone,
      history: t.history.map(h => ({ ...h, at: relativeTime(h.at, status.now) })),
      series: t.series.actual.length ? t.series : null,
    } : null,
  };
}
