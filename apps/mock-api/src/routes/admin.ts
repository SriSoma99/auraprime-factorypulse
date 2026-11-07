// W09 Admin: tenant users and role screen access (NFR-S6, ADR-040). Every change is written to the audit chain (invariant 3).
// Approval rights are not managed here: they stay with config policy.role_max_tier and invariant 2.
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { components } from "@fp/sdk-ts";
import { ACCESS_LEVELS, ROLES, SCREENS, type Access, type RoleName, type Screen } from "@fp/config";
import { idempotent } from "../idempotency.ts";
import { withTenant, ProblemError, type Ctx } from "../context.ts";
import { scope } from "../scope.ts";
import { FULL_ONLY } from "../rbac.ts";

type S = components["schemas"];
const isRole = (v: unknown): v is RoleName => (ROLES as readonly unknown[]).includes(v);
const isScreen = (v: unknown): v is Screen => (SCREENS as readonly unknown[]).includes(v);
const isAccess = (v: unknown): v is Access => (ACCESS_LEVELS as readonly unknown[]).includes(v);
/** The one cell no one may change: removing it would lock every admin out of W09. */
const isLocked = (role: RoleName, screen: Screen) => role === "admin" && screen === "admin";

async function users(c: pg.PoolClient): Promise<S["AdminUser"][]> {
  const r = await c.query<{ id: string; display_name: string; role: RoleName; session_type: S["SessionType"]; site_id: string }>(
    "SELECT id, display_name, role, session_type, site_id FROM plat.principal ORDER BY session_type, display_name");
  return r.rows.map(u => ({ principalId: u.id, displayName: u.display_name, role: u.role, sessionType: u.session_type, siteId: u.site_id, assignable: u.session_type === "human" }));
}

async function matrix(ctx: Ctx, c: pg.PoolClient, edition: "community" | "full"): Promise<S["RolePermissions"]> {
  const o = await c.query<{ role: RoleName; screen: Screen; access: Access }>("SELECT role, screen, access FROM plat.role_permission");
  const cells: S["RolePermissions"]["cells"] = [];
  for (const role of ROLES) for (const screen of SCREENS) {
    const defaultAccess = ctx.cfg.rbac.screens[role][screen];
    const override = o.rows.find(x => x.role === role && x.screen === screen);
    cells.push({ role, screen, access: override?.access ?? defaultAccess, defaultAccess, overridden: !!override, locked: isLocked(role, screen) });
  }
  return { roles: [...ROLES], screens: [...SCREENS], editionHidden: edition === "full" ? [] : [...FULL_ONLY], cells };
}

export function adminRoutes(app: FastifyInstance, ctx: Ctx): void {
  app.get("/v1/admin/users", async req => withTenant(ctx, req.principal.tenantId, async c => users(c)));

  app.put<{ Params: { principalId: string }; Body: { role?: unknown } }>("/v1/admin/users/:principalId/role", async req => withTenant(ctx, req.principal.tenantId, async c => {
    const role = req.body?.role;
    if (!isRole(role)) throw new ProblemError(422, "Unknown role", `role must be one of ${ROLES.join(", ")}`);
    if (req.params.principalId === req.principal.id) throw new ProblemError(409, "You cannot change your own role", "Ask another admin, so no one can raise or remove their own access.");
    return idempotent(c, req.principal, `admin.role:${req.params.principalId}`, req.headers["idempotency-key"] as string | undefined, async () => {
      // Row-level security limits this to the admin's own tenant (invariant 4).
      const t = (await c.query<{ role: RoleName; session_type: string }>("SELECT role, session_type FROM plat.principal WHERE id = $1", [req.params.principalId])).rows[0];
      if (!t) throw new ProblemError(404, "User not found");
      if (t.session_type !== "human") throw new ProblemError(422, "Only human users have assignable roles", "API keys and agent tokens keep the role they were issued with.");
      await c.query("UPDATE plat.principal SET role = $1 WHERE id = $2", [role, req.params.principalId]);
      const auditId = (await c.query<{ id: string }>("SELECT gov.append_audit($1, 'rbac.role_assigned', $2, $3::jsonb) AS id",
        [req.principal.id, req.params.principalId, JSON.stringify({ from: t.role, to: role })])).rows[0]!.id;
      const user = (await users(c)).find(u => u.principalId === req.params.principalId)!;
      const body: S["AdminUserChange"] = { user, auditId };
      return body;
    });
  }));

  app.get("/v1/admin/permissions", async req => withTenant(ctx, req.principal.tenantId, async c => matrix(ctx, c, (await scope(ctx, c, req.principal)).edition)));

  app.put<{ Body: { role?: unknown; screen?: unknown; access?: unknown } }>("/v1/admin/permissions", async req => withTenant(ctx, req.principal.tenantId, async c => {
    const { role, screen, access } = req.body ?? {};
    if (!isRole(role) || !isScreen(screen) || !(isAccess(access) || access === "default")) {
      throw new ProblemError(422, "Invalid permission", `role, screen and access (${ACCESS_LEVELS.join(", ")} or default) are required`);
    }
    if (isLocked(role, screen)) throw new ProblemError(409, "This permission is locked", "The admin role always keeps use access to Admin, so the tenant cannot be locked out.");
    return idempotent(c, req.principal, `admin.permission:${role}:${screen}`, req.headers["idempotency-key"] as string | undefined, async () => {
      const before = (await matrix(ctx, c, "full")).cells.find(x => x.role === role && x.screen === screen)!.access;
      if (access === "default") await c.query("DELETE FROM plat.role_permission WHERE role = $1 AND screen = $2", [role, screen]);
      else await c.query(
        `INSERT INTO plat.role_permission (tenant_id, role, screen, access, updated_by) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, role, screen) DO UPDATE SET access = EXCLUDED.access, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [req.principal.tenantId, role, screen, access, req.principal.id]);
      const auditId = (await c.query<{ id: string }>("SELECT gov.append_audit($1, 'rbac.permission_changed', $2, $3::jsonb) AS id",
        [req.principal.id, `${role}:${screen}`, JSON.stringify({ from: before, to: access })])).rows[0]!.id;
      const m = await matrix(ctx, c, (await scope(ctx, c, req.principal)).edition);
      const body: S["RolePermissionChange"] = { cell: m.cells.find(x => x.role === role && x.screen === screen)!, auditId };
      return body;
    });
  }));
}
