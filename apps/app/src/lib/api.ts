// Model layer entry point (ADR-028): the generated SDK and the query cache. Views never import this directly.
import { QueryClient } from "@tanstack/react-query";
import { createApiClient } from "@fp/sdk-ts";
import { env } from "./env";

let currentToken: string | null = null;
export function setApiToken(token: string | null) { currentToken = token; }
export const api = createApiClient({ baseUrl: env.apiBaseUrl, getToken: () => currentToken });

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 2_000, refetchOnWindowFocus: true } },
});
