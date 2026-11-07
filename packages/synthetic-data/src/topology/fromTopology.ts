// Maps a plant topology template (template_version 1.0) onto the asset registry rows (ING-7, ISA-95 site > line > station > machine > sensor).
import type * as T from "../types.ts";
import type { LineTopologyTemplate } from "./cncLineTopology.ts";

export interface RegistryRows {
  sites: T.Site[]; lines: T.Line[]; stations: T.Station[]; stationLinks: T.StationLink[]; assets: T.Asset[]; sensors: T.Sensor[];
}

export function fromTopology(t: LineTopologyTemplate, tenantId: string, lastReadingAt: string): RegistryRows {
  const out: RegistryRows = { sites: [{ id: t.site.site_id, tenantId, name: t.site.name }], lines: [], stations: [], stationLinks: [], assets: [], sensors: [] };
  for (const line of t.lines) {
    out.lines.push({ id: line.line_id, tenantId, siteId: t.site.site_id, name: line.name });
    for (const st of line.stations) {
      out.stations.push({ id: st.station_id, tenantId, lineId: line.line_id, name: st.name, position: st.position, cycleTimeS: st.cycle_time_s, isBottleneck: st.is_bottleneck, lastReadingAt });
      for (const m of st.machines) {
        const rule = m.operating_profile.mode_rules;
        out.assets.push({
          id: m.machine_id, tenantId, stationId: st.station_id, name: m.name, equipmentType: m.equipment_type, plantTag: m.plant_tag, model: `${m.manufacturer} ${m.model}`,
          stateRule: { sensorId: rule.signal_ref, runAtOrAbove: rule.run_at_or_above, stoppedBelow: rule.stopped_below },
        });
        for (const s of m.sensors) {
          out.sensors.push({
            id: s.sensor_id, tenantId, assetId: m.machine_id, name: `${s.name} ${s.sensor_id}`, unit: s.unit, meta: `${s.sensor_type} · ${s.mount}`,
            measurand: s.measurand, normalRange: { ...s.normal_range }, instrumentRange: { ...s.instrument_range }, maxSilenceS: s.sampling.max_silence_s,
          });
        }
      }
    }
    for (const l of line.links) out.stationLinks.push({ tenantId, fromStationId: l.from, toStationId: l.to, bufferMinutes: l.buffer_minutes });
  }
  return out;
}
