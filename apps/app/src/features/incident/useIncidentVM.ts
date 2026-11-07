// ViewModel for W03 Incident detail and M02 Alert summary.
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { unwrap, type Incident } from "@fp/sdk-ts";
import { api } from "@/lib/api";
import { env } from "@/lib/env";
import { leadTimeText } from "@/lib/format";

import { screenState, type IncidentScreenState } from "./derive";

export { screenState, type IncidentScreenState };

export function useIncidentVM(id: string) {
  const q = useQuery({ queryKey: ["incident", id], refetchInterval: env.pollIntervalMs, queryFn: async () => unwrap(await api.GET("/v1/incidents/{incidentId}", { params: { path: { incidentId: id } } })) });
  const i = q.data;
  return {
    state: (q.isLoading ? "loading" : q.isError || !i ? "error" : screenState(i)) as IncidentScreenState,
    incident: i,
    leadTime: leadTimeText(i?.leadTime),
    citationFor: (citationId: string | null | undefined) => (citationId ? i?.citations.findIndex(c => c.id === citationId) ?? -1 : -1) + 1,
    openApproval: () => { if (i?.approvalId) router.push(`/approvals/${i.approvalId}`); },
    openWorkOrder: () => { if (i?.workOrderId) router.push(`/work-orders/${i.workOrderId}`); },
  };
}
