import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { unwrap } from "@fp/sdk-ts";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { useStatusVM } from "@/features/shell/useStatusVM";
import { deriveQueue } from "./derive";

export function useAlertQueueVM() {
  const status = useStatusVM();
  const q = useQuery({ queryKey: ["alerts"], refetchInterval: env.pollIntervalMs, queryFn: async () => unwrap(await api.GET("/v1/alerts", { params: { query: { status: "open" } } })) });
  const state = q.isLoading ? "loading" : q.isError ? "error" : (q.data?.total ?? 0) === 0 ? "empty" : "live";
  return {
    state, ...(q.data ? deriveQueue(q.data, status.level) : { rows: [], header: "", sortNote: "", showImpact: false }),
    live: status.live, retry: () => void q.refetch(),
    open: (incidentId: string | null) => { if (incidentId) router.push(`/incidents/${incidentId}`); },
  };
}
