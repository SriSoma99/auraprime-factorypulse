// W06 Control Tower (02 section 6.1; OBS-1 to OBS-11).
import { View } from "react-native";
import { useControlTowerVM } from "@/features/control-tower/useControlTowerVM";
import { Badge } from "@/ui/domain";
import { Card, Chip, Divider, Heading, Loading, Row, Screen, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";

export default function ControlTowerScreen() {
  const t = useTheme();
  const vm = useControlTowerVM();

  if (vm.state === "loading") return <Screen><Loading label="Loading Control Tower metrics..." /></Screen>;

  const { data, budgetPct } = vm;

  return (
    <Screen testID="w06-control-tower">
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Heading level={1}>W06 Control Tower</Heading>
          <T tone="muted" size="small">
            Platform observability, telemetry pipelines, RAG retrieval quality, budget guardrails, and MCP tool governance.
          </T>
        </View>
        <Chip label="OBS-1..11 · SYSTEM OPS" tone="default" />
      </Row>

      {/* KPI row */}
      <Row gap={space.md}>
        <Card style={{ flex: 1, minWidth: 200 }} tone={data.level === "L0" ? "ok" : "warn"}>
          <T size="small" tone="muted" bold>DEGRADATION LEVEL</T>
          <T size="h1" bold mono>{data.level}</T>
          <T size="small" tone="muted">{data.level === "L0" ? "All AI & causal services normal" : "Operating under fallback rules"}</T>
        </Card>

        <Card style={{ flex: 1, minWidth: 200 }} tone="default">
          <T size="small" tone="muted" bold>PIPELINE THROUGHPUT</T>
          <T size="h1" bold mono>{data.pipelineLagMs} ms</T>
          <T size="small" tone="muted">{data.ingestRatePerSec} msg/sec sustained ingest</T>
        </Card>

        <Card style={{ flex: 1, minWidth: 200 }} tone="default">
          <T size="small" tone="muted" bold>RAG CITATIONS</T>
          <T size="h1" bold mono>{data.ragCitationCoveragePct}%</T>
          <T size="small" tone="muted">p95 latency {data.ragLatencyP95Ms} ms · 0 unverified</T>
        </Card>

        <Card style={{ flex: 1, minWidth: 200 }} tone={budgetPct >= 80 ? "bad" : "default"}>
          <T size="small" tone="muted" bold>BUDGET HEADROOM</T>
          <T size="h1" bold mono>${data.budgetBurnUsd.toFixed(2)}</T>
          <T size="small" tone="muted">{budgetPct}% of ${data.budgetCapUsd.toFixed(2)} cap (NFR-C1)</T>
        </Card>
      </Row>

      {/* Governed Tools & Security hard-blocks */}
      <Card tone="default">
        <Row style={{ justifyContent: "space-between" }}>
          <Heading level={2}>Industrial MCP Tool Governance (MCP-1..9)</Heading>
          <Badge text="INVARIANT 1: ZERO WRITE-TO-CONTROL" />
        </Row>
        <T tone="muted" size="small">
          All external LLM and agent tool calls execute through a default-deny, auditable policy gateway. Actuation is hard-blocked by software policy.
        </T>
        <Divider />
        <Row gap={space.lg}>
          <View>
            <T tone="muted" size="small">Total Governed Calls</T>
            <T size="title" bold mono>{data.mcpCallsCount}</T>
          </View>
          <View>
            <T tone="muted" size="small">RBAC Tool Denials</T>
            <T size="title" bold mono tone={data.mcpDenialsCount > 0 ? "warn" : "default"}>{data.mcpDenialsCount}</T>
          </View>
          <View>
            <T tone="muted" size="small">Hard-Blocked Actuations</T>
            <T size="title" bold mono tone="bad">{data.mcpActuationBlocksCount}</T>
          </View>
        </Row>
      </Card>

      {/* Fallback level transitions */}
      <Card tone="default">
        <Heading level={2}>Degradation Ladder History (ADR-009)</Heading>
        <Divider />
        {data.fallbackHistory.map((h, i) => (
          <Row key={i} style={{ justifyContent: "space-between", paddingVertical: space.xs }}>
            <Row>
              <Chip label={h.level} tone={h.level === "L0" ? "ok" : "warn"} mono />
              <T size="body">{h.reason}</T>
            </Row>
            <T tone="muted" size="small" mono>{h.timestamp}</T>
          </Row>
        ))}
      </Card>

      {/* Recent distributed traces */}
      <Card tone="default">
        <Heading level={2}>Distributed Trace Explorer (OBS-4, AC-H8)</Heading>
        <T tone="muted" size="small">
          End-to-end W3C trace context (traceparent) propagated from Mosquitto edge, Kafka KRaft, PostgreSQL, to LLM inference.
        </T>
        <Divider />
        {data.recentTraces.map((tr) => (
          <Row key={tr.traceId} style={{ justifyContent: "space-between", paddingVertical: space.sm }}>
            <View style={{ gap: 2 }}>
              <T bold>{tr.scenario}</T>
              <T tone="muted" size="small" mono>{tr.traceId}</T>
            </View>
            <Row>
              <Badge text={`${tr.latencyMs} ms`} />
              <Chip label={tr.status.toUpperCase()} tone={tr.status === "ok" ? "ok" : "bad"} />
            </Row>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
