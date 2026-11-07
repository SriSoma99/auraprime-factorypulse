// Local-only scenario controls (mock.controls_enabled). Hidden when the API does not expose them.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap, type FallbackLevel } from "@fp/sdk-ts";
import { api } from "@/lib/api";

export function useMockControlsVM() {
  const qc = useQueryClient();
  const state = useQuery({ queryKey: ["mock-state"], retry: false, queryFn: async () => unwrap(await api.GET("/mock/state")) });
  const setLevel = useMutation({
    mutationFn: async (fallbackLevel: FallbackLevel) => unwrap(await api.PUT("/mock/state", { body: { fallbackLevel } })),
    onSuccess: () => qc.invalidateQueries(),
  });
  const reset = useMutation({ mutationFn: async () => { await api.POST("/mock/reset"); }, onSuccess: () => qc.invalidateQueries() });
  return { available: state.isSuccess, level: state.data?.fallbackLevel, setLevel: (l: FallbackLevel) => setLevel.mutate(l), reset: () => reset.mutate(), busy: setLevel.isPending || reset.isPending };
}
