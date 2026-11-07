// Row shapes for the synthetic dataset; they mirror packages/db/migrations/0001_schema.sql.
export type Role = "operator" | "technician" | "shift_lead" | "reliability_engineer" | "operations_manager" | "admin";
export type SessionType = "human" | "api_key" | "agent_token";
export interface Range { min: number; max: number }
export interface LeadTime { minHours: number; maxHours: number; confidence: "low" | "medium" | "high" }
export interface Point { t: string; v: number }

export interface Tenant { id: string; name: string; edition: "community" | "full" }
export interface Principal { id: string; tenantId: string; displayName: string; role: Role; sessionType: SessionType; siteId: string }
export interface Site { id: string; tenantId: string; name: string }
export interface Line { id: string; tenantId: string; siteId: string; name: string }
export interface Station { id: string; tenantId: string; lineId: string; name: string; position: number; cycleTimeS: number; isBottleneck: boolean; lastReadingAt: string }
export interface StationLink { tenantId: string; fromStationId: string; toStationId: string; bufferMinutes: number | null }
/** Machine state comes from one speed-like signal and two thresholds (topology template operating_profile.mode_rules). */
export interface StateRule { sensorId: string; runAtOrAbove: number; stoppedBelow: number }
export interface Asset { id: string; tenantId: string; stationId: string; name: string; equipmentType: string | null; plantTag: string | null; model: string | null; stateRule: StateRule | null }
/** Operating limits live in the registry (ING-7), never in retrieved documents (RAG-11). */
export interface SensorLimits { measurand: string; normalRange: Range; instrumentRange: Range; maxSilenceS: number }
export interface Sensor extends SensorLimits { id: string; tenantId: string; assetId: string; name: string; unit: string; meta: string }
export interface Citation { id: string; tenantId: string; title: string; section: string; version: string; effectiveFrom: string; verified: boolean }
export interface LineImpact { lineId: string; tenantId: string; cascade: { fromStationId: string; toStationId: string; description: string } | null; stationImpact: { stationId: string; throughputAtRiskPct: Range; rejectRisk: "low" | "medium" | "high" } | null }
export interface TrustCheck { name: string; score: number | null; status: "ok" | "warn" | "fail" | "not_applicable" | "not_running"; finding: string }
export interface TrustAssessment { sensorId: string; tenantId: string; score: number | null; level: "high" | "medium" | "low" | "not_scored"; verdict: "machine_fault" | "sensor_fault" | "undetermined" | "no_fault" | "not_scored"; verdictText: string; checks: TrustCheck[]; series: { unit: string; actual: Point[]; expected: Point[] }; history: { at: string; verdict: string; note: string }[]; sensorWorkOrderId: string | null }
export interface Incident { id: string; tenantId: string; title: string; state: string; openedAt: string; rank: number | null; impact: string | null; leadTime: LeadTime | null; summaryText: string; templateSummary: string; hypotheses: { rank: number; name: string; probability: number; confirmed: boolean }[]; evidence: { polarity: "for" | "against"; text: string; citationId: string | null }[]; citationBlocked: boolean; whatWouldChange: string[]; citationIds: string[]; trustSensorIds: string[]; abstention: { reason: string; proposedCheck: string; minutes: number } | null; outcome: { text: string } | null; traceId: string }
export interface AlertGroup { id: string; tenantId: string; title: string; likelyCauses: number; incidentId: string | null }
export interface Alert { id: string; tenantId: string; sensorId: string; lineId: string; signalName: string; detail: string; status: string; statusNote: string | null; rank: number | null; impact: string | null; leadTime: LeadTime | null; groupId: string | null; incidentId: string | null; arrivedAt: string; isSynthetic: true }
export interface WorkOrderStep { no: number; kind: "confirm_asset" | "safety" | "reading" | "inspection" | "finding"; title: string; detail: string; done: boolean; citationId: string | null; reading: { unit: string; referenceRange: Range; instrumentRange: Range; value: number | null } | null; choices: string[] | null; choice: string | null }
export interface WorkOrder { id: string; tenantId: string; incidentId: string; title: string; assetId: string; type: "inspection" | "sensor" | "machine"; status: string; steps: WorkOrderStep[]; approvedBy: string | null; approvedAt: string | null }
export interface Approval { id: string; tenantId: string; workOrderId: string; tier: number; requiredRole: Role; rationale: string; ruleIds: string[]; policyVersion: string; requestedBy: string; expiresAt: string; status: string; evidenceSummary: string[] }
export interface PlatformState { tenantId: string; fallbackLevel: "L0" | "L1" | "L2" | "L3" | "L4" | "L5"; reason: string | null; since: string }

export interface Dataset {
  tenants: Tenant[]; principals: Principal[]; sites: Site[]; lines: Line[]; stations: Station[]; stationLinks: StationLink[];
  assets: Asset[]; sensors: Sensor[]; citations: Citation[]; lineImpacts: LineImpact[]; trust: TrustAssessment[];
  incidents: Incident[]; alertGroups: AlertGroup[]; alerts: Alert[]; workOrders: WorkOrder[]; approvals: Approval[]; platformStates: PlatformState[];
}
export interface GenerateOptions { seed: number; referenceTime: string }
