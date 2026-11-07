// W12 Profile and Settings Screen (02 section 6.1; UI-6).
import { View } from "react-native";
import { useSettingsVM } from "@/features/settings/useSettingsVM";
import { Badge } from "@/ui/domain";
import { Button, Card, Chip, Divider, Heading, Row, Screen, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";

export default function SettingsScreen() {
  const t = useTheme();
  const vm = useSettingsVM();

  return (
    <Screen testID="w12-settings">
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Heading level={1}>W12 Profile &amp; Preferences</Heading>
          <T tone="muted" size="small">
            Display themes (light, dark, plant-floor high contrast), touch density, and tenant session.
          </T>
        </View>
        <Chip label="UI-6 · ACCESSIBILITY" tone="default" />
      </Row>

      {/* Theme selection per UI-6 */}
      <Card tone="default">
        <Heading level={2}>Display Mode &amp; Contrast (UI-6, 02 section 9.2)</Heading>
        <T size="small" tone="muted">
          Plant-floor mode optimizes readability for high-glare environments and distant displays.
        </T>
        <Divider />
        <Row gap={space.md}>
          <Button
            label="Light Mode"
            variant={vm.mode === "light" ? "primary" : "secondary"}
            onPress={() => vm.setMode("light")}
          />
          <Button
            label="Dark Mode"
            variant={vm.mode === "dark" ? "primary" : "secondary"}
            onPress={() => vm.setMode("dark")}
          />
          <Button
            label="Plant-Floor High-Contrast"
            variant={vm.mode === "highContrast" ? "primary" : "secondary"}
            onPress={() => vm.setMode("highContrast")}
          />
          <Button
            label="System Default"
            variant={vm.mode === "system" ? "primary" : "secondary"}
            onPress={() => vm.setMode("system")}
          />
        </Row>
      </Card>

      {/* Touch density */}
      <Card tone="default">
        <Heading level={2}>Touch Target Density (02 section 12)</Heading>
        <T size="small" tone="muted">
          Glove-friendly density enforces minimum 44×44px touch targets on mobile and plant terminals.
        </T>
        <Divider />
        <Row gap={space.md}>
          <Button
            label="Glove-Friendly (44px Minimum)"
            variant={vm.density === "glove" ? "primary" : "secondary"}
            onPress={() => vm.setDensity("glove")}
          />
          <Button
            label="Compact Standard"
            variant={vm.density === "standard" ? "primary" : "secondary"}
            onPress={() => vm.setDensity("standard")}
          />
        </Row>
      </Card>

      {/* Tenant and user session */}
      <Card tone="default">
        <Row style={{ justifyContent: "space-between" }}>
          <Heading level={2}>Current Tenant Session</Heading>
          <Button label="Sign Out" onPress={vm.signOut} />
        </Row>
        <Divider />
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <T bold>{vm.session?.displayName ?? "User"}</T>
            <T size="small" tone="muted">Role: {vm.session?.role} · Session: {vm.session?.sessionType}</T>
          </View>
          <Badge text={`${vm.session?.tenantName} (${vm.session?.siteName})`} />
        </Row>
        <Row>
          <Chip label={`EDITION: ${vm.session?.edition?.toUpperCase()}`} tone="default" />
          <Chip label="SYNTHETIC DEMO TENANT" dashed />
        </Row>
      </Card>
    </Screen>
  );
}
