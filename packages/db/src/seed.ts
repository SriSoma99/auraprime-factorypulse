// Loads the synthetic dataset (ADR-030 item 2) into DS-01. Runs as the admin role; wipes tenant data first.
import type pg from "pg";
import type { Config } from "@fp/config";
import { generate, principalToken, sha256, type Dataset } from "@fp/synthetic-data";

// Telemetry first: TRUNCATE locks in list order, so a stream-processor insert (which also needs ref.sensor) finishes before ref.sensor is locked, and a reset during live telemetry cannot deadlock.
const TABLES = ["tel.telemetry_point", "tel.dead_letter", "plat.role_permission", "ops.idempotency_record", "ops.cost_ledger", "gov.audit_event", '"case".approval', '"case".work_order', "intel.alert", "intel.alert_group", '"case".incident',
  "intel.trust_assessment", "intel.line_impact", "know.citation", "ref.sensor", "ref.asset", "ref.station_link", "ref.station", "ref.line", "ref.site",
  "ops.platform_state", "plat.principal", "plat.tenant"];

type Row = Record<string, unknown>;
async function insert(c: pg.PoolClient, table: string, rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]!);
  const values: unknown[] = []; const tuples: string[] = [];
  for (const r of rows) {
    tuples.push(`(${cols.map(col => { values.push(r[col]); return `$${values.length}`; }).join(",")})`);
  }
  await c.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${tuples.join(",")}`, values);
}
const j = (v: unknown) => JSON.stringify(v);

export async function seed(pool: pg.Pool, cfg: Config): Promise<Dataset> {
  const d = generate({ seed: cfg.synthetic.seed, referenceTime: cfg.synthetic.reference_time });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`TRUNCATE ${TABLES.join(",")} RESTART IDENTITY CASCADE`);
    await insert(c, "plat.tenant", d.tenants.map(t => ({ id: t.id, name: t.name, edition: t.edition })));
    await insert(c, "plat.principal", d.principals.map(p => ({ id: p.id, tenant_id: p.tenantId, display_name: p.displayName, role: p.role, session_type: p.sessionType, site_id: p.siteId, token_sha256: sha256(principalToken(cfg.synthetic.seed, p.id)) })));
    await insert(c, "ref.site", d.sites.map(s => ({ id: s.id, tenant_id: s.tenantId, name: s.name })));
    await insert(c, "ref.line", d.lines.map(l => ({ id: l.id, tenant_id: l.tenantId, site_id: l.siteId, name: l.name })));
    await insert(c, "ref.station", d.stations.map(s => ({ id: s.id, tenant_id: s.tenantId, line_id: s.lineId, name: s.name, position: s.position, cycle_time_s: s.cycleTimeS, is_bottleneck: s.isBottleneck, last_reading_at: s.lastReadingAt })));
    await insert(c, "ref.station_link", d.stationLinks.map(l => ({ tenant_id: l.tenantId, from_station_id: l.fromStationId, to_station_id: l.toStationId, buffer_minutes: l.bufferMinutes })));
    await insert(c, "ref.asset", d.assets.map(a => ({ id: a.id, tenant_id: a.tenantId, station_id: a.stationId, name: a.name, equipment_type: a.equipmentType, plant_tag: a.plantTag, model: a.model,
      state_sensor_id: a.stateRule?.sensorId ?? null, run_at_or_above: a.stateRule?.runAtOrAbove ?? null, stopped_below: a.stateRule?.stoppedBelow ?? null })));
    await insert(c, "ref.sensor", d.sensors.map(s => ({ id: s.id, tenant_id: s.tenantId, asset_id: s.assetId, name: s.name, unit: s.unit, meta: s.meta, measurand: s.measurand,
      normal_min: s.normalRange.min, normal_max: s.normalRange.max, instrument_min: s.instrumentRange.min, instrument_max: s.instrumentRange.max, max_silence_s: s.maxSilenceS })));
    await insert(c, "know.citation", d.citations.map(x => ({ id: x.id, tenant_id: x.tenantId, title: x.title, section: x.section, version: x.version, effective_from: x.effectiveFrom, verified: x.verified })));
    await insert(c, "intel.line_impact", d.lineImpacts.map(x => ({ line_id: x.lineId, tenant_id: x.tenantId, cascade: j(x.cascade), station_impact: j(x.stationImpact) })));
    await insert(c, "intel.trust_assessment", d.trust.map(x => ({ sensor_id: x.sensorId, tenant_id: x.tenantId, score: x.score, level: x.level, verdict: x.verdict, verdict_text: x.verdictText, checks: j(x.checks), series: j(x.series), history: j(x.history), sensor_work_order_id: x.sensorWorkOrderId })));
    await insert(c, '"case".incident', d.incidents.map(x => ({ id: x.id, tenant_id: x.tenantId, title: x.title, state: x.state, opened_at: x.openedAt, rank: x.rank, impact: x.impact, lead_time: j(x.leadTime), summary_text: x.summaryText, template_summary: x.templateSummary, hypotheses: j(x.hypotheses), evidence: j(x.evidence), citation_blocked: x.citationBlocked, what_would_change: j(x.whatWouldChange), citation_ids: j(x.citationIds), trust_sensor_ids: j(x.trustSensorIds), abstention: j(x.abstention), outcome: j(x.outcome), trace_id: x.traceId })));
    await insert(c, "intel.alert_group", d.alertGroups.map(g => ({ id: g.id, tenant_id: g.tenantId, title: g.title, likely_causes: g.likelyCauses, incident_id: g.incidentId })));
    await insert(c, "intel.alert", d.alerts.map(a => ({ id: a.id, tenant_id: a.tenantId, sensor_id: a.sensorId, line_id: a.lineId, signal_name: a.signalName, detail: a.detail, status: a.status, status_note: a.statusNote, rank: a.rank, impact: a.impact, lead_time: j(a.leadTime), group_id: a.groupId, incident_id: a.incidentId, arrived_at: a.arrivedAt, is_synthetic: a.isSynthetic })));
    await insert(c, '"case".work_order', d.workOrders.map(w => ({ id: w.id, tenant_id: w.tenantId, incident_id: w.incidentId, title: w.title, asset_id: w.assetId, type: w.type, status: w.status, steps: j(w.steps), approved_by: w.approvedBy, approved_at: w.approvedAt })));
    await insert(c, '"case".approval', d.approvals.map(a => ({ id: a.id, tenant_id: a.tenantId, work_order_id: a.workOrderId, tier: a.tier, required_role: a.requiredRole, rationale: a.rationale, rule_ids: j(a.ruleIds), policy_version: a.policyVersion, requested_by: a.requestedBy, expires_at: a.expiresAt, status: a.status, evidence_summary: j(a.evidenceSummary) })));
    await insert(c, "ops.platform_state", d.platformStates.map(p => ({ tenant_id: p.tenantId, fallback_level: p.fallbackLevel, reason: p.reason, since: p.since })));
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  return d;
}
