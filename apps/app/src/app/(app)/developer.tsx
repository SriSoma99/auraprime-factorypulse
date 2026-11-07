// W11 API & Governed MCP Console Screen (02 section 6.1; API-1 to API-6, MCP-1 to MCP-9).
import { View } from "react-native";
import { useDeveloperVM } from "@/features/developer/useDeveloperVM";
import { Badge } from "@/ui/domain";
import { Button, Card, Chip, Divider, Heading, Row, Screen, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";

export default function DeveloperScreen() {
  const t = useTheme();
  const vm = useDeveloperVM();

  return (
    <Screen testID="w11-developer-console">
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Heading level={1}>W11 API &amp; Governed MCP Console</Heading>
          <T tone="muted" size="small">
            Model Context Protocol tools, default-deny ToolGrant matrix, kill switches, and scoped API keys (MCP-1..9, API-1..6).
          </T>
        </View>
        <Chip label="MCP-1..9 · PLATFORM APIS" tone="default" />
      </Row>

      {/* Governed Industrial Tools Table */}
      <Card tone="default">
        <Row style={{ justifyContent: "space-between" }}>
          <Heading level={2}>Industrial MCP Tools Matrix (Default-Deny RBAC)</Heading>
          <Badge text="HARD BLOCK ON DIRECT ACTUATION" />
        </Row>
        <T size="small" tone="muted">
          All external LLM agents and clients can only invoke approved tools within granted scopes. Write tools are draft-only.
        </T>
        <Divider />

        {vm.tools.map((tool) => (
          <Row key={tool.name} style={{ justifyContent: "space-between", paddingVertical: space.sm }}>
            <View style={{ gap: 2, flex: 1 }}>
              <Row>
                <T bold mono>{tool.name}</T>
                <Chip label={tool.readOnly ? "READ ONLY" : "DRAFT ONLY"} tone={tool.readOnly ? "default" : "ai"} />
                {tool.killSwitchActive ? (
                  <Chip label="KILL SWITCH ENGAGED" tone="bad" />
                ) : (
                  <Chip label="ACTIVE" tone="ok" />
                )}
              </Row>
              <T size="small">{tool.description}</T>
              <T size="small" tone="muted">
                Allowed roles: {tool.rolesAllowed.join(", ")} · {tool.invocationsCount} calls logged
              </T>
            </View>
            <Button
              label={tool.killSwitchActive ? "Resume Tool" : "Emergency Kill"}
              variant={tool.killSwitchActive ? "primary" : "secondary"}
              onPress={() => vm.toggleKillSwitch(tool.name)}
            />
          </Row>
        ))}
      </Card>

      {/* API Keys & Rate Limits */}
      <Card tone="default">
        <Heading level={2}>Provisioned API Keys (SHA-256 Hashed, API-3)</Heading>
        <T size="small" tone="muted">
          Keys authenticate external microservices, edge collectors, and CMMS integrators. Secrets are displayed only upon generation.
        </T>
        <Divider />

        {vm.keys.map((k) => {
          const quotaPct = vm.deriveQuotaPercent(k.usedRequests, k.monthlyQuota);
          return (
            <Row key={k.id} style={{ justifyContent: "space-between", paddingVertical: space.sm }}>
              <View style={{ gap: 2 }}>
                <Row>
                  <T bold>{k.name}</T>
                  <Chip label={k.prefix} mono />
                  <Chip label={k.status.toUpperCase()} tone={k.status === "active" ? "ok" : "bad"} />
                </Row>
                <T size="small" tone="muted">
                  Scopes: {k.scopes.join(", ")} · Limit: {k.rateLimitPerMin} req/min
                </T>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Badge text={`${k.usedRequests} / ${k.monthlyQuota} (${quotaPct}%)`} />
                <T size="small" tone="muted">Quota usage</T>
              </View>
            </Row>
          );
        })}
      </Card>

      {/* Webhook logs */}
      <Card tone="default">
        <Heading level={2}>HMAC-SHA256 Signed Outbound Webhooks (API-6)</Heading>
        <Divider />
        {vm.webhooks.map((wh) => (
          <Row key={wh.id} style={{ justifyContent: "space-between", paddingVertical: space.xs }}>
            <View>
              <Row>
                <T bold mono>{wh.event}</T>
                <T size="small" tone="muted">{wh.url}</T>
              </Row>
            </View>
            <Row>
              <Badge text={`HTTP ${wh.lastStatus}`} borderColor={t.okLine} />
              <T size="small" tone="muted">{wh.lastDeliveryAt}</T>
            </Row>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
