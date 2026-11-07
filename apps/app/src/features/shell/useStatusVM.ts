// ViewModel for the platform status shown on every screen (UI-7).
import { useQuery } from "@tanstack/react-query";
import { unwrap } from "@fp/sdk-ts";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { fallbackBanner } from "@/lib/copy";

export function useStatusVM() {
  const q = useQuery({ queryKey: ["status"], refetchInterval: env.pollIntervalMs, queryFn: async () => unwrap(await api.GET("/v1/status")) });
  const level = q.data?.fallbackLevel ?? "L0";
  return {
    level,
    banner: fallbackBanner[level],
    minimumApprovalTier: q.data?.minimumApprovalTier ?? 1,
    /** The server's notion of now; the mock clock keeps screens stable. */
    now: q.data?.liveUpdatedAt ?? new Date().toISOString(),
    live: !q.isError,
    lastUpdated: q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toISOString() : null,
  };
}
