// Incidents, approvals and work orders (W03, W04, M03, M04). Safety rules: invariants 1, 2 and 3.
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { components } from "@fp/sdk-ts";
import { idempotent } from "../idempotency.ts";
import { withTenant, ProblemError, type Ctx, type Principal } from "../context.ts";
import { scope, noModel, type Scope } from "../scope.ts";
import { decidability } from "../policy.ts";

type S = components["schemas"];
const iso = (d: Date | null) => (d ? d.toISOString() : null);

async function citations(c: pg.PoolClient, ids: string[]): Promise<S["Citation"][]> {
  if (ids.length === 0) return [];
  const r = await c.query<{ id: string; title: string; section: string; version: string; effective_from: Date; verified: boolean }>("SELECT * FROM know.citation WHERE id = ANY($1)", [ids]);
  return r.rows.map(x => ({ id: x.id, title: x.title, section: x.section, version: x.version, effectiveFrom: x.effective_from.toISOString().slice(0, 10), verified: x.verified }));
}

async function readApproval(ctx: Ctx, c: pg.PoolClient, s: Scope, id: string): Promise<S["Approval"]> {
  const a = (await c.query<{ id: string; work_order_id: string; tier: number; rationale: string; rule_ids: string[]; policy_version: string; requested_by: string; expires_at: Date; status: S["Approval"]["status"]; evidence_summary: string[]; decided_by: string | null; decided_at: Date | null; decision_reason: string | null; audit_event_id: string | null; incident_id: string; title: string; asset_name: string; rank: number | null }>(
    `SELECT ap.*, wo.incident_id, wo.title, ast.name AS asset_name, i.rank
       FROM "case".approval ap JOIN "case".work_order wo ON wo.id = ap.work_order_id JOIN ref.asset ast ON ast.id = wo.asset_id JOIN "case".incident i ON i.id = wo.incident_id
      WHERE ap.id = $1`, [id])).rows[0];
  if (!a) throw new ProblemError(404, "Approval not found");
  const status = a.status === "pending" && a.expires_at < ctx.now() ? "expired" : a.status;
  const d = decidability(ctx.cfg, s.p, a.tier, s.level, status);
  const raised = d.effectiveTier > a.tier;
  return {
    id: a.id, workOrderId: a.work_order_id, incidentId: a.incident_id, title: a.title, assetName: a.asset_name, isDraft: true,
    tier: d.effectiveTier, requiredRole: d.requiredRole,
    rationale: raised ? `Any action while the platform runs at ${s.level} needs at least tier ${d.effectiveTier}.` : a.rationale,
    ruleIds: raised ? [...a.rule_ids, "FALLBACK-MIN-TIER"] : a.rule_ids, policyVersion: a.policy_version, requestedBy: a.requested_by,
    rank: s.edition === "full" ? a.rank : null, expiresAt: a.expires_at.toISOString(), status, evidenceSummary: a.evidence_summary,
    canDecide: d.canDecide, cannotDecideReason: d.reason, decidedBy: a.decided_by, decidedAt: iso(a.decided_at), decisionReason: a.decision_reason, auditEventId: a.audit_event_id,
  };
}

async function readWorkOrder(c: pg.PoolClient, id: string): Promise<S["WorkOrder"]> {
  const w = (await c.query<{ id: string; incident_id: string; title: string; type: S["WorkOrder"]["type"]; status: S["WorkOrder"]["status"]; steps: Array<Omit<S["WorkOrderStep"], "citation"> & { citationId: string | null }>; approved_by: string | null; approved_at: Date | null; asset_name: string }>(
    `SELECT wo.*, ast.name AS asset_name FROM "case".work_order wo JOIN ref.asset ast ON ast.id = wo.asset_id WHERE wo.id = $1`, [id])).rows[0];
  if (!w) throw new ProblemError(404, "Work order not found");
  const cites = await citations(c, w.steps.flatMap(st => (st.citationId ? [st.citationId] : [])));
  return {
    id: w.id, incidentId: w.incident_id, title: w.title, assetName: w.asset_name, type: w.type, status: w.status, isDraft: true, approvedBy: w.approved_by, approvedAt: iso(w.approved_at),
    steps: w.steps.map(({ citationId, ...st }) => ({ ...st, citation: cites.find(x => x.id === citationId) ?? null })),
  };
}

export function caseRoutes(app: FastifyInstance, ctx: Ctx): void {
  app.get<{ Params: { incidentId: string } }>("/v1/incidents/:incidentId", async req => withTenant(ctx, req.principal.tenantId, async c => {
    const s = await scope(ctx, c, req.principal);
    const i = (await c.query<{ id: string; title: string; state: S["Incident"]["state"]; opened_at: Date; rank: number | null; impact: S["ImpactLevel"] | null; lead_time: S["LeadTime"] | null; summary_text: string; template_summary: string; hypotheses: S["Incident"]["hypotheses"]; evidence: S["Incident"]["evidence"]; citation_blocked: boolean; what_would_change: string[]; citation_ids: string[]; trust_sensor_ids: string[]; abstention: S["Incident"]["abstention"]; outcome: S["Incident"]["outcome"]; trace_id: string }>(
      `SELECT * FROM "case".incident WHERE id = $1`, [req.params.incidentId])).rows[0];
    if (!i) throw new ProblemError(404, "Incident not found");
    const full = s.edition === "full";
    const wo = (await c.query<{ id: string; approval_id: string | null }>(`SELECT wo.id, ap.id AS approval_id FROM "case".work_order wo LEFT JOIN "case".approval ap ON ap.work_order_id = wo.id WHERE wo.incident_id = $1 ORDER BY wo.id LIMIT 1`, [i.id])).rows[0];
    const trust = full && i.trust_sensor_ids.length ? (await c.query<{ sensor_id: string; name: string; level: S["TrustLevel"] }>("SELECT t.sensor_id, se.name, t.level FROM intel.trust_assessment t JOIN ref.sensor se ON se.id = t.sensor_id WHERE t.sensor_id = ANY($1)", [i.trust_sensor_ids])).rows : [];
    const verified = i.state === "verified";
    const steps = ["alert", "trust check", "impact", "hypotheses", "retrieval", i.abstention ? "abstain" : "diagnose", "draft", "approval", "verified"];
    const doneUntil = { diagnosing: 4, abstained: 7, awaiting_approval: 7, in_progress: 8, verifying: 8, verified: 9, reopened: 7 }[i.state];
    const body: S["Incident"] = {
      id: i.id, title: i.title, state: i.state, openedAt: i.opened_at.toISOString(), rank: full ? i.rank : null, impact: full ? i.impact : null, leadTime: full ? i.lead_time : null,
      summary: noModel(s.level) ? { text: i.template_summary, kind: "template" } : { text: i.summary_text, kind: "ai" },
      hypotheses: i.hypotheses.map(h => ({ ...h, confirmed: verified && h.rank === 1 })),
      evidence: i.citation_blocked ? i.evidence.filter(e => !e.citationId) : i.evidence,
      citationBlocked: i.citation_blocked, whatWouldChange: i.what_would_change,
      citations: i.citation_blocked ? [] : await citations(c, i.citation_ids),
      sensorTrust: trust.map(t => ({ sensorId: t.sensor_id, name: t.name, level: t.level })),
      abstention: verified ? null : i.abstention, outcome: i.outcome, workOrderId: wo?.id ?? null, approvalId: wo?.approval_id ?? null,
      timeline: steps.map((step, k) => ({ step, done: k < doneUntil })), traceId: i.trace_id,
    };
    return body;
  }));

  app.get<{ Querystring: { status?: "pending" | "all" } }>("/v1/approvals", async req => withTenant(ctx, req.principal.tenantId, async c => {
    const s = await scope(ctx, c, req.principal);
    const ids = (await c.query<{ id: string }>(`SELECT id FROM "case".approval WHERE ($1 = 'all' OR status = 'pending') ORDER BY expires_at`, [req.query.status ?? "pending"])).rows;
    // One query at a time: a pg client cannot run queries concurrently.
    const out = [];
    for (const r of ids) out.push(await readApproval(ctx, c, s, r.id));
    return out;
  }));

  app.get<{ Params: { approvalId: string } }>("/v1/approvals/:approvalId", async req => withTenant(ctx, req.principal.tenantId, async c => readApproval(ctx, c, await scope(ctx, c, req.principal), req.params.approvalId)));

  app.post<{ Params: { approvalId: string }; Body: S["ApprovalDecision"] }>("/v1/approvals/:approvalId/decision", async req => withTenant(ctx, req.principal.tenantId, async c => {
    const s = await scope(ctx, c, req.principal);
    const key = req.headers["idempotency-key"] as string | undefined;
    return idempotent(c, s.p, `approval:${req.params.approvalId}`, key, async () => {
      const before = await readApproval(ctx, c, s, req.params.approvalId);
      if (!before.canDecide) throw new ProblemError(before.status === "pending" ? 403 : 409, "Cannot decide this approval", before.cannotDecideReason ?? undefined);
      const { decision, reason } = req.body;
      if (decision !== "approve" && decision !== "reject") throw new ProblemError(422, "decision must be approve or reject");
      if (decision === "reject" && !reason?.trim()) throw new ProblemError(422, "A reason is required to reject");
      const now = ctx.now();
      const auditId = (await c.query<{ id: string }>("SELECT gov.append_audit($1, $2, $3, $4::jsonb) AS id",
        [s.p.id, `approval.${decision}`, before.id, JSON.stringify({ workOrderId: before.workOrderId, tier: before.tier, reason: reason ?? null, fallbackLevel: s.level })])).rows[0]!.id;
      await c.query(`UPDATE "case".approval SET status = $2, decided_by = $3, decided_at = $4, decision_reason = $5, audit_event_id = $6 WHERE id = $1`,
        [before.id, decision === "approve" ? "approved" : "rejected", s.p.displayName, now, reason ?? null, auditId]);
      await c.query(`UPDATE "case".work_order SET status = $2, approved_by = $3, approved_at = $4 WHERE id = $1`,
        [before.workOrderId, decision === "approve" ? "approved" : "rejected", decision === "approve" ? s.p.displayName : null, decision === "approve" ? now : null]);
      await c.query(`UPDATE "case".incident SET state = $2 WHERE id = $1`, [before.incidentId, decision === "approve" ? "in_progress" : "diagnosing"]);
      return readApproval(ctx, c, s, before.id);
    });
  }));

  app.get<{ Params: { workOrderId: string } }>("/v1/work-orders/:workOrderId", async req => withTenant(ctx, req.principal.tenantId, async c => readWorkOrder(c, req.params.workOrderId)));

  app.put<{ Params: { workOrderId: string; stepNo: string }; Body: S["StepInput"] }>("/v1/work-orders/:workOrderId/steps/:stepNo", async req => withTenant(ctx, req.principal.tenantId, async c => {
    const s = await scope(ctx, c, req.principal);
    const key = req.headers["idempotency-key"] as string | undefined;
    return idempotent(c, s.p, `wo:${req.params.workOrderId}:${req.params.stepNo}`, key, async () => {
      const wo = await readWorkOrder(c, req.params.workOrderId);
      if (wo.status !== "approved" && wo.status !== "in_progress") throw new ProblemError(409, "Work order is not approved", `Status is ${wo.status}; steps can be recorded only after approval.`);
      const no = Number(req.params.stepNo);
      const step = wo.steps.find(st => st.no === no);
      if (!step) throw new ProblemError(404, "Step not found");
      const { value, choice, done } = req.body;
      if (value !== undefined) {
        if (!step.reading) throw new ProblemError(422, "This step takes no reading");
        const { min, max } = step.reading.instrumentRange;
        if (value < min || value > max) throw new ProblemError(422, "Reading outside the instrument range", `${value} ${step.reading.unit} is outside what this instrument can read (${min}–${max} ${step.reading.unit}).`);
      }
      if (choice !== undefined && !(step.choices ?? []).includes(choice)) throw new ProblemError(422, "Unknown choice");
      const raw = (await c.query<{ steps: Array<Record<string, unknown>> }>(`SELECT steps FROM "case".work_order WHERE id = $1`, [wo.id])).rows[0]!.steps;
      const updated = raw.map(st => st.no !== no ? st : { ...st, ...(value !== undefined ? { reading: { ...(st.reading as object), value } } : {}), ...(choice !== undefined ? { choice } : {}), ...(done !== undefined ? { done } : {}) });
      const allDone = updated.every(st => st.done === true);
      await c.query(`UPDATE "case".work_order SET steps = $2, status = $3 WHERE id = $1`, [wo.id, JSON.stringify(updated), allDone ? "completed" : "in_progress"]);
      if (allDone) {
        const finding = updated.find(st => st.kind === "finding")?.choice ?? "recorded";
        await c.query(`UPDATE "case".incident SET state = 'verifying', outcome = $2 WHERE id = $1`, [wo.incidentId, JSON.stringify({ text: `Technician finding: ${String(finding)}. The incident closes only after the drift reverses for the required good cycles.` })]);
        await c.query("SELECT gov.append_audit($1, 'work_order.completed', $2, $3::jsonb)", [s.p.id, wo.id, JSON.stringify({ finding })]);
      }
      return readWorkOrder(c, wo.id);
    });
  }));
}
