// W03 Incident detail (02 section 6.1; wireframe doc/wireframes/W03-incident-detail.html).
import { useLocalSearchParams } from "expo-router";
import { useAccess } from "@/features/shell/useAccess";
import { useWindowDimensions, View } from "react-native";
import { useIncidentVM } from "@/features/incident/useIncidentVM";
import { Badge, DraftTag, ImpactBadge, TrustBadge } from "@/ui/domain";
import { Button, Card, Chip, Heading, Loading, Row, Screen, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";

export default function IncidentDetail() {
  const acc = useAccess();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = useIncidentVM(id);
  const wide = useWindowDimensions().width >= 760;
  const t = useTheme();
  if (vm.state === "loading") return <Screen><Loading /></Screen>;
  if (vm.state === "error" || !vm.incident) return <Screen><Card tone="bad"><T bold>Incident could not be loaded</T></Card></Screen>;
  const i = vm.incident;
  return (
    <Screen testID="screen-incident">
      {vm.state === "reopened" ? <Card tone="bad"><T bold>Reopened</T><T>Drift recurred before the required good cycles. Confidence in the previous top hypothesis was lowered.</T></Card> : null}
      <Row>
        <Heading>{i.title}</Heading>
        {i.impact ? <ImpactBadge impact={i.impact} /> : null}
        {vm.leadTime ? <T size="small" tone="muted">Lead time <T bold size="small">{vm.leadTime}</T> ({i.leadTime?.confidence} confidence)</T> : null}
        <T size="small" tone="muted">Incident <T bold size="small">{i.id}</T></T>
      </Row>
      <Card tone="alt" testID="incident-summary">
        <Chip label={i.summary.kind === "ai" ? "AI-generated" : "Template summary · no model in use"} tone={i.summary.kind === "ai" ? "ai" : "default"} testID="summary-kind" />
        <T>{i.summary.text}</T>
      </Card>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
        <Card style={{ flex: 1 }} testID="incident-hypotheses">
          <Heading level={3}>Hypotheses</Heading>
          {i.hypotheses.map(h => (
            <Row key={h.rank} wrap={false}>
              <T mono tone="muted">{h.rank}</T>
              <T style={{ flex: 1 }}>{h.name}{h.confirmed ? "  ✓ confirmed" : ""}</T>
              <T mono>{Math.round(h.probability * 100)}%</T>
              <View style={{ width: 90, height: 10, borderWidth: 1, borderColor: t.line, borderRadius: 3, backgroundColor: t.surfaceAlt }}>
                <View style={{ width: `${h.probability * 100}%`, height: "100%", backgroundColor: t.muted, opacity: 0.4 }} />
              </View>
            </Row>
          ))}
          {i.sensorTrust.length ? <Heading level={3}>Sensor trust</Heading> : null}
          {i.sensorTrust.map(s => <Row key={s.sensorId} style={{ justifyContent: "space-between" }}><T>{s.name}</T><TrustBadge trust={{ level: s.level }} /></Row>)}
        </Card>
        <Card style={{ flex: 1 }} testID="incident-evidence">
          <Heading level={3}>Evidence ledger</Heading>
          {i.evidence.map((e, k) => (
            <Row key={k} wrap={false} align="flex-start"><T mono>{e.polarity === "for" ? "+" : "−"}</T><T style={{ flex: 1 }}>{e.text}{e.citationId ? <T tone="accent"> [{vm.citationFor(e.citationId)}]</T> : null}</T></Row>
          ))}
          {i.citationBlocked ? <Card tone="bad" dashed><T><T bold>Claim withheld.</T> A supporting passage could not be verified against its cited document version, so it is not shown (RAG-6).</T></Card> : null}
          <T><T bold>What would change this: </T>{i.whatWouldChange.join("; ")}.</T>
          <Heading level={3}>Citations</Heading>
          {i.citations.length === 0 ? <T size="small" tone="muted">No verified citations for this incident.</T> : null}
          {i.citations.map((c, k) => <T key={c.id} tone="accent" size="small">[{k + 1}] {c.title} {c.version}, {c.section} · effective {c.effectiveFrom}</T>)}
        </Card>
      </View>
      {i.abstention ? (
        <Card tone="warn" testID="abstention">
          <T bold>Insufficient evidence to name a root cause</T>
          <T>{i.abstention.reason} Cheapest check: {i.abstention.proposedCheck} (about {i.abstention.minutes} min).</T>
        </Card>
      ) : null}
      {i.outcome ? <Card tone="ok"><T bold>{i.state === "verified" ? "Verified closure" : "Outcome recorded"}</T><T>{i.outcome.text}</T></Card> : null}
      {i.workOrderId ? (
        <Card dashed>
          <Row><DraftTag /><T bold>Work order {i.workOrderId}</T></Row>
          <Row>
            {i.approvalId && acc.canView("approvals") ? <Button label="Review approval" variant="primary" onPress={vm.openApproval} testID="open-approval" /> : null}
            {acc.canView("field") ? <Button label="Open checklist" onPress={vm.openWorkOrder} testID="open-work-order" /> : null}
          </Row>
        </Card>
      ) : null}
      <Row>{i.timeline.map(s => <Badge key={s.step} text={`${s.done ? "✓ " : ""}${s.step}`} />)}</Row>
      <T size="small" tone="muted">Trace ID for engineers: {i.traceId}</T>
    </Screen>
  );
}
