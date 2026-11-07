// Session ViewModel shared by all screens. Local sign-in picks a seeded principal (mock of the identity provider, M09).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { unwrap, type Session } from "@fp/sdk-ts";
import { api, setApiToken } from "./api";
import { tokenStore } from "./token-store";

interface SessionState { ready: boolean; token: string | null; session: Session | null; signIn: (token: string) => Promise<void>; signOut: () => Promise<void> }
const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { void tokenStore.get().then(t => { setApiToken(t); setToken(t); setReady(true); }); }, []);
  const q = useQuery({ queryKey: ["session", token], enabled: !!token, queryFn: async () => unwrap(await api.GET("/v1/session")) });
  const signIn = useCallback(async (t: string) => { await tokenStore.set(t); setApiToken(t); qc.clear(); setToken(t); }, [qc]);
  const signOut = useCallback(async () => { await tokenStore.clear(); setApiToken(null); qc.clear(); setToken(null); }, [qc]);
  const value = useMemo<SessionState>(() => ({ ready: ready && (!token || !q.isLoading), token, session: q.data ?? null, signIn, signOut }), [ready, token, q.isLoading, q.data, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
