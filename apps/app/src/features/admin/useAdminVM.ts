// ViewModel for W09 Admin: users and their roles, and screen access per role (NFR-S6, ADR-040; MVVM via hooks, ADR-028).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, newIdempotencyKey, unwrap, type components } from "@fp/sdk-ts";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { canUse } from "@/features/shell/access";
import { roleLockReason, roleRows } from "./derive";

type S = components["schemas"];

export function useAdminVM() {
  const qc = useQueryClient();
  const { session } = useSession();
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: async () => unwrap(await api.GET("/v1/admin/users")) });
  const matrix = useQuery({ queryKey: ["admin", "permissions"], queryFn: async () => unwrap(await api.GET("/v1/admin/permissions")) });
  const [role, setRole] = useState<S["Role"]>("technician");
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const fail = (e: unknown) => setMessage({ tone: "bad", text: e instanceof ApiError ? e.problem.detail ?? e.problem.title : String(e) });
  const done = (text: string) => { setMessage({ tone: "ok", text }); void qc.invalidateQueries(); };

  const assign = useMutation({
    mutationFn: async (v: { principalId: string; role: S["Role"] }) => unwrap(await api.PUT("/v1/admin/users/{principalId}/role", { params: { path: { principalId: v.principalId }, header: { "Idempotency-Key": newIdempotencyKey() } }, body: { role: v.role } })),
    onSuccess: r => done(`${r.user.displayName} is now ${r.user.role.replace(/_/g, " ")} · audit ${r.auditId}`),
    onError: fail,
  });
  const setAccess = useMutation({
    mutationFn: async (v: { role: S["Role"]; screen: S["Screen"]; access: S["Access"] | "default" }) => unwrap(await api.PUT("/v1/admin/permissions", { params: { header: { "Idempotency-Key": newIdempotencyKey() } }, body: v })),
    onSuccess: r => done(`${r.cell.role.replace(/_/g, " ")} · ${r.cell.screen.replace(/_/g, " ")} is now ${r.cell.access}${r.cell.overridden ? "" : " (default)"} · audit ${r.auditId}`),
    onError: fail,
  });

  return {
    state: users.isLoading || matrix.isLoading ? "loading" : users.isError || matrix.isError ? "error" : "ready",
    canEdit: canUse(session?.permissions, "admin"),
    users: (users.data ?? []).map(u => ({ ...u, lockReason: roleLockReason(u, session?.principalId) })),
    roles: matrix.data?.roles ?? [],
    role, setRole,
    rows: roleRows(matrix.data, role),
    busy: assign.isPending || setAccess.isPending,
    message,
    assignRole: (principalId: string, r: S["Role"]) => assign.mutate({ principalId, role: r }),
    setScreenAccess: (screen: S["Screen"], access: S["Access"] | "default") => setAccess.mutate({ role, screen, access }),
  };
}
