// ViewModel for W14 Plant equipment (ING-7, ING-12; ADR-028 MVVM via hooks).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { unwrap } from "@fp/sdk-ts";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { relativeTime } from "@/lib/format";
import { derivePlantState, lineOptions, summary, visibleLine } from "./derive";

export function usePlantVM() {
  const q = useQuery({ queryKey: ["plant"], refetchInterval: env.pollIntervalMs, queryFn: async () => unwrap(await api.GET("/v1/plant")) });
  const [picked, setPicked] = useState<string | null>(null);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const lines = lineOptions(q.data);
  const lineId = picked && lines.some(l => l.id === picked) ? picked : lines[0]?.id ?? null;
  const v = q.data;
  return {
    state: derivePlantState(v, q.isLoading, q.isError),
    summary: v ? summary(v) : [],
    lookbackMinutes: v?.lookbackMinutes ?? null,
    updated: v ? relativeTime(v.generatedAt, new Date().toISOString()) : "",
    lines, lineId, selectLine: setPicked,
    attentionOnly, setAttentionOnly,
    line: visibleLine(v, lineId, attentionOnly),
    lastAt: (iso: string | null) => (iso && v ? relativeTime(iso, v.generatedAt) : null),
  };
}
