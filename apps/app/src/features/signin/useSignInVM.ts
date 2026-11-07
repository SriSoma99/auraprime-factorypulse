// Local sign-in: lists seeded principals from the mock API (stand-in for the identity provider, M09).
import { useQuery } from "@tanstack/react-query";
import { unwrap, type MockPrincipal } from "@fp/sdk-ts";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

export function useSignInVM() {
  const { signIn } = useSession();
  const q = useQuery({ queryKey: ["mock-principals"], retry: false, queryFn: async () => unwrap(await api.GET("/mock/principals")) });
  const groups = (q.data ?? []).reduce<Record<string, MockPrincipal[]>>((acc, p) => {
    const k = p.sessionType === "human" ? "People" : "Machine identities (cannot approve)";
    (acc[k] ??= []).push(p); return acc;
  }, {});
  return { loading: q.isLoading, error: q.isError, groups, choose: (p: MockPrincipal) => signIn(p.token) };
}
