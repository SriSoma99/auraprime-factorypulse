// Screen catalog and role-based access for navigation (NFR-S6, ADR-040; 02 sections 4.2 and 4.4).
// The API enforces the same permissions on every route; this only decides what the app shows.
import type { components } from "@fp/sdk-ts";

type S = components["schemas"];
export type Screen = S["Screen"];
export type Access = S["Access"];
export type Permissions = S["ScreenPermissions"];

export interface ScreenInfo { screen: Screen; href: string; title: string; detail: string; phoneTab: boolean }

/** Sidebar order. phoneTab marks the screens that stay in the phone tab bar; the rest are under More. */
export const SCREEN_CATALOG: ScreenInfo[] = [
  { screen: "plant", href: "/", title: "Plant", detail: "Equipment, limits and sensor health", phoneTab: true },
  { screen: "line", href: "/line", title: "Line", detail: "Line map and impact", phoneTab: true },
  { screen: "alerts", href: "/alerts", title: "Alerts", detail: "Alert queue and incidents", phoneTab: true },
  { screen: "approvals", href: "/approvals", title: "Approvals", detail: "Work order approvals", phoneTab: true },
  { screen: "trust", href: "/trust", title: "Trust", detail: "Per-sensor trust scores and verdicts", phoneTab: false },
  { screen: "control_tower", href: "/control-tower", title: "Control Tower", detail: "Agents, budgets and fallback level", phoneTab: false },
  { screen: "knowledge", href: "/knowledge", title: "Knowledge", detail: "Manuals and procedures with versions", phoneTab: false },
  { screen: "compliance", href: "/compliance", title: "Compliance", detail: "Audit chain and evidence", phoneTab: false },
  { screen: "developer", href: "/developer", title: "Developer", detail: "API keys and MCP tools", phoneTab: false },
  { screen: "learning", href: "/learning", title: "Learning", detail: "Case memory and lessons", phoneTab: false },
  { screen: "field", href: "/field", title: "Field", detail: "Scan, checklists and offline queue", phoneTab: true },
  { screen: "admin", href: "/admin", title: "Admin", detail: "Users, roles and screen access", phoneTab: false },
  { screen: "settings", href: "/settings", title: "Settings", detail: "Theme, density and profile", phoneTab: false },
];

export const canView = (p: Permissions | null | undefined, sc: Screen) => !!p && p[sc] !== "none";
export const canUse = (p: Permissions | null | undefined, sc: Screen) => !!p && p[sc] === "use";

/** Screens a path belongs to; any one of them grants it. Null for paths every signed-in user may open. */
export function screensForPath(path: string): Screen[] | null {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/") return ["plant"];
  if (p === "/more") return null;
  if (p.startsWith("/incidents/")) return ["alerts", "approvals"];
  if (p.startsWith("/work-orders/")) return ["field"];
  const hit = SCREEN_CATALOG.find(s => s.href !== "/" && (p === s.href || p.startsWith(`${s.href}/`)));
  return hit ? [hit.screen] : null;
}

export function pathAllowed(p: Permissions | null | undefined, path: string): boolean {
  const screens = screensForPath(path);
  return screens === null || screens.some(sc => canView(p, sc));
}

/** Where to send a user whose current path is not allowed: the first screen they may view. */
export function firstAllowedHref(p: Permissions | null | undefined): string | null {
  return SCREEN_CATALOG.find(s => canView(p, s.screen))?.href ?? null;
}

/** What one role sees in navigation at a given width. */
export function navigation(p: Permissions | null | undefined, wide: boolean) {
  const visible = SCREEN_CATALOG.filter(s => canView(p, s.screen));
  if (wide) return { tabs: visible, more: [] as ScreenInfo[] };
  const tabs = visible.filter(s => s.phoneTab), more = visible.filter(s => !s.phoneTab);
  return { tabs, more };
}
