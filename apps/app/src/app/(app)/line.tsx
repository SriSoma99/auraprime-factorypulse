// W01 Line overview (02 section 6.1; wireframe doc/wireframes/W01-line-overview.html).
import { Pressable, useWindowDimensions, View } from "react-native";
import { useLineOverviewVM } from "@/features/line/useLineOverviewVM";
import { ImpactBadge } from "@/ui/domain";
import { Card, Heading, Loading, Row, Screen, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";

export default function LineOverview() {
  const vm = useLineOverviewVM();
  const t = useTheme();
  const wide = useWindowDimensions().width >= 900;
  if (vm.state === "loading") return <Screen><Loading /></Screen>;
  return (
    <Screen testID="screen-line">
      <Heading>{vm.full ? "Line map" : "Stations"} · {vm.lineName}</Heading>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
        <View style={{ flex: 2, gap: 12 }}>
          {vm.full ? (
            <Card testID="line-map">
              {vm.cascade ? <T size="small" tone="bad">⇢ Cascade: {vm.cascade.description}</T> : null}
              {vm.impactStatus === "basic" ? <T size="small" tone="warn">Impact uses basic checks at this fallback level; cascade not estimated.</T> : null}
              {/* The map sits on a canvas and wraps, so the whole line is visible at any width (W01 .map). */}
              <View testID="line-canvas" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", padding: 10, backgroundColor: t.bg, borderWidth: 1, borderColor: t.line, borderRadius: 8 }}>
                {vm.stations.map((s, k) => (
                  <Row key={s.id} wrap={false}>
                    <Pressable accessibilityRole="button" disabled={!s.incidentId} onPress={() => vm.open(s.incidentId)} testID={`station-${s.id}`}>
                      <View style={{ width: 120, padding: 8, borderRadius: 6, backgroundColor: t.surface, borderWidth: s.state === "alert" ? 2.5 : 1.5, borderColor: s.state === "alert" ? t.badLine : t.muted, borderStyle: vm.impactStatus === "unknown" ? "dashed" : "solid", gap: 2 }}>
                        <T bold size={14}>{s.state === "alert" ? "▲" : "●"} {s.name}</T>
                        <T size="small" tone="muted">{s.cycleTimeSeconds} s cycle</T>
                        {s.isBottleneck ? <T size="small" bold>◆ bottleneck</T> : null}
                        {s.incidentId ? <T size="small" mono tone="muted">{s.incidentId}</T> : null}
                      </View>
                    </Pressable>
                    {k < vm.stations.length - 1 ? <View style={{ alignItems: "center" }}><T tone="muted">→</T>{s.buffer ? <T size={11} mono tone="muted">{s.buffer} min</T> : null}</View> : null}
                  </Row>
                ))}
              </View>
              <T size="small" tone="muted">State is shown by shape and label: ● normal · ▲ alert · ◆ bottleneck</T>
            </Card>
          ) : (
            <Card testID="station-list">
              {vm.stations.map(s => <Row key={s.id} style={{ justifyContent: "space-between" }}><T bold={s.state === "alert"}>{s.state === "alert" ? "▲" : "●"} {s.name}</T><T size="small" tone="muted">{s.openAlerts} open · {s.lastReading}</T></Row>)}
              <T size="small" tone="muted">The line map, bottleneck, cascade and impact ranking are part of the Full edition (LIM-1 to LIM-4).</T>
            </Card>
          )}
          {vm.stationImpact ? (
            <Card>
              <Row style={{ justifyContent: "space-between" }}>
                <View><T size="small" tone="muted">Selected</T><T bold>{vm.stationImpact.name}</T></View>
                <View><T size="small" tone="muted">Throughput at risk</T><T bold>−{vm.stationImpact.throughputAtRiskPct.min} to −{vm.stationImpact.throughputAtRiskPct.max} %</T></View>
                <View><T size="small" tone="muted">Reject risk</T><T bold>{vm.stationImpact.rejectRisk}</T></View>
              </Row>
            </Card>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <Heading level={3}>{vm.full ? "Ranked by line impact" : "Open alerts · newest first"}</Heading>
          {vm.state === "noAlerts" ? <Card dashed><T tone="muted">No open alerts on this line.</T></Card> : null}
          {vm.queue.map((r, k) => (
            <Pressable key={r.id} accessibilityRole="button" onPress={() => vm.open(r.incidentId)}>
              <Card emphasis={k === 0}>
                <T bold>{r.rank ? `${r.rank} ` : ""}{r.title}</T>
                {r.kind === "alert" ? <Row>{vm.full ? <ImpactBadge impact={r.impact} basic={r.impactBasic} /> : null}{r.leadTime ? <T size="small" tone="muted">lead {r.leadTime}</T> : null}<T size="small" tone="muted">{r.status}</T></Row> : <T size="small" tone="muted">{r.summary}</T>}
              </Card>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}
