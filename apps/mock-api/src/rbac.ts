// Role-based screen access (NFR-S6, ADR-040). Effective access = config rbac.screens, then the tenant's overrides, then the edition.
// Every /v1 route has a rule below; a route without one is denied (default deny).
import type pg from "pg";
import { SCREENS, type Access, type Config, type RoleName, type Screen } from "@fp/config";

export type Permissions = Record<Screen, Access>;
export const RANK: Record<Access, number> = { none: 0, view: 1, use: 2 };
/** Screens that exist only in the Full edition (ADR-036); in Community they resolve to none. */
export const FULL_ONLY: readonly Screen[] = ["trust", "learning", "control_tower", "compliance"];

export function resolvePermissions(defaults: Permissions, overrides: { screen: string; access: Access }[], edition: "community" | "full"): Permissions {
  const out = { ...defaults };
  for (const o of overrides) if ((SCREENS as readonly string[]).includes(o.screen)) out[o.screen as Screen] = o.access;
  if (edition !== "full") for (const sc of FULL_ONLY) out[sc] = "none";
  return out;
}

export async function permissionsFor(cfg: Config, c: pg.PoolClient, role: RoleName, edition: "community" | "full"): Promise<Permissions> {
  const r = await c.query<{ screen: string; access: Access }>("SELECT screen, access FROM plat.role_permission WHERE role = $1", [role]);
  return resolvePermissions(cfg.rbac.screens[role], r.rows, edition);
}

/** Which screens grant a route, and the level needed. "any" means every signed-in principal. */
export type RouteRule = "any" | { screens: Screen[]; level: Exclude<Access, "none"> };
const view = (...screens: Screen[]): RouteRule => ({ screens, level: "view" });
const use = (...screens: Screen[]): RouteRule => ({ screens, level: "use" });

export const ROUTE_RULES: Record<string, RouteRule> = {
  "GET /v1/session": "any",
  "GET /v1/status": "any",
  "GET /v1/plant": view("plant"),
  "GET /v1/lines": view("line"),
  "GET /v1/lines/:lineId/overview": view("line"),
  "GET /v1/alerts": view("alerts", "line"),
  "GET /v1/incidents/:incidentId": view("alerts", "approvals"),
  "GET /v1/approvals": view("approvals"),
  "GET /v1/approvals/:approvalId": view("approvals"),
  "POST /v1/approvals/:approvalId/decision": use("approvals"),
  "GET /v1/work-orders/:workOrderId": view("field", "approvals"),
  "PUT /v1/work-orders/:workOrderId/steps/:stepNo": use("field"),
  "GET /v1/sensors": view("trust"),
  "GET /v1/sensors/:sensorId/trust": view("trust"),
  "GET /v1/knowledge/stats": view("knowledge"),
  "GET /v1/knowledge/documents": view("knowledge"),
  "POST /v1/knowledge/query": view("knowledge"),
  "GET /v1/knowledge/templates": view("knowledge"),
  "POST /v1/knowledge/upload": use("knowledge"),
  "POST /v1/knowledge/documents/:documentId/approve": use("knowledge"),
  "DELETE /v1/knowledge/documents/:documentId": use("knowledge"),
  "GET /v1/admin/users": view("admin"),
  "PUT /v1/admin/users/:principalId/role": use("admin"),
  "GET /v1/admin/permissions": view("admin"),
  "PUT /v1/admin/permissions": use("admin"),
};

/** Null when allowed, otherwise the reason for a 403. */
export function denyReason(rule: RouteRule | undefined, perms: Permissions): string | null {
  if (!rule) return "No access rule exists for this route";
  if (rule === "any") return null;
  if (rule.screens.some(sc => RANK[perms[sc]] >= RANK[rule.level])) return null;
  return `Your role has no ${rule.level} access to ${rule.screens.join(" or ").replace(/_/g, " ")}`;
}
