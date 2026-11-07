// Pure rules for W09 Admin (ADR-040): what a cell or user row lets the admin do.
import type { components } from "@fp/sdk-ts";
import { SCREEN_CATALOG } from "../shell/access";

type S = components["schemas"];
export const ACCESS_LABEL: Record<S["Access"], string> = { none: "Hidden", view: "View", use: "Use" };

export function screenTitle(screen: S["Screen"]): string {
  return SCREEN_CATALOG.find(s => s.screen === screen)?.title ?? screen;
}

/** Why a user's role cannot be changed here, or null when it can. */
export function roleLockReason(u: S["AdminUser"], selfId: string | undefined): string | null {
  if (u.principalId === selfId) return "Your own role: another admin must change it";
  if (!u.assignable) return "API keys and agent tokens keep their issued role";
  return null;
}

/** The rows of the access editor for one role, in sidebar order. */
export function roleRows(m: S["RolePermissions"] | undefined, role: S["Role"]) {
  if (!m) return [];
  const order = SCREEN_CATALOG.map(s => s.screen);
  return m.cells.filter(c => c.role === role).sort((a, b) => order.indexOf(a.screen) - order.indexOf(b.screen))
    .map(c => ({ ...c, title: screenTitle(c.screen), editionHidden: m.editionHidden.includes(c.screen) }));
}
