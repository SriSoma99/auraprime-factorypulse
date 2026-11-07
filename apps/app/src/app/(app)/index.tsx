// W14 Plant equipment (02 section 6.1; wireframe doc/wireframes/W14-plant-equipment.html; ING-7, ING-12).
import { Pressable, useWindowDimensions, View } from "react-native";
import { usePlantVM } from "@/features/plant/usePlantVM";
import { useMockControlsVM } from "@/features/dev/useMockControlsVM";
import { MACHINE_STATE, STATUS, formatRange, formatValue, silenceText, statusLabel, type Tone } from "@/features/plant/derive";
import { Card, Chip, Heading, Loading, Row, Screen, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";

const chipTone = (tone: Tone) => (tone === "ok" ? "ok" : tone === "warn" ? "warn" : tone === "bad" ? "bad" : "default");

export default function PlantEquipment() {
  const vm = usePlantVM();
  const local = useMockControlsVM().available;
  const t = useTheme();
  const wide = useWindowDimensions().width >= 900;
  if (vm.state === "loading") return <Screen><Loading /></Screen>;
  if (vm.state === "error") return <Screen testID="screen-plant"><Card tone="bad"><T>The plant view could not be loaded. It retries automatically.</T></Card></Screen>;
  if (vm.state === "empty") return <Screen testID="screen-plant"><Heading>Plant equipment</Heading><Card dashed><T tone="muted">No equipment is registered for this site yet.</T></Card></Screen>;
  return (
    <Screen testID="screen-plant">
      <Heading>Plant equipment</Heading>
      <Card testID="plant-summary">
        <Row>
          {vm.summary.map(s => <Chip key={s.status} testID={`count-${s.status}`} tone={chipTone(STATUS[s.status].tone)} label={`${STATUS[s.status].symbol} ${s.count} ${STATUS[s.status].label.toLowerCase()}`} />)}
        </Row>
        <T size="small" tone="muted">Health from registry limits and readings in the last {vm.lookbackMinutes} min · updated {vm.updated}</T>
      </Card>
      {vm.state === "noTelemetry" ? (
        <Card dashed testID="no-telemetry">
          <T bold>No telemetry received in the last {vm.lookbackMinutes} min.</T>
          <T size="small" tone="muted">Every sensor shows "no data" until readings arrive over MQTT or OTLP. Check the edge gateway and sensor connections.</T>
          {/* Start commands only in the local build, where mock controls are on; plant users never see them. */}
          {local ? <T size="small" tone="muted" testID="no-telemetry-dev">Local pipeline: pnpm dev:ingest, pnpm dev:stream, then pnpm sim --scenario cnc_machining_line --ticks 600.</T> : null}
        </Card>
      ) : null}
      <Row>
        {vm.lines.map(l => (
          <Pressable key={l.id} accessibilityRole="button" accessibilityState={{ selected: l.id === vm.lineId }} testID={`line-${l.id}`} onPress={() => vm.selectLine(l.id)} style={{ maxWidth: "100%" }}>
            <Card emphasis={l.id === vm.lineId} style={{ paddingVertical: 6 }}><T bold={l.id === vm.lineId}>{l.label}{l.attention ? ` · ${l.attention} need attention` : ""}</T></Card>
          </Pressable>
        ))}
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: vm.attentionOnly }} testID="attention-only" onPress={() => vm.setAttentionOnly(!vm.attentionOnly)}>
          <Card style={{ paddingVertical: 6 }}><T>{vm.attentionOnly ? "☑" : "☐"} Only sensors needing attention</T></Card>
        </Pressable>
      </Row>
      {vm.line ? (
        <View testID={`plant-line-${vm.line.id}`} style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {vm.line.stations.map(st => (
            <View key={st.id} testID={`plant-station-${st.id}`} style={{ width: wide ? 340 : "100%", gap: 6, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: t.line, backgroundColor: t.bg }}>
              <Row style={{ justifyContent: "space-between" }} wrap={false}>
                <T bold>{st.position}. {st.name}</T>
                <T size="small" tone="muted">{st.cycleTimeSeconds} s cycle{st.isBottleneck ? " · ◆ bottleneck" : ""}</T>
              </Row>
              {st.machines.map(m => (
                <Card key={m.id} testID={`machine-${m.id}`}>
                  <Row style={{ justifyContent: "space-between" }}>
                    <View style={{ flexShrink: 1 }}>
                      <T bold>{m.name}</T>
                      <T size="small" tone="muted">{[m.plantTag, m.model].filter(Boolean).join(" · ") || m.id}</T>
                    </View>
                    <Chip testID={`state-${m.id}`} tone={chipTone(MACHINE_STATE[m.state].tone)} label={`${MACHINE_STATE[m.state].symbol} ${MACHINE_STATE[m.state].label}`} />
                  </Row>
                  {m.sensors.length === 0 ? <T size="small" tone="muted">{vm.attentionOnly ? "All sensors OK." : "No sensors registered."}</T> : null}
                  {m.sensors.map(s => (
                    <View key={s.id} testID={`sensor-${s.id}`} style={{ borderTopWidth: 1, borderColor: t.line, paddingTop: 4, gap: 2 }}>
                      <Row style={{ justifyContent: "space-between" }} wrap={false}>
                        <T style={{ flexShrink: 1 }}>{s.name}</T>
                        <T testID={`status-${s.id}`} bold size="small" style={{ flexShrink: 0, textAlign: "right" }} tone={STATUS[s.status].tone === "default" ? "muted" : STATUS[s.status].tone}>{STATUS[s.status].symbol} {statusLabel(s)}</T>
                      </Row>
                      <Row style={{ justifyContent: "space-between" }} wrap={false}>
                        <T mono testID={`value-${s.id}`}>{formatValue(s)}</T>
                        <T size="small" tone="muted">normal {formatRange(s)}</T>
                      </Row>
                      {silenceText(s) ?? vm.lastAt(s.lastAt) ? <T size="small" tone="muted">{silenceText(s) ?? `last reading ${vm.lastAt(s.lastAt)}`}</T> : null}
                    </View>
                  ))}
                </Card>
              ))}
              {st.bufferToNextMinutes !== null ? <T size="small" tone="muted">→ {st.bufferToNextMinutes} min buffer to next station</T> : null}
            </View>
          ))}
        </View>
      ) : null}
      <T size="small" tone="muted">Symbols carry the state: ● OK · ▲ out of range · ▬ flatline · ◌ stale · ○ no data. Limits come from the equipment registry, not from documents.</T>
    </Screen>
  );
}
