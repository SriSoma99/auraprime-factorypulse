// W05 Telemetry trust (02 section 6.1; wireframe doc/wireframes/W05-telemetry-trust.html).
import { Pressable, useWindowDimensions, View } from "react-native";
import { useTrustVM } from "@/features/trust/useTrustVM";
import { TrustBadge } from "@/ui/domain";
import { Card, Heading, Loading, Row, Screen, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import type { Point } from "@/features/trust/types";

export default function Trust() {
  const vm = useTrustVM();
  const wide = useWindowDimensions().width >= 900;
  if (vm.state === "loading" && !vm.detail) return <Screen><Loading /></Screen>;
  const d = vm.detail;
  return (
    <Screen testID="screen-trust">
      <Heading>Telemetry trust</Heading>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
        <View style={{ flex: 1, gap: 6, maxWidth: wide ? 320 : undefined }}>
          <Heading level={3}>Sensors · lowest trust first</Heading>
          {Object.entries(vm.groups).map(([asset, sensors]) => (
            <View key={asset} style={{ gap: 6 }}>
              <T size="small" tone="muted">{asset}</T>
              {sensors.map(s => (
                <Pressable key={s.id} accessibilityRole="button" accessibilityState={{ selected: s.id === vm.selected }} testID={`sensor-${s.id}`} onPress={() => vm.select(s.id)}>
                  <Card emphasis={s.id === vm.selected}><Row style={{ justifyContent: "space-between" }} wrap={false}><T style={{ flexShrink: 1 }}>{s.name}</T><TrustBadge trust={s.trust} /></Row></Card>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
        {d ? (
          <View style={{ flex: 2, gap: 12 }}>
            <Row><T size="title" bold>{d.sensor.name}</T><T size={30} bold mono>{d.score === null ? "—" : d.score.toFixed(2)}</T><TrustBadge trust={{ level: d.level }} /><T size="small" tone="muted">{d.meta}</T></Row>
            <Card tone={d.verdictTone === "default" ? "default" : d.verdictTone} testID="trust-verdict">
              <T><T bold>Verdict: {d.verdictLabel.toLowerCase()}.</T> {d.verdictText}</T>
              <T size="small" tone="muted">Advisory input to diagnosis, not a final answer.</T>
            </Card>
            {d.checks.length ? (
              <Card>
                <Heading level={3}>Checks</Heading>
                {d.checks.map(c => (
                  <Row key={c.name} wrap={false} style={{ justifyContent: "space-between" }}>
                    <T style={{ flex: 1.2 }}>{c.name}</T>
                    <T mono style={{ flex: 0.6 }} tone={c.status === "fail" ? "bad" : c.status === "warn" ? "warn" : c.status === "not_running" || c.status === "not_applicable" ? "muted" : "default"}>
                      {c.score === null || c.score === undefined ? (c.status === "not_running" ? "not running" : "n/a") : c.score.toFixed(2)}
                    </T>
                    <T style={{ flex: 2 }} tone={c.status === "not_running" ? "muted" : "default"}>{c.finding}</T>
                  </Row>
                ))}
              </Card>
            ) : null}
            {d.series ? <Card><Heading level={3}>Consistency · last 24 h</Heading><Spark actual={d.series.actual} expected={d.series.expected} /><T size="small" tone="muted">Solid: reading ({d.series.unit}). Dashed: value expected from related signals.</T></Card> : null}
            {d.history.length ? <Card><Heading level={3}>Verdict history</Heading>{d.history.map((h, k) => <Row key={k}><T mono tone="muted">{h.at}</T><T bold>{h.verdict}</T><T>{h.note}</T></Row>)}</Card> : null}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

/** Minimal dependency-free line chart from Views (react-native-svg is not added for the prototype). */
function Spark({ actual, expected }: { actual: Point[]; expected: Point[] }) {
  const t = useTheme();
  const all = [...actual, ...expected].map(p => p.v);
  const min = Math.min(...all), max = Math.max(...all), H = 120;
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * (H - 10) - 5;
  return (
    <View style={{ height: H, flexDirection: "row", alignItems: "stretch", gap: 2, borderLeftWidth: 1, borderBottomWidth: 1, borderColor: t.line }}>
      {actual.map((p, k) => (
        <View key={k} style={{ flex: 1, position: "relative" }}>
          <View style={{ position: "absolute", top: y(expected[k]?.v ?? p.v), left: 0, right: 0, height: 2, borderTopWidth: 2, borderStyle: "dashed", borderColor: t.muted }} />
          <View style={{ position: "absolute", top: y(p.v), left: 0, right: 0, height: 3, backgroundColor: t.ink }} />
        </View>
      ))}
    </View>
  );
}
