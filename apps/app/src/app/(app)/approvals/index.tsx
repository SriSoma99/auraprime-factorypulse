// W04 Approvals list / M03 entry (02 section 6.1; wireframe doc/wireframes/W04-approvals.html).
import { Pressable } from "react-native";
import { useApprovalListVM } from "@/features/approvals/useApprovalsVM";
import { Badge } from "@/ui/domain";
import { Card, Heading, Loading, Row, Screen, T } from "@/ui/primitives";

export default function Approvals() {
  const vm = useApprovalListVM();
  return (
    <Screen testID="screen-approvals">
      <Heading>Approvals</Heading>
      <T size="small" tone="muted">Sorted by expiry. Each draft needs its own decision; bulk approval is not offered.</T>
      {vm.state === "loading" ? <Loading /> : null}
      {vm.state === "empty" ? <Card><T bold>Nothing waiting for your decision</T><T tone="muted">Drafts appear here when the policy engine assigns them a tier.</T></Card> : null}
      {vm.items.map(a => (
        <Pressable key={a.id} accessibilityRole="button" testID={`approval-${a.id}`} onPress={() => vm.open(a.id)}>
          <Card>
            <T bold>{a.title}</T>
            <Row>
              <T size="small" tone="muted">Tier {a.tier}</T>
              <T size="small" tone="muted">{a.incidentId}</T>
              <Badge text={a.timer} />
              {!a.canDecide ? <T size="small" tone="muted">view only</T> : null}
            </Row>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
