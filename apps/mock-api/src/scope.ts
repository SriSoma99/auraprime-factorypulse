// Per-request view of tenant state: fallback level and effective edition.
import type pg from "pg";
import type { Ctx, Level, Principal } from "./context.ts";

export interface Scope { p: Principal; level: Level; levelReason: string | null; levelSince: string; edition: "community" | "full"; tenantName: string; siteName: string }

export async function scope(ctx: Ctx, c: pg.PoolClient, p: Principal): Promise<Scope> {
  const r = await c.query<{ fallback_level: Level; reason: string | null; since: Date; tenant_name: string; edition: "community" | "full"; site_name: string }>(
    `SELECT s.fallback_level, s.reason, s.since, t.name AS tenant_name, t.edition, site.name AS site_name
       FROM ops.platform_state s JOIN plat.tenant t ON t.id = s.tenant_id JOIN ref.site site ON site.id = $1`, [p.siteId]);
  const row = r.rows[0];
  if (!row) throw new Error(`no platform state for tenant ${p.tenantId}`);
  // The deployment edition caps the tenant's edition: a Community build never serves Full-only data.
  const edition = ctx.cfg.edition === "community" ? "community" : row.edition;
  return { p, level: row.fallback_level, levelReason: row.reason, levelSince: row.since.toISOString(), edition, tenantName: row.tenant_name, siteName: row.site_name };
}

export const isBasic = (l: Level) => l === "L4" || l === "L5";
/** No model narration from L2 upward: L2 to L5 all use the cited template (03 section 13). */
export const noModel = (l: Level) => l === "L2" || l === "L3" || l === "L4" || l === "L5";
