// W02 Alert queue (02 section 6.1; wireframe doc/wireframes/W02-alert-queue.html).
import { Pressable, useWindowDimensions, View } from "react-native";
import { useAlertQueueVM } from "@/features/alerts/useAlertQueueVM";
import type { QueueRowVM } from "@/features/alerts/derive";
import { ImpactBadge, TrustBadge, Badge } from "@/ui/domain";
import { Card, Chip, Heading, Loading, Row, Screen, T, Button } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";

export default function AlertQueue() {
  const vm = useAlertQueueVM();
  const wide = useWindowDimensions().width >= 760;
  return (
    <Screen testID="screen-alerts">
      <Row style={{ justifyContent: "space-between" }}>
        <Heading>Alerts</Heading>
        <Row><T size="small" tone="muted" >{vm.header}</T><Chip label={vm.live ? "● Live" : "Live updates paused"} tone={vm.live ? "ok" : "warn"} /></Row>
      </Row>
      <T size="small" tone="muted">{vm.sortNote}</T>
      {vm.state === "loading" ? <Loading /> : null}
      {vm.state === "error" ? <Card tone="bad"><T bold>Alerts could not be loaded</T><T>Alerting itself is not affected. This screen retries automatically.</T><Button label="Retry now" onPress={vm.retry} /></Card> : null}
      {vm.state === "empty" ? <Card><T bold>No open alerts</T><T tone="muted">Telemetry is arriving and no detector has raised an alert. This is different from having no data.</T></Card> : null}
      {vm.rows.map(r => <QueueRow key={r.id} row={r} wide={wide} showImpact={vm.showImpact} onOpen={vm.open} />)}
      <T size="small" tone="muted">Approvals are never done in bulk: each draft needs its own decision in Approvals.</T>
    </Screen>
  );
}

function QueueRow({ row, wide, showImpact, onOpen }: { row: QueueRowVM; wide: boolean; showImpact: boolean; onOpen: (id: string | null) => void }) {
  const t = useTheme();
  if (row.kind === "group") {
    return (
      <Pressable accessibilityRole="button" testID={`group-${row.id}`} onPress={() => onOpen(row.incidentId)}>
        <Card tone="alt"><Row><T mono tone="muted">{row.rank}</T><T bold>▾ {row.title}</T><T size="small">{row.summary}</T></Row></Card>
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" testID={`alert-${row.id}`} onPress={() => onOpen(row.incidentId)} disabled={!row.incidentId}>
      <Card style={{ marginLeft: row.child ? 20 : 0 }}>
        <View style={{ flexDirection: wide ? "row" : "column", gap: 8, alignItems: wide ? "center" : "flex-start" }}>
          <View style={wide ? { flex: 2, gap: 2 } : { gap: 2 }}>
            <Row wrap={false} align="flex-start">{row.rank ? <T mono tone="muted">{row.rank}</T> : null}<T bold style={{ flexShrink: 1 }}>{row.title}</T></Row>
            <T size="small" tone="muted">{row.detail}</T>
          </View>
          {showImpact ? <View style={wide ? { flex: 1 } : undefined}><ImpactBadge impact={row.impact} basic={row.impactBasic} /></View> : null}
          {showImpact ? <View style={wide ? { flex: 1 } : undefined}><T>{row.leadTime ?? "—"}</T>{row.leadHint ? <T size="small" tone="muted">{row.leadHint}</T> : null}</View> : null}
          {row.trust ? <View style={wide ? { flex: 1 } : undefined}><TrustBadge trust={row.trust} /></View> : null}
          <View style={wide ? { flex: 1.3 } : undefined}><Badge text={row.status} borderColor={t.line} /></View>
        </View>
      </Card>
    </Pressable>
  );
}
