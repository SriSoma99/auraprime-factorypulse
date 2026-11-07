// Deterministic synthetic dataset for the UI-first mock backend (ADR-030 item 2).
// All data is synthetic and labelled (ADR-019, BR-12). The hero scenario follows doc/01 and the
// wireframes in doc/wireframes: slow coolant drift in Weld Cell 4, an undetermined flow sensor,
// an abstained diagnosis and an inspection draft awaiting tier-1 approval.
import type * as T from "./types.ts";
import { mulberry32, minutesBefore, minutesAfter } from "./util.ts";
import { cncMachiningLineTopology } from "./topology/cncLineTopology.ts";
import { fromTopology } from "./topology/fromTopology.ts";

const DEMO = "t-demo";
const OTHER = "t-acme";

export function generate({ seed, referenceTime }: T.GenerateOptions): T.Dataset {
  const rnd = mulberry32(seed);
  const at = (minutes: number) => minutesBefore(referenceTime, minutes);
  const later = (minutes: number) => minutesAfter(referenceTime, minutes);

  const tenants: T.Tenant[] = [
    { id: DEMO, name: "Demo Manufacturing", edition: "full" },
    { id: OTHER, name: "Acme Test Plant", edition: "full" },
    { id: "t-test", name: "Automated Test Tenant", edition: "full" },
  ];
  const sites: T.Site[] = [
    { id: "site-a", tenantId: DEMO, name: "Plant A" },
    { id: "site-x", tenantId: OTHER, name: "Acme Site X" },
  ];
  const principals: T.Principal[] = [
    { id: "u-shift-lead", tenantId: DEMO, displayName: "Sam Rivera (shift lead)", role: "shift_lead", sessionType: "human", siteId: "site-a" },
    { id: "u-reliability", tenantId: DEMO, displayName: "Alex Chen (reliability engineer)", role: "reliability_engineer", sessionType: "human", siteId: "site-a" },
    { id: "u-technician", tenantId: DEMO, displayName: "Jordan Lee (technician)", role: "technician", sessionType: "human", siteId: "site-a" },
    { id: "u-ops-manager", tenantId: DEMO, displayName: "Priya Nair (operations manager)", role: "operations_manager", sessionType: "human", siteId: "site-a" },
    { id: "u-operator", tenantId: DEMO, displayName: "Robin Okafor (line operator)", role: "operator", sessionType: "human", siteId: "site-a" },
    { id: "u-admin", tenantId: DEMO, displayName: "Casey Morgan (tenant admin)", role: "admin", sessionType: "human", siteId: "site-a" },
    { id: "k-integration", tenantId: DEMO, displayName: "API key: demo-integration", role: "shift_lead", sessionType: "api_key", siteId: "site-a" },
    { id: "a-orchestrator", tenantId: DEMO, displayName: "Agent token: orchestrator", role: "shift_lead", sessionType: "agent_token", siteId: "site-a" },
    { id: "u-acme-lead", tenantId: OTHER, displayName: "Acme shift lead", role: "shift_lead", sessionType: "human", siteId: "site-x" },
    { id: "u-acme-reliability", tenantId: OTHER, displayName: "Acme reliability engineer", role: "reliability_engineer", sessionType: "human", siteId: "site-x" },
  ];

  const lines: T.Line[] = [
    { id: "line-body-1", tenantId: DEMO, siteId: "site-a", name: "Body line 1" },
    { id: "line-x-1", tenantId: OTHER, siteId: "site-x", name: "Acme line 1" },
  ];
  const st = (id: string, name: string, position: number, cycleTimeS: number, isBottleneck = false, tenantId = DEMO, lineId = "line-body-1"): T.Station =>
    ({ id, tenantId, lineId, name, position, cycleTimeS, isBottleneck, lastReadingAt: at(0) });
  const stations: T.Station[] = [
    st("st-load", "Load", 1, 58), st("st-cell3", "Cell 3", 2, 60), st("st-cell4", "Weld Cell 4", 3, 62, true),
    st("st-qgate", "Quality gate", 4, 55), st("st-framing", "Framing", 5, 57), st("st-paint", "Paint booth 2", 6, 64),
    st("st-x1", "Acme press", 1, 40, false, OTHER, "line-x-1"),
  ];
  const stationLinks: T.StationLink[] = [
    { tenantId: DEMO, fromStationId: "st-load", toStationId: "st-cell3", bufferMinutes: null },
    { tenantId: DEMO, fromStationId: "st-cell3", toStationId: "st-cell4", bufferMinutes: null },
    { tenantId: DEMO, fromStationId: "st-cell4", toStationId: "st-qgate", bufferMinutes: 22 },
    { tenantId: DEMO, fromStationId: "st-qgate", toStationId: "st-framing", bufferMinutes: null },
    { tenantId: DEMO, fromStationId: "st-framing", toStationId: "st-paint", bufferMinutes: 35 },
  ];
  const assets: T.Asset[] = [
    { id: "as-wc4-coolant", tenantId: DEMO, stationId: "st-cell4", name: "Weld Cell 4 coolant loop", equipmentType: null, plantTag: null, model: null, stateRule: null },
    { id: "as-cell3-hyd", tenantId: DEMO, stationId: "st-cell3", name: "Cell 3 hydraulic unit", equipmentType: null, plantTag: null, model: null, stateRule: null },
    { id: "as-r7", tenantId: DEMO, stationId: "st-framing", name: "Framing robot R7", equipmentType: null, plantTag: null, model: null, stateRule: null },
    { id: "as-paint2", tenantId: DEMO, stationId: "st-paint", name: "Paint booth 2", equipmentType: null, plantTag: null, model: null, stateRule: null },
    { id: "as-conv-c2", tenantId: DEMO, stationId: "st-load", name: "Conveyor C2", equipmentType: null, plantTag: null, model: null, stateRule: null },
    { id: "as-x-press", tenantId: OTHER, stationId: "st-x1", name: "Acme press hydraulics", equipmentType: null, plantTag: null, model: null, stateRule: null },
  ];
  const sensors: T.Sensor[] = [
    { id: "FT-401", tenantId: DEMO, assetId: "as-wc4-coolant", name: "Coolant flow FT-401", unit: "L/min", meta: "ultrasonic · calibrated 2025-08-12", measurand: "flow", normalRange: { min: 20, max: 28 }, instrumentRange: { min: 0, max: 50 }, maxSilenceS: 60 },
    { id: "TT-402", tenantId: DEMO, assetId: "as-wc4-coolant", name: "Return temperature TT-402", unit: "°C", meta: "RTD · calibrated 2026-05-20", measurand: "temperature", normalRange: { min: 30, max: 48 }, instrumentRange: { min: -20, max: 150 }, maxSilenceS: 60 },
    { id: "TT-404", tenantId: DEMO, assetId: "as-wc4-coolant", name: "Transformer temperature TT-404", unit: "°C", meta: "RTD · calibrated 2026-04-02", measurand: "temperature", normalRange: { min: 20, max: 85 }, instrumentRange: { min: -20, max: 200 }, maxSilenceS: 60 },
    { id: "IT-405", tenantId: DEMO, assetId: "as-wc4-coolant", name: "Pump current IT-405", unit: "A", meta: "CT clamp · calibrated 2026-03-11", measurand: "current", normalRange: { min: 8, max: 16 }, instrumentRange: { min: 0, max: 50 }, maxSilenceS: 60 },
    { id: "FT-406", tenantId: DEMO, assetId: "as-wc4-coolant", name: "Coolant flow FT-406 (new)", unit: "L/min", meta: "ultrasonic · installed today 06:00", measurand: "flow", normalRange: { min: 20, max: 28 }, instrumentRange: { min: 0, max: 50 }, maxSilenceS: 60 },
    { id: "PT-310", tenantId: DEMO, assetId: "as-cell3-hyd", name: "Pressure sensor PT-310", unit: "bar", meta: "piezo · calibrated 2026-02-02", measurand: "pressure", normalRange: { min: 3.8, max: 4.6 }, instrumentRange: { min: 0, max: 10 }, maxSilenceS: 60 },
    { id: "TT-701", tenantId: DEMO, assetId: "as-r7", name: "Servo temperature TT-701", unit: "°C", meta: "thermistor · calibrated 2026-01-20", measurand: "temperature", normalRange: { min: 20, max: 70 }, instrumentRange: { min: -20, max: 150 }, maxSilenceS: 60 },
    { id: "HT-220", tenantId: DEMO, assetId: "as-paint2", name: "Humidity HT-220", unit: "%RH", meta: "capacitive · calibrated 2026-06-01", measurand: "humidity", normalRange: { min: 40, max: 60 }, instrumentRange: { min: 0, max: 100 }, maxSilenceS: 60 },
    { id: "VT-102", tenantId: DEMO, assetId: "as-conv-c2", name: "Drive vibration VT-102", unit: "mm/s", meta: "accelerometer · calibrated 2026-02-28", measurand: "vibration_rms", normalRange: { min: 0.5, max: 4.5 }, instrumentRange: { min: 0, max: 50 }, maxSilenceS: 60 },
    { id: "PT-X1", tenantId: OTHER, assetId: "as-x-press", name: "Acme pressure PT-X1", unit: "bar", meta: "piezo", measurand: "pressure", normalRange: { min: 3.8, max: 4.6 }, instrumentRange: { min: 0, max: 10 }, maxSilenceS: 60 },
  ];
  const citations: T.Citation[] = [
    { id: "CIT-1", tenantId: DEMO, title: "Weld Transformer Manual", section: "section 4.2", version: "v3", effectiveFrom: "2025-03-01", verified: true },
    { id: "CIT-2", tenantId: DEMO, title: "Lockout procedure SOP-WC-07", section: "step 3", version: "v4", effectiveFrom: "2026-01-15", verified: true },
  ];
  const lineImpacts: T.LineImpact[] = [{
    lineId: "line-body-1", tenantId: DEMO,
    cascade: { fromStationId: "st-cell4", toStationId: "st-qgate", description: "If Weld Cell 4 slows, the quality gate starves after its 22-minute buffer empties" },
    stationImpact: { stationId: "st-cell4", throughputAtRiskPct: { min: 6, max: 9 }, rejectRisk: "low" },
  }];

  // 24 hourly points for the consistency plots on W05, with seeded noise.
  const series = (actual: (i: number) => number, expected: (i: number) => number) => {
    const a: T.Point[] = [], e: T.Point[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = at((24 - i) * 60);
      a.push({ t, v: round(actual(i) + (rnd() - 0.5) * 0.4) });
      e.push({ t, v: round(expected(i)) });
    }
    return { a, e };
  };
  const ft401 = series(i => 27 - i * 0.36, i => 27 - i * 0.25);
  const pt310 = series(i => (i < 21 ? 4.2 + Math.sin(i / 3) * 0.3 : 4.2 + Math.sin(7) * 0.3), i => 4.2 + Math.sin(i / 3) * 0.3);
  const tt402 = series(i => 41 + i * 0.3, i => 41 + i * 0.3);
  const flatAt = pt310.a[21]!.v; for (let i = 21; i <= 24; i++) pt310.a[i]!.v = flatAt;

  const okCheck = (name: string, finding: string, score = 1): T.TrustCheck => ({ name, score, status: "ok", finding });
  const trust: T.TrustAssessment[] = [
    { sensorId: "FT-401", tenantId: DEMO, score: 0.62, level: "medium", verdict: "undetermined",
      verdictText: "The flow reading falls faster than related signals imply, and calibration is overdue, so a sensor drift cannot be ruled out. Diagnosis requests a check before naming a cause.",
      checks: [okCheck("Range and rate", "within limits"), okCheck("Staleness", "updates every 1 s"), okCheck("Flatline", "normal variation"),
        { name: "Noise profile", score: 0.7, status: "warn", finding: "slightly above normal" },
        { name: "Calibration age", score: 0.4, status: "warn", finding: "20 days past interval" },
        okCheck("Communication quality", "no gaps"), { name: "Redundancy", score: null, status: "not_applicable", finding: "no paired sensor" },
        { name: "Physical consistency", score: 0.5, status: "warn", finding: "reads about 2.5 L/min below the energy-balance estimate" }],
      series: { unit: "L/min", actual: ft401.a, expected: ft401.e },
      history: [{ at: at(38), verdict: "Undetermined", note: "alert opened; check requested" }, { at: at(80), verdict: "Undetermined", note: "physical consistency dropped below threshold" }, { at: at(1440), verdict: "Trusted", note: "all checks passing except calibration age" }],
      sensorWorkOrderId: null },
    { sensorId: "PT-310", tenantId: DEMO, score: 0.18, level: "low", verdict: "sensor_fault",
      verdictText: "The value has not changed for 3 h while related signals vary normally. A sensor check work order was drafted instead of a machine one.",
      checks: [okCheck("Range and rate", "within limits"), okCheck("Staleness", "updates arriving"),
        { name: "Flatline", score: 0, status: "fail", finding: "constant 4.20 bar for 3 h" }, { name: "Noise profile", score: 0.1, status: "fail", finding: "no noise at all" },
        okCheck("Calibration age", "in date"), okCheck("Communication quality", "no gaps"), { name: "Redundancy", score: null, status: "not_applicable", finding: "no paired sensor" },
        { name: "Physical consistency", score: 0.2, status: "fail", finding: "inconsistent only through this signal" }],
      series: { unit: "bar", actual: pt310.a, expected: pt310.e },
      history: [{ at: at(165), verdict: "Sensor fault", note: "flatline beyond limit" }, { at: at(220), verdict: "Suspect", note: "flatline started" }, { at: at(2880), verdict: "Trusted", note: "all checks passing" }],
      sensorWorkOrderId: "WO-0314" },
    { sensorId: "TT-402", tenantId: DEMO, score: 0.94, level: "high", verdict: "machine_fault",
      verdictText: "This sensor and its related signals are trusted and agree with each other, but together they depart from nominal behaviour. The anomaly is treated as a machine condition.",
      checks: [okCheck("Range and rate", "within limits"), okCheck("Staleness", "updates every 1 s"), okCheck("Flatline", "normal variation"), okCheck("Noise profile", "normal", 0.95),
        okCheck("Calibration age", "in date"), okCheck("Communication quality", "no gaps"), okCheck("Redundancy", "agrees with TT-403", 0.9), okCheck("Physical consistency", "consistent with related signals", 0.9)],
      series: { unit: "°C", actual: tt402.a, expected: tt402.e },
      history: [{ at: at(38), verdict: "Trusted", note: "contributing signal for INC-0042" }, { at: at(1440), verdict: "Trusted", note: "all checks passing" }],
      sensorWorkOrderId: null },
    ...(["TT-404", "IT-405", "TT-701", "HT-220", "VT-102"] as const).map((id, k): T.TrustAssessment => ({
      sensorId: id, tenantId: DEMO, score: [0.91, 0.95, 0.93, 0.96, 0.92][k]!, level: "high", verdict: "no_fault", verdictText: "All checks passing.",
      checks: [okCheck("Range and rate", "within limits"), okCheck("Staleness", "updating"), okCheck("Flatline", "normal variation")],
      series: { unit: "", actual: [], expected: [] }, history: [], sensorWorkOrderId: null })),
    { sensorId: "FT-406", tenantId: DEMO, score: null, level: "not_scored", verdict: "not_scored",
      verdictText: "Not enough data to score yet. Treated as unknown by diagnosis, never as trusted.", checks: [], series: { unit: "L/min", actual: [], expected: [] }, history: [], sensorWorkOrderId: null },
  ];

  const incidents: T.Incident[] = [
    { id: "INC-0042", tenantId: DEMO, title: "Weld Cell 4 / Coolant loop", state: "abstained", openedAt: at(38), rank: 1, impact: "high",
      leadTime: { minHours: 6, maxHours: 14, confidence: "medium" },
      summaryText: "Cooling flow is trending down while transformer temperature rises; the controller is compensating. Cause not yet confirmed.",
      templateSummary: "Alert: correlated drift on 3 signals at Weld Cell 4. Top ranked hypothesis: coolant restriction (58%). Evidence and citations below are unaffected.",
      hypotheses: [{ rank: 1, name: "Coolant restriction", probability: 0.58, confirmed: false }, { rank: 2, name: "Flow sensor drift", probability: 0.34, confirmed: false }, { rank: 3, name: "Controller fault", probability: 0.08, confirmed: false }],
      evidence: [{ polarity: "for", text: "Return-temperature rise consistent with reduced flow (signal)", citationId: null },
        { polarity: "for", text: "Manual section 4.2, v3 (effective): strainer restriction raises return temperature", citationId: "CIT-1" },
        { polarity: "against", text: "Pump current unchanged (against H1)", citationId: null }],
      citationBlocked: false, whatWouldChange: ["portable flow reading", "strainer inspection"], citationIds: ["CIT-1"], trustSensorIds: ["FT-401", "TT-402", "IT-405"],
      abstention: { reason: "Cannot separate hypotheses 1 and 2.", proposedCheck: "portable flow reading and strainer inspection", minutes: 10 }, outcome: null, traceId: "4bf92f3577b34da6a3ce929d0e0e4736" },
    { id: "INC-0045", tenantId: DEMO, title: "Cell 3 / Pressure sensor PT-310", state: "awaiting_approval", openedAt: at(165), rank: 4, impact: "low", leadTime: null,
      summaryText: "PT-310 has reported a constant value for 3 h while related signals vary. This looks like a sensor fault, not a machine fault.",
      templateSummary: "Alert: flatline on PT-310. Trust verdict: sensor fault. Sensor check drafted.",
      hypotheses: [{ rank: 1, name: "Sensor or wiring fault", probability: 0.86, confirmed: false }, { rank: 2, name: "Hydraulic pressure genuinely stable", probability: 0.14, confirmed: false }],
      evidence: [{ polarity: "for", text: "Value constant to two decimals for 3 h", citationId: null }, { polarity: "for", text: "Pump speed and downstream flow vary normally", citationId: null }],
      citationBlocked: false, whatWouldChange: ["reading from a portable gauge"], citationIds: [], trustSensorIds: ["PT-310"], abstention: null, outcome: null, traceId: "1a2b3c4d5e6f708192a3b4c5d6e7f809" },
    { id: "INC-0039", tenantId: DEMO, title: "Framing robot R7 / Servo temperature", state: "awaiting_approval", openedAt: at(300), rank: 2, impact: "medium",
      leadTime: { minHours: 12, maxHours: 30, confidence: "medium" },
      summaryText: "Servo temperature on R7 axis 3 is trending above its reference while load is unchanged. Bearing wear or lubrication loss is most likely.",
      templateSummary: "Alert: servo temperature trend on R7. Top ranked hypothesis: lubrication loss (52%).",
      hypotheses: [{ rank: 1, name: "Lubrication loss", probability: 0.52, confirmed: false }, { rank: 2, name: "Bearing wear", probability: 0.36, confirmed: false }, { rank: 3, name: "Cooling fan fault", probability: 0.12, confirmed: false }],
      evidence: [{ polarity: "for", text: "Temperature rise without load change (signal)", citationId: null }],
      citationBlocked: false, whatWouldChange: ["grease level check", "vibration spectrum"], citationIds: [], trustSensorIds: ["TT-701"], abstention: null, outcome: null, traceId: "9f8e7d6c5b4a39281706f5e4d3c2b1a0" },
  ];
  const alertGroups: T.AlertGroup[] = [{ id: "GRP-01", tenantId: DEMO, title: "Weld Cell 4 · coolant loop", likelyCauses: 1, incidentId: "INC-0042" }];
  const alert = (a: Omit<T.Alert, "tenantId" | "isSynthetic"> & { tenantId?: string }): T.Alert => ({ tenantId: DEMO, isSynthetic: true, ...a });
  const lt = (minHours: number, maxHours: number, confidence: T.LeadTime["confidence"] = "medium"): T.LeadTime => ({ minHours, maxHours, confidence });
  const alerts: T.Alert[] = [
    alert({ id: "AL-1001", sensorId: "FT-401", lineId: "line-body-1", signalName: "Coolant flow FT-401", detail: "multivariate drift · AI summary available", status: "incident_open", statusNote: "abstained", rank: 1, impact: "high", leadTime: lt(6, 14), groupId: "GRP-01", incidentId: "INC-0042", arrivedAt: at(38) }),
    alert({ id: "AL-1002", sensorId: "TT-402", lineId: "line-body-1", signalName: "Return temperature TT-402", detail: "slow rise", status: "grouped", statusNote: null, rank: 1, impact: "high", leadTime: lt(6, 14), groupId: "GRP-01", incidentId: "INC-0042", arrivedAt: at(37) }),
    alert({ id: "AL-1003", sensorId: "TT-404", lineId: "line-body-1", signalName: "Transformer temperature TT-404", detail: "controller compensating", status: "grouped", statusNote: null, rank: 1, impact: "high", leadTime: lt(6, 14), groupId: "GRP-01", incidentId: "INC-0042", arrivedAt: at(36) }),
    alert({ id: "AL-0995", sensorId: "TT-701", lineId: "line-body-1", signalName: "Framing robot R7 · servo temperature", detail: "trend above reference", status: "assigned", statusNote: "J. Lee", rank: 2, impact: "medium", leadTime: lt(12, 30), groupId: null, incidentId: "INC-0039", arrivedAt: at(300) }),
    alert({ id: "AL-0990", sensorId: "HT-220", lineId: "line-body-1", signalName: "Paint booth 2 · humidity", detail: "drift within limits", status: "acknowledged", statusNote: null, rank: 3, impact: "medium", leadTime: lt(24, 72, "low"), groupId: null, incidentId: null, arrivedAt: at(420) }),
    alert({ id: "AL-0998", sensorId: "PT-310", lineId: "line-body-1", signalName: "Cell 3 · pressure sensor PT-310", detail: "flatline · likely a sensor fault, not the machine", status: "new", statusNote: "sensor check suggested", rank: 4, impact: "low", leadTime: null, groupId: null, incidentId: "INC-0045", arrivedAt: at(165) }),
    alert({ id: "AL-0980", sensorId: "VT-102", lineId: "line-body-1", signalName: "Conveyor C2 · drive vibration", detail: "broadband noise", status: "new", statusNote: null, rank: 5, impact: "low", leadTime: lt(48, 120, "low"), groupId: null, incidentId: null, arrivedAt: at(600) }),
    alert({ id: "AL-X01", tenantId: OTHER, sensorId: "PT-X1", lineId: "line-x-1", signalName: "Acme press pressure", detail: "other tenant: must never be visible to Demo users", status: "new", statusNote: null, rank: 1, impact: "high", leadTime: lt(2, 4), groupId: null, incidentId: null, arrivedAt: at(10) }),
  ];

  const inspectionSteps: T.WorkOrderStep[] = [
    { no: 1, kind: "confirm_asset", title: "Confirm asset", detail: "Scan the QR tag on the Weld Cell 4 coolant loop", done: false, citationId: null, reading: null, choices: null, choice: null },
    { no: 2, kind: "safety", title: "Safety reminder", detail: "Isolate and lock out the coolant pump before opening the strainer housing. Wear eye protection; coolant may be hot.", done: false, citationId: "CIT-2", reading: null, choices: null, choice: null },
    { no: 3, kind: "reading", title: "Portable flow reading", detail: "At the coolant return line", done: false, citationId: null, reading: { unit: "L/min", referenceRange: { min: 24, max: 30 }, instrumentRange: { min: 0, max: 60 }, value: null }, choices: null, choice: null },
    { no: 4, kind: "inspection", title: "Inspect strainer, add photo", detail: "Manual section 4.2", done: false, citationId: "CIT-1", reading: null, choices: null, choice: null },
    { no: 5, kind: "finding", title: "Record finding", detail: "Feeds verification (LRN-1, LRN-2)", done: false, citationId: null, reading: null, choices: ["Strainer partly blocked", "Strainer clean", "Other"], choice: null },
  ];
  const workOrders: T.WorkOrder[] = [
    { id: "WO-0311", tenantId: DEMO, incidentId: "INC-0042", title: "Inspection · Weld Cell 4 coolant", assetId: "as-wc4-coolant", type: "inspection", status: "pending_approval", steps: inspectionSteps, approvedBy: null, approvedAt: null },
    { id: "WO-0314", tenantId: DEMO, incidentId: "INC-0045", title: "Sensor check · Cell 3 PT-310", assetId: "as-cell3-hyd", type: "sensor", status: "pending_approval", approvedBy: null, approvedAt: null,
      steps: [{ no: 1, kind: "confirm_asset", title: "Confirm asset", detail: "Scan the QR tag on the Cell 3 hydraulic unit", done: false, citationId: null, reading: null, choices: null, choice: null },
        { no: 2, kind: "reading", title: "Portable gauge reading", detail: "Next to PT-310", done: false, citationId: null, reading: { unit: "bar", referenceRange: { min: 3.8, max: 4.6 }, instrumentRange: { min: 0, max: 10 }, value: null }, choices: null, choice: null },
        { no: 3, kind: "finding", title: "Record finding", detail: "Sensor or process", done: false, citationId: null, reading: null, choices: ["Sensor stuck", "Wiring fault", "Sensor fine"], choice: null }] },
    { id: "WO-0309", tenantId: DEMO, incidentId: "INC-0039", title: "Inspection · Robot R7 servo", assetId: "as-r7", type: "inspection", status: "pending_approval", approvedBy: null, approvedAt: null,
      steps: [{ no: 1, kind: "confirm_asset", title: "Confirm asset", detail: "Scan the QR tag on robot R7", done: false, citationId: null, reading: null, choices: null, choice: null },
        { no: 2, kind: "inspection", title: "Check grease level, axis 3", detail: "Robot maintenance manual", done: false, citationId: null, reading: null, choices: null, choice: null }] },
  ];
  const approvals: T.Approval[] = [
    { id: "APR-0311", tenantId: DEMO, workOrderId: "WO-0311", tier: 1, requiredRole: "shift_lead", rationale: "Inspection on a high-impact asset, no line stop needed: tier 1.", ruleIds: ["INSP-01", "IMPACT-HIGH"], policyVersion: "v12", requestedBy: "Agent orchestrator", expiresAt: later(25), status: "pending",
      evidenceSummary: ["Two causes are still possible: coolant restriction (58%) and flow sensor drift (34%).", "A 10-minute check (portable flow reading and strainer inspection) separates them.", "Cited: Weld Transformer Manual v3, section 4.2"] },
    { id: "APR-0314", tenantId: DEMO, workOrderId: "WO-0314", tier: 1, requiredRole: "shift_lead", rationale: "Sensor check, no process impact: tier 1.", ruleIds: ["SENSOR-01"], policyVersion: "v12", requestedBy: "Agent orchestrator", expiresAt: later(180), status: "pending",
      evidenceSummary: ["PT-310 has been constant for 3 h while related signals vary.", "Trust verdict: sensor fault (TRU-3), so a sensor check was drafted, not a machine one."] },
    { id: "APR-0309", tenantId: DEMO, workOrderId: "WO-0309", tier: 1, requiredRole: "shift_lead", rationale: "Inspection on a medium-impact asset: tier 1.", ruleIds: ["INSP-01"], policyVersion: "v12", requestedBy: "Agent orchestrator", expiresAt: later(360), status: "pending",
      evidenceSummary: ["Servo temperature trending above reference without load change.", "Lubrication loss is the top hypothesis (52%)."] },
  ];
  const platformStates: T.PlatformState[] = tenants.map(t => ({ tenantId: t.id, fallbackLevel: "L0", reason: null, since: at(720) }));

  // The CNC machining line comes from the plant topology template (ING-7), so the registry, simulator and OTLP replay share one source.
  const cnc = fromTopology(cncMachiningLineTopology, DEMO, at(0));
  sites.push(...cnc.sites); lines.push(...cnc.lines); stations.push(...cnc.stations); stationLinks.push(...cnc.stationLinks); assets.push(...cnc.assets); sensors.push(...cnc.sensors);

  return { tenants, principals, sites, lines, stations, stationLinks, assets, sensors, citations, lineImpacts, trust, incidents, alertGroups, alerts, workOrders, approvals, platformStates };
}

function round(v: number): number { return Math.round(v * 100) / 100; }
