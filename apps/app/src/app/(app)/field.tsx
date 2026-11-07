// M05-M07 Mobile Field Companion Screen (02 section 6.2; UI-5).
import { TextInput, View } from "react-native";
import { useAccess } from "@/features/shell/useAccess";
import { useFieldVM } from "@/features/field/useFieldVM";
import { Badge } from "@/ui/domain";
import { Button, Card, Chip, Divider, Heading, Row, Screen, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { radius, space } from "@/ui/tokens";

export default function FieldCompanionScreen() {
  const acc = useAccess();
  const t = useTheme();
  const vm = useFieldVM();

  return (
    <Screen testID="m05-field-companion">
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Heading level={1}>Field Tools: Scan, Reading &amp; Sync</Heading>
          <T tone="muted" size="small">
            Plant floor mobile companion (M05 QR scan, M06 sensor reading capture, M07 offline queue).
          </T>
        </View>
        <Chip label="M05..M07 · PLANT FLOOR" tone="default" />
      </Row>

      {/* Mode navigation */}
      <Row gap={space.sm}>
        <Button
          label="M05 Asset Scan"
          variant={vm.activeTab === "scan" ? "primary" : "secondary"}
          onPress={() => vm.setActiveTab("scan")}
        />
        <Button
          label="M06 Capture Reading"
          variant={vm.activeTab === "reading" ? "primary" : "secondary"}
          onPress={() => vm.setActiveTab("reading")}
        />
        <Button
          label={`M07 Sync Queue (${vm.pendingCount})`}
          variant={vm.activeTab === "queue" ? "primary" : "secondary"}
          onPress={() => vm.setActiveTab("queue")}
        />
      </Row>

      {vm.activeTab === "scan" && (
        <Card tone="default">
          <Heading level={2}>M05 QR Asset Confirmation (UI-5)</Heading>
          <T size="small" tone="muted">
            Technician scans equipment QR/NFC code to ensure maintenance actions target the correct physical machine.
          </T>
          <Divider />
          <View style={{ backgroundColor: t.surfaceAlt, borderRadius: radius.md, padding: space.lg, alignItems: "center", gap: space.sm }}>
            <Badge text="QR CODE DETECTED: [AST-WELD-TRANSFORMER-04]" borderColor={t.okLine} />
            <T size="title" bold>{vm.scannedAsset.name}</T>
            <T tone="muted">{vm.scannedAsset.line} · {vm.scannedAsset.station}</T>
            <Row>
              <Chip label="MATCH CONFIRMED" tone="ok" />
              <Chip label="OPEN DRAFT WORK ORDER" tone="ai" />
            </Row>
          </View>
          <Button
            label="Log Manual Verification Reading"
            variant="primary"
            onPress={() => vm.setActiveTab("reading")}
          />
        </Card>
      )}

      {vm.activeTab === "reading" && (
        <Card tone="default">
          <Heading level={2}>M06 Record Discrimination Reading (AC-H5, LRN-1)</Heading>
          <T size="small" tone="muted">
            Log portable flow or temperature readings to separate physical restriction from sensor drift.
          </T>
          <Divider />
          <View style={{ gap: space.xs }}>
            <T bold size="small">Portable Ultrasonic Flow Reading (L/min):</T>
            <View style={{ backgroundColor: t.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: vm.readingError ? t.badLine : t.line }}>
              <TextInput
                placeholder="e.g. 4.5"
                placeholderTextColor={t.muted}
                value={vm.readingInput}
                onChangeText={vm.setReadingInput}
                keyboardType="decimal-pad"
                style={{ color: t.ink, fontSize: 16 }}
              />
            </View>
            {vm.readingError ? <T size="small" tone="bad">{vm.readingError}</T> : null}
          </View>

          <Button label="Save Reading to Offline Queue" variant="primary" onPress={vm.submitReading} disabled={!acc.canUse("field")} />
        </Card>
      )}

      {vm.activeTab === "queue" && (
        <Card tone="default">
          <Row style={{ justifyContent: "space-between" }}>
            <Heading level={2}>M07 Offline Queue &amp; Sync Status (UI-5)</Heading>
            <Button label="Sync Now" variant="primary" onPress={vm.syncQueue} disabled={!acc.canUse("field")} />
          </Row>
          <T size="small" tone="muted">
            All technician actions are persisted locally on the device and synchronized with the PostgreSQL backend when connectivity resumes.
          </T>
          <Divider />

          {vm.queue.map((item) => (
            <Row key={item.id} style={{ justifyContent: "space-between", paddingVertical: space.sm }}>
              <View style={{ gap: 2 }}>
                <Row>
                  <T bold>{item.data}</T>
                  <Chip
                    label={item.syncStatus.toUpperCase()}
                    tone={item.syncStatus === "synced" ? "ok" : "warn"}
                  />
                </Row>
                <T size="small" tone="muted">{item.assetId} · {item.timestamp}</T>
              </View>
              <Badge text={item.type.toUpperCase()} />
            </Row>
          ))}
        </Card>
      )}
    </Screen>
  );
}
