// Basic sensor health and machine state from registry limits and recent readings (ING-12, ADR-039).
// Deterministic rules only; the cross-sensor trust score stays in TRU-1 (Full).

export type SensorHealthStatus = "ok" | "out_of_range" | "flatline" | "stale" | "no_data" | "not_configured";
export type MachineState = "running" | "idle" | "stopped" | "unknown";

export interface Limits { normalMin: number | null; normalMax: number | null; maxSilenceS: number | null }
export interface Reading { ts: Date; value: number }
export interface HealthRules { flatlineMinPoints: number; flatlineTolerancePct: number }
export interface SensorHealth {
  status: SensorHealthStatus;
  direction: "low" | "high" | null;
  lastValue: number | null;
  lastAt: Date | null;
  silentForS: number | null;
}

/** Readings must be newest first and already limited to the lookback window. Order of precedence: no data, stale, out of range, flatline, ok. */
export function assessSensor(limits: Limits, readings: readonly Reading[], now: Date, rules: HealthRules): SensorHealth {
  const last = readings[0];
  const base = { direction: null, lastValue: last?.value ?? null, lastAt: last?.ts ?? null, silentForS: last ? Math.max(0, Math.round((now.getTime() - last.ts.getTime()) / 1000)) : null };
  const { normalMin, normalMax, maxSilenceS } = limits;
  if (normalMin === null || normalMax === null || maxSilenceS === null) return { ...base, status: "not_configured" };
  if (!last) return { ...base, status: "no_data" };
  if (base.silentForS! > maxSilenceS) return { ...base, status: "stale" };
  if (last.value < normalMin) return { ...base, status: "out_of_range", direction: "low" };
  if (last.value > normalMax) return { ...base, status: "out_of_range", direction: "high" };
  if (readings.length >= rules.flatlineMinPoints) {
    const window = readings.slice(0, rules.flatlineMinPoints).map(r => r.value);
    const spread = Math.max(...window) - Math.min(...window);
    if (spread <= ((normalMax - normalMin) * rules.flatlineTolerancePct) / 100) return { ...base, status: "flatline" };
  }
  return { ...base, status: "ok" };
}

export interface StateRule { runAtOrAbove: number; stoppedBelow: number }

/** A machine's state is read from its state sensor; without a fresh reading it is unknown, never assumed running. */
export function machineState(rule: StateRule | null, stateSensor: SensorHealth | undefined): MachineState {
  if (!rule || !stateSensor || stateSensor.lastValue === null || stateSensor.status === "stale" || stateSensor.status === "no_data") return "unknown";
  if (stateSensor.lastValue >= rule.runAtOrAbove) return "running";
  if (stateSensor.lastValue < rule.stoppedBelow) return "stopped";
  return "idle";
}

/** A stopped or idle machine's signals may legitimately hold steady, so a flatline only counts while the machine runs or its state is unknown. */
export function settleForState(h: SensorHealth, state: MachineState): SensorHealth {
  return h.status === "flatline" && (state === "stopped" || state === "idle") ? { ...h, status: "ok" } : h;
}
