// W13 Learning Review Screen (02 section 6.1; LRN-1 to LRN-7, ADR-031).
import { View } from "react-native";
import { useAccess } from "@/features/shell/useAccess";
import { useLearningVM } from "@/features/learning/useLearningVM";
import { Badge } from "@/ui/domain";
import { Button, Card, Chip, Divider, Heading, Row, Screen, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";

export default function LearningScreen() {
  const acc = useAccess();
  const t = useTheme();
  const vm = useLearningVM();

  return (
    <Screen testID="w13-learning-review">
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Heading level={1}>W13 Learning Review &amp; Episodic Memory</Heading>
          <T tone="muted" size="small">
            Model-drafted lesson review, evaluation gate batches, and verified episodic case memory (LRN-1..7, ADR-031).
          </T>
        </View>
        <Chip label="LRN-1..7 · GATED LEARNING" tone="default" />
      </Row>

      {/* Model-drafted lessons approval queue */}
      <Card tone="default">
        <Row style={{ justifyContent: "space-between" }}>
          <Heading level={2}>Model-Drafted Lesson Proposals (Human Approval Gate, LRN-5)</Heading>
          {vm.pendingCount > 0 ? (
            <Chip label={`${vm.pendingCount} PENDING REVIEW`} tone="warn" />
          ) : (
            <Chip label="ALL DECIDED" tone="ok" />
          )}
        </Row>
        <T size="small" tone="muted">
          Lessons synthesized from verified cases remain quarantined until approved by a reliability engineer. Approved lessons enter retrieval as cited rules.
        </T>
        <Divider />

        {vm.lessons.map((lesson) => (
          <Card key={lesson.id} tone={lesson.status === "draft" ? "alt" : "default"}>
            <Row style={{ justifyContent: "space-between" }}>
              <Row>
                <Chip label="AI-GENERATED LESSON" tone="ai" />
                <T bold>{lesson.title}</T>
                <Chip
                  label={lesson.status.toUpperCase()}
                  tone={lesson.status === "approved" ? "ok" : lesson.status === "rejected" ? "bad" : "warn"}
                />
              </Row>
              <T size="small" tone="muted" mono>{lesson.id}</T>
            </Row>
            <T size="small">{lesson.summary}</T>
            <Row style={{ justifyContent: "space-between" }}>
              <T size="small" tone="muted">Source Incident: {lesson.sourceIncidentId} · Created {lesson.createdAt}</T>
              {lesson.status === "draft" ? (
                <Row>
                  <Button label="Reject" onPress={() => vm.rejectLesson(lesson.id)} disabled={!acc.canUse("learning")} />
                  <Button label="Approve Lesson" variant="primary" onPress={() => vm.approveLesson(lesson.id)} disabled={!acc.canUse("learning")} />
                </Row>
              ) : null}
            </Row>
          </Card>
        ))}
      </Card>

      {/* Learning batches with evaluation gate */}
      <Card tone="default">
        <Heading level={2}>Learning Batches &amp; Golden-Set Evaluation Gate (LRN-6, ADR-031)</Heading>
        <T size="small" tone="muted">
          Every batch must pass the automated benchmark evaluation suite without regression against the golden dataset (tolerance ±2%).
        </T>
        <Divider />

        {vm.batches.map((batch) => (
          <Row key={batch.id} style={{ justifyContent: "space-between", paddingVertical: space.sm }}>
            <View style={{ gap: 2 }}>
              <Row>
                <T bold mono>{batch.id}</T>
                <Chip
                  label={batch.status.toUpperCase()}
                  tone={batch.status === "active" ? "ok" : batch.status === "rejected" ? "bad" : "default"}
                />
              </Row>
              <T size="small" tone="muted">
                Golden-Set Accuracy: {batch.goldenSetScorePct}% (Delta: {batch.benchmarkDeltaPct >= 0 ? `+${batch.benchmarkDeltaPct}` : batch.benchmarkDeltaPct}%)
              </T>
            </View>
            <Badge
              text={batch.evaluationPassed ? "GATE PASSED" : "GATE REJECTED"}
              borderColor={batch.evaluationPassed ? t.okLine : t.badLine}
            />
          </Row>
        ))}
      </Card>

      {/* Episodic case memory */}
      <Card tone="default">
        <Heading level={2}>Episodic Case Memory (LRN-1..4, AC-H7)</Heading>
        <T size="small" tone="muted">
          Incidents verified by physical sensor drift reversal cycles become episodic precedents available for cosine similarity matching.
        </T>
        <Divider />

        {vm.cases.map((c) => (
          <Row key={c.id} style={{ justifyContent: "space-between", paddingVertical: space.sm }}>
            <View style={{ gap: 2 }}>
              <Row>
                <T bold>{c.title}</T>
                <Chip label={c.assetId} mono />
              </Row>
              <T size="small" tone="muted">
                Resolution: {c.resolution} · Verified after {c.driftReversalCycles} healthy cycles
              </T>
            </View>
            <Badge text="VERIFIED CASE" borderColor={t.okLine} />
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
