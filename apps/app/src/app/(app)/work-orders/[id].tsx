// M04 Work checklist (02 section 6.2; wireframe doc/wireframes/M04-work-checklist.html).
import { useLocalSearchParams } from "expo-router";
import { useAccess } from "@/features/shell/useAccess";
import { Pressable, TextInput, View } from "react-native";
import { useWorkOrderVM, readingNote } from "@/features/work-order/useWorkOrderVM";
import { DraftTag } from "@/ui/domain";
import { Button, Card, Heading, Loading, Row, Screen, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { advisoryNote } from "@/lib/copy";

export default function WorkOrder() {
  const acc = useAccess();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vm = useWorkOrderVM(id);
  const t = useTheme();
  if (vm.state === "loading") return <Screen><Loading /></Screen>;
  if (vm.state === "error" || !vm.workOrder) return <Screen><Card tone="bad"><T bold>Work order could not be loaded</T></Card></Screen>;
  const wo = vm.workOrder; const cur = vm.current;
  return (
    <Screen testID="screen-work-order">
      <DraftTag />
      <Heading>{wo.title}</Heading>
      <T size="small" tone="muted">{wo.id} · {wo.incidentId}{wo.approvedBy ? ` · approved by ${wo.approvedBy}` : ""}</T>
      {vm.state === "notApproved" ? <Card tone="warn"><T bold>Waiting for approval</T><T>Steps can be recorded once a person approves this draft.</T></Card> : null}
      <View style={{ height: 8, borderWidth: 1, borderColor: t.line, borderRadius: 4, backgroundColor: t.surfaceAlt, overflow: "hidden" }}><View style={{ width: `${vm.progress * 100}%`, height: "100%", backgroundColor: t.ink }} /></View>
      <T size="small" testID="progress-text">{vm.progressText}</T>
      {vm.steps.map(s => (
        <Card key={s.no} emphasis={cur?.no === s.no}>
          <Row wrap={false} align="flex-start">
            <T mono bold>{s.done ? "✓" : String(s.no)}</T>
            <View style={{ flex: 1, gap: 2 }}>
              <T bold>{s.title}</T>
              <T size="small" tone="muted">{s.done && s.reading?.value !== null && s.reading?.value !== undefined ? `${s.reading.value} ${s.reading.unit} · ${readingNote(s, s.reading.value)}` : s.done && s.choice ? s.choice : s.detail}</T>
            </View>
          </Row>
        </Card>
      ))}
      {cur && vm.state === "inProgress" ? (
        <Card emphasis testID="current-step">
          <Heading level={2}>Step {cur.no} of {vm.steps.length} · {cur.title}</Heading>
          {cur.kind === "safety" || cur.citation ? (
            <Card tone="warn">
              {cur.kind === "safety" ? <T bold>⚠ Safety · from the approved procedure</T> : null}
              {cur.kind === "safety" ? <T>{cur.detail}</T> : null}
              {cur.citation ? <T size="small" tone="accent">{cur.citation.title} {cur.citation.version}, {cur.citation.section} · effective {cur.citation.effectiveFrom}</T> : null}
            </Card>
          ) : <T>{cur.detail}</T>}
          {cur.kind === "safety" ? <T size="small" tone="muted">{advisoryNote}</T> : null}
          {cur.reading ? (
            <View style={{ gap: 6 }}>
              <Row>
                <TextInput testID="reading-input" inputMode="decimal" keyboardType="decimal-pad" value={vm.input(cur.no)} onChangeText={v => vm.setInput(cur.no, v)}
                  style={{ fontSize: 22, width: 140, padding: 8, borderWidth: 1.5, borderColor: t.ink, borderRadius: 8, color: t.ink }} accessibilityLabel={`Reading in ${cur.reading.unit}`} />
                <T size={16}>{cur.reading.unit}</T>
              </Row>
              <T size="small" tone="muted">Reference {cur.reading.referenceRange.min}–{cur.reading.referenceRange.max} {cur.reading.unit}.</T>
              {vm.input(cur.no) !== "" && vm.problem ? <T size="small" tone="warn" testID="reading-problem">{vm.problem}</T> : null}
            </View>
          ) : null}
          {cur.choices ? (
            <View style={{ gap: 8 }}>
              {cur.choices.map(c => (
                <Pressable key={c} accessibilityRole="radio" accessibilityState={{ selected: vm.choice(cur.no) === c }} onPress={() => vm.setChoice(cur.no, c)} disabled={!acc.canUse("field")} testID={`choice-${c}`}>
                  <Card emphasis={vm.choice(cur.no) === c} style={{ minHeight: 48, justifyContent: "center" }}><T bold={vm.choice(cur.no) === c}>{vm.choice(cur.no) === c ? "◉" : "○"} {c}</T></Card>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Button label={cur.kind === "safety" ? "I have read this" : "Save step"} variant="primary" onPress={vm.saveCurrent} disabled={vm.busy || (!!cur.reading && !!vm.problem) || !acc.canUse("field")} testID="save-step" />
          {vm.error ? <T size="small" tone="bad">{vm.error}</T> : null}
        </Card>
      ) : null}
      {vm.state === "submitted" ? <Card tone="ok" testID="outcome-submitted"><T bold>Outcome submitted</T><T>Finding and reading are attached to {wo.incidentId}. The incident closes only after the drift reverses for the required good cycles.</T></Card> : null}
    </Screen>
  );
}
