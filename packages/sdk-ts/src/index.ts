// Typed client generated from doc/api/openapi.yaml (ADR-030 item 1). Regenerate with `pnpm api:types`.
import createFetchClient, { type Middleware } from "openapi-fetch";
import type { paths, components } from "./schema.gen.ts";

export type { paths, components };
export type Schemas = components["schemas"];
export type Session = Schemas["Session"];
export type LeadTime = Schemas["LeadTime"];
export type PlatformStatus = Schemas["PlatformStatus"];
export type FallbackLevel = Schemas["FallbackLevel"];
export type Alert = Schemas["Alert"];
export type AlertList = Schemas["AlertList"];
export type Incident = Schemas["Incident"];
export type Approval = Schemas["Approval"];
export type ApprovalDecision = Schemas["ApprovalDecision"];
export type LineSummary = Schemas["LineSummary"];
export type LineOverview = Schemas["LineOverview"];
export type SensorSummary = Schemas["SensorSummary"];
export type SensorTrust = Schemas["SensorTrust"];
export type WorkOrder = Schemas["WorkOrder"];
export type WorkOrderStep = Schemas["WorkOrderStep"];
export type MockPrincipal = Schemas["MockPrincipal"];
export type Problem = Schemas["Problem"];

export interface ClientOptions {
  baseUrl: string;
  /** Returns the current bearer token, or null when signed out. */
  getToken: () => string | null;
  fetch?: typeof globalThis.fetch;
}

/** Error carrying RFC 9457 problem details from the API. */
export class ApiError extends Error {
  constructor(readonly problem: Problem) { super(problem.detail ?? problem.title); }
}

export function createApiClient({ baseUrl, getToken, fetch }: ClientOptions) {
  const client = createFetchClient<paths>({ baseUrl, ...(fetch ? { fetch } : {}) });
  const auth: Middleware = {
    onRequest({ request }) {
      const token = getToken();
      if (token) request.headers.set("Authorization", `Bearer ${token}`);
      return request;
    },
  };
  client.use(auth);
  return client;
}
export type ApiClient = ReturnType<typeof createApiClient>;

/** Unwraps an openapi-fetch result, throwing ApiError on a problem response. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data !== undefined) return result.data;
  const p = result.error as Partial<Problem> | undefined;
  throw new ApiError({ type: p?.type ?? "about:blank", title: p?.title ?? result.response.statusText, status: p?.status ?? result.response.status, ...(p?.detail ? { detail: p.detail } : {}), ...(p?.traceId ? { traceId: p.traceId } : {}), ...(p?.problems ? { problems: p.problems } : {}) });
}

/** Key for idempotent writes; unique per user action, reused on retry (UI-AC-10). */
export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}
