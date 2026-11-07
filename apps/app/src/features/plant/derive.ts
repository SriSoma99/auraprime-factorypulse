// Pure presentation rules for W14 Plant equipment (02 section 6.1; ING-7, ING-12). State is shown by symbol and label, never colour alone (UI-6).
import type { components } from "@fp/sdk-ts";

type S = components["schemas"];
export type PlantView = S["PlantView"];
export type PlantSensor = S["PlantSensor"];
export type Tone = "default" | "ok" | "warn" | "bad";

/** Worst first: the order the summary and the attention list use. */
export const STATUS_ORDER: S["SensorHealthStatus"][] = ["out_of_range", "flatline", "stale", "no_data", "not_configured", "ok"];

export const STATUS: Record<S["SensorHealthStatus"], { symbol: string; label: string; tone: Tone }> = {
  out_of_range: { symbol: "▲", label: "Out of range", tone: "bad" },
  flatline: { symbol: "▬", label: "Flatline", tone: "warn" },
  stale: { symbol: "◌", label: "Stale", tone: "warn" },
  no_data: { symbol: "○", label: "No data", tone: "default" },
  not_configured: { symbol: "?", label: "No limits set", tone: "default" },
  ok: { symbol: "●", label: "OK", tone: "ok" },
};

export const MACHINE_STATE: Record<S["MachineState"], { symbol: string; label: string; tone: Tone }> = {
  running: { symbol: "▶", label: "Running", tone: "ok" },
  idle: { symbol: "‖", label: "Idle", tone: "warn" },
  stopped: { symbol: "■", label: "Stopped", tone: "bad" },
  unknown: { symbol: "?", label: "State unknown", tone: "default" },
};

export function statusLabel(s: Pick<PlantSensor, "status" | "direction">): string {
  const base = STATUS[s.status].label;
  return s.status === "out_of_range" && s.direction ? `${base} (${s.direction})` : base;
}

/** Rounds to a precision that suits the size of the number, so rpm and mm/s both read naturally. */
export function formatNumber(v: number): string {
  const a = Math.abs(v);
  const digits = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 3;
  return Number(v.toFixed(digits)).toString();
}

export function formatValue(s: Pick<PlantSensor, "lastValue" | "unit">): string {
  return s.lastValue === null ? "—" : `${formatNumber(s.lastValue)} ${s.unit}`;
}

export function formatRange(s: Pick<PlantSensor, "normalRange" | "unit">): string {
  return s.normalRange ? `${formatNumber(s.normalRange.min)}–${formatNumber(s.normalRange.max)} ${s.unit}` : "not set";
}

export function silenceText(s: Pick<PlantSensor, "status" | "silentForSeconds" | "maxSilenceSeconds">): string | null {
  if (s.status !== "stale" || s.silentForSeconds === null) return null;
  return `silent ${s.silentForSeconds} s (limit ${s.maxSilenceSeconds} s)`;
}

export function summary(view: PlantView): { status: S["SensorHealthStatus"]; count: number }[] {
  return STATUS_ORDER.map(status => ({ status, count: view.counts[status] })).filter(x => x.count > 0);
}

export function totalSensors(view: PlantView): number {
  return Object.values(view.counts).reduce((a, b) => a + b, 0);
}

export type PlantState = "loading" | "error" | "empty" | "noTelemetry" | "live";

export function derivePlantState(view: PlantView | undefined, loading: boolean, error: boolean): PlantState {
  if (loading) return "loading";
  if (error) return "error";
  if (!view || totalSensors(view) === 0) return "empty";
  return view.counts.no_data + view.counts.not_configured === totalSensors(view) ? "noTelemetry" : "live";
}

export interface LineOption { id: string; label: string; attention: number }

/** Anything but OK needs attention, including no data: a sensor that never reports is a fault, not a quiet sensor. */
export const needsAttention = (s: Pick<PlantSensor, "status">) => s.status !== "ok";

export function lineOptions(view: PlantView | undefined): LineOption[] {
  return (view?.sites ?? []).flatMap(site => site.lines.map(line => ({
    id: line.id, label: `${site.name} · ${line.name}`,
    attention: line.stations.flatMap(st => st.machines.flatMap(m => m.sensors)).filter(needsAttention).length,
  })));
}

/** Keeps every station and machine so the layout of the line stays recognisable; only the sensor rows are filtered. */
export function visibleLine(view: PlantView | undefined, lineId: string | null, attentionOnly: boolean) {
  const line = (view?.sites ?? []).flatMap(s => s.lines).find(l => l.id === lineId) ?? null;
  if (!line) return null;
  const order = (s: PlantSensor) => STATUS_ORDER.indexOf(s.status);
  return {
    ...line,
    stations: line.stations.map(st => ({
      ...st,
      machines: st.machines.map(m => ({ ...m, sensors: [...m.sensors].filter(s => !attentionOnly || needsAttention(s)).sort((a, b) => order(a) - order(b)) })),
    })),
  };
}
