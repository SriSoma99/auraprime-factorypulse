// W04 approval detail / M03 Approval: decide one draft. Large controls for one-handed use (02 section 12).
import { useLocalSearchParams } from "expo-router";
import { TextInput, View } from "react-native";
import { useApprovalVM } from "@/features/approvals/useApprovalsVM";
import { DraftTag } from "@/ui/domain";
import { Button, Card, Chip, Heading, Loading, Row, Screen, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { advisoryNote } from "@/lib/copy";
import { useAccess, VIEW_ONLY_NOTE } from "@/features/shell/useAccess";

export default function ApprovalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = useApprovalVM(id);
  const acc = useAccess();
  const mayDecide = acc.canUse("approvals");
  const t = useTheme();
  if (vm.state === "loading") return <Screen><Loading /></Screen>;
  if (vm.state === "error" || !vm.approval) return <Screen><Card tone="bad"><T bold>Approval could not be loaded</T></Card></Screen>;
  const a = vm.approval;
  return (
    <Screen testID="screen-approval">
      {vm.state === "expired" ? <Card tone="bad"><T bold>Expired</T><T>No decision within the time limit. The incident went back to diagnosis.</T></Card> : null}
      {vm.state === "escalated" ? <Card tone="warn"><T bold>Escalated</T><T>The timer ran out and this draft was escalated. You can see it but no longer decide it.</T></Card> : null}
      <DraftTag />
      <Heading>{a.title}</Heading>
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <View><T size="small" tone="muted">Tier</T><T bold testID="approval-tier">{vm.tierText}</T></View>
          <View><T size="small" tone="muted">Requested by</T><T bold>{a.requestedBy}</T></View>
          {a.rank ? <View><T size="small" tone="muted">Line impact</T><T bold>#{a.rank}</T></View> : null}
          <View><T size="small" tone="muted">Time left</T><T bold>{vm.timer}</T></View>
        </Row>
      </Card>
      <Heading level={3}>Why this tier</Heading>
      <T>{a.rationale}</T>
      <T size="small" tone="muted" mono>policy {a.policyVersion} · rules {a.ruleIds.join(", ")}</T>
      <Row><Heading level={3}>Evidence summary</Heading><Chip label="AI-generated" tone="ai" /></Row>
      {a.evidenceSummary.map((e, k) => <T key={k}>• {e}</T>)}
      <Row><Button label="Open incident" onPress={vm.openIncident} /></Row>
      {vm.state === "decided" ? (
        <Card tone={a.status === "approved" ? "ok" : "warn"} testID="decision-result">
          <T bold>{a.status === "approved" ? "Approved" : "Rejected"} by {a.decidedBy}</T>
          <T>Recorded in the audit log as {a.auditEventId}.{a.status === "approved" ? " The check is now on the technician's checklist." : ""}</T>
          {a.status === "approved" && acc.canView("field") ? <Button label="Open checklist" onPress={vm.openWorkOrder} testID="open-checklist" /> : null}
        </Card>
      ) : null}
      {vm.state === "pending" || vm.state === "cannotDecide" ? (
        <Card emphasis>
          <T size="small" tone="muted">Reason (required to reject, optional to approve)</T>
          <TextInput testID="decision-reason" value={vm.reason} onChangeText={vm.setReason} multiline editable={a.canDecide && mayDecide}
            placeholder="For example: strainer was cleaned yesterday, check the sensor first" placeholderTextColor={t.muted}
            style={{ minHeight: 60, borderWidth: 1, borderColor: t.line, borderRadius: 6, padding: 8, color: t.ink, fontSize: 15 }} />
          <Row>
            <Button label="Reject" onPress={vm.reject} disabled={!vm.canReject || !mayDecide} testID="reject" />
            <Button label="Approve draft" variant="primary" onPress={vm.approve} disabled={!vm.canSubmit || !mayDecide} testID="approve" />
          </Row>
          {!mayDecide ? <T size="small" tone="muted" testID="view-only">{VIEW_ONLY_NOTE} You can read approvals but not decide them.</T> : null}
          {a.cannotDecideReason ? <T size="small" tone="muted" >{a.cannotDecideReason}</T> : null}
          {vm.error ? <T size="small" tone="bad">{vm.error}</T> : null}
          <T size="small" tone="muted">Your decision, name and time are written to the audit log. {advisoryNote}</T>
        </Card>
      ) : null}
    </Screen>
  );
}
