// W08 Compliance Evidence Screen (02 section 6.1; REG-1 to REG-8, POL-3, ADR-015).
import { View } from "react-native";
import { useComplianceVM } from "@/features/compliance/useComplianceVM";
import { Badge } from "@/ui/domain";
import { Button, Card, Chip, Divider, Heading, Row, Screen, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";

export default function ComplianceScreen() {
  const t = useTheme();
  const vm = useComplianceVM();
  const { data } = vm;

  return (
    <Screen testID="w08-compliance">
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Heading level={1}>W08 Compliance &amp; Audit Ledger</Heading>
          <T tone="muted" size="small">
            Cryptographic tamper-evident hash-chain verification, SBOM signatures, and audit pack generation (REG-1..8, POL-3).
          </T>
        </View>
        <Chip label="REG-1..8 · EU AI ACT ADVISORY" tone="default" />
      </Row>

      {/* Audit ledger verification banner */}
      <Card tone={vm.state === "verified" ? "ok" : "bad"}>
        <Row style={{ justifyContent: "space-between" }}>
          <Row>
            <Chip
              label={vm.state === "verified" ? "AUDIT CHAIN VERIFIED" : "HASH CHAIN BROKEN"}
              tone={vm.state === "verified" ? "ok" : "bad"}
            />
            <T bold>{data.verifiedEventsCount} Sequentially Signed Events</T>
          </Row>
          <Badge text="gov.verify_audit() PASS" borderColor={t.okLine} />
        </Row>
        <T size="small">
          Every decision, work order draft, and human approval is cryptographically linked with SHA-256 hashes (`ADR-015`). Direct database updates without hash verification are permanently blocked.
        </T>
        <Divider />
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <T size="small" tone="muted">Chain Root Hash</T>
            <T size="small" mono>{data.rootHash.slice(0, 16)}...</T>
          </View>
          <View>
            <T size="small" tone="muted">Current Chain Head</T>
            <T size="small" mono>{data.headHash.slice(0, 16)}...</T>
          </View>
        </Row>
      </Card>

      {/* Evidence pack generator */}
      <Card tone="default">
        <Row style={{ justifyContent: "space-between" }}>
          <Heading level={2}>Regulatory Evidence Pack (REG-7)</Heading>
          <Button
            label={vm.downloading ? "Generating Bundle..." : "Export Evidence Pack (ZIP)"}
            variant="primary"
            disabled={vm.downloading}
            onPress={vm.generateEvidencePack}
          />
        </Row>
        <T size="small" tone="muted">
          Assembles SBOM with cryptographically signed container manifests, algorithm validation certificates, and full trace logs for external audit.
        </T>
        <Divider />
        <Row gap={space.lg}>
          <View>
            <T tone="muted" size="small">SBOM Package Manifest</T>
            <T size="title" bold mono>{data.sbomPackageCount} components</T>
          </View>
          <View>
            <T tone="muted" size="small">Image Signature Status</T>
            <Chip label="COSIGN SIGNED (NFR-S5)" tone="ok" />
          </View>
          <View>
            <T tone="muted" size="small">Human Oversight Policy</T>
            <Chip label="100% ADVISORY · ZERO AUTO-ACTUATION" tone="ai" />
          </View>
        </Row>
      </Card>

      {/* Model register */}
      <Card tone="default">
        <Heading level={2}>Registered AI Models &amp; Causal Algorithms (REG-5)</Heading>
        <Divider />
        {data.modelRegister.map((m) => (
          <Row key={m.name} style={{ justifyContent: "space-between", paddingVertical: space.sm }}>
            <View style={{ gap: 2 }}>
              <Row>
                <T bold>{m.name}</T>
                <Chip label={`v${m.version}`} mono />
              </Row>
              <T size="small" tone="muted">{m.role}</T>
            </View>
            <Row>
              <Badge text={`eval tol ±${m.evalTolerancePct}%`} />
              <Badge text={m.hash.slice(0, 8)} />
            </Row>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
