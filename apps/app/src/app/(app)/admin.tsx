// W09 Admin: users and roles, and screen access per role (02 section 4.4; wireframe doc/wireframes/W09-admin.html; NFR-S6, ADR-040).
import { Pressable, View } from "react-native";
import { useAdminVM } from "@/features/admin/useAdminVM";
import { ACCESS_LABEL } from "@/features/admin/derive";
import { roleLabel } from "@/lib/format";
import { Button, Card, Chip, Heading, Loading, Row, Screen, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";

const ACCESS = ["none", "view", "use"] as const;

export default function Admin() {
  const vm = useAdminVM();
  const t = useTheme();
  if (vm.state === "loading") return <Screen><Loading /></Screen>;
  if (vm.state === "error") return <Screen testID="screen-admin"><Card tone="bad"><T>Users and permissions could not be loaded.</T></Card></Screen>;
  const pill = (selected: boolean, disabled: boolean) => ({ paddingHorizontal: 10, paddingVertical: 6, minHeight: 32, borderRadius: 6, borderWidth: 1.5, borderColor: selected ? t.accent : t.line, backgroundColor: selected ? t.accent : t.surface, opacity: disabled && !selected ? 0.45 : 1 });
  return (
    <Screen testID="screen-admin">
      <Heading>Admin · users and access</Heading>
      <T size="small" tone="muted">Changes apply on the user's next request and are written to the audit log. The API enforces the same rules. Approval rights follow the approval policy, not this screen.</T>
      {!vm.canEdit ? <Card tone="warn"><T>Your role can view these settings but not change them.</T></Card> : null}
      {vm.message ? <Card tone={vm.message.tone} testID="admin-message"><T>{vm.message.text}</T></Card> : null}

      <Card testID="admin-users">
        <Heading level={3}>Users and roles</Heading>
        {vm.users.map(u => (
          <View key={u.principalId} testID={`user-${u.principalId}`} style={{ borderTopWidth: 1, borderColor: t.line, paddingTop: 6, gap: 4 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <T bold>{u.displayName}</T>
              <T size="small" tone="muted">{u.sessionType.replace("_", " ")}</T>
            </Row>
            <Row>
              {vm.roles.map(r => {
                const disabled = !!u.lockReason || !vm.canEdit || vm.busy;
                return (
                  <Pressable key={r} accessibilityRole="radio" accessibilityState={{ selected: u.role === r, disabled }} disabled={disabled || u.role === r}
                    testID={`role-${u.principalId}-${r}`} onPress={() => vm.assignRole(u.principalId, r)} style={pill(u.role === r, disabled)}>
                    <T size="small" style={{ color: u.role === r ? t.onAccent : t.ink }}>{roleLabel(r)}</T>
                  </Pressable>
                );
              })}
            </Row>
            {u.lockReason ? <T size="small" tone="muted">{u.lockReason}</T> : null}
          </View>
        ))}
      </Card>

      <Card testID="admin-permissions">
        <Heading level={3}>Screen access by role</Heading>
        <Row>
          {vm.roles.map(r => (
            <Pressable key={r} accessibilityRole="button" accessibilityState={{ selected: vm.role === r }} testID={`perm-role-${r}`} onPress={() => vm.setRole(r)} style={pill(vm.role === r, false)}>
              <T size="small" bold={vm.role === r} style={{ color: vm.role === r ? t.onAccent : t.ink }}>{roleLabel(r)}</T>
            </Pressable>
          ))}
        </Row>
        {vm.rows.map(c => (
          <View key={c.screen} testID={`perm-${c.screen}`} style={{ borderTopWidth: 1, borderColor: t.line, paddingTop: 6, gap: 4 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flexShrink: 1 }}>
                <T bold>{c.title}</T>
                <T size="small" tone="muted">default {ACCESS_LABEL[c.defaultAccess].toLowerCase()}{c.editionHidden ? " · not in this edition" : ""}{c.locked ? " · locked so admins cannot be locked out" : ""}</T>
              </View>
              <Row>
                {c.overridden ? <Chip label="changed" tone="warn" testID={`perm-${c.screen}-changed`} /> : null}
                {ACCESS.map(a => {
                  const disabled = c.locked || !vm.canEdit || vm.busy;
                  return (
                    <Pressable key={a} accessibilityRole="radio" accessibilityState={{ selected: c.access === a, disabled }} disabled={disabled || c.access === a}
                      testID={`perm-${c.screen}-${a}`} onPress={() => vm.setScreenAccess(c.screen, a)} style={pill(c.access === a, disabled)}>
                      <T size="small" style={{ color: c.access === a ? t.onAccent : t.ink }}>{ACCESS_LABEL[a]}</T>
                    </Pressable>
                  );
                })}
                {c.overridden && vm.canEdit ? <Button label="Reset" onPress={() => vm.setScreenAccess(c.screen, "default")} disabled={vm.busy} testID={`perm-${c.screen}-reset`} /> : null}
              </Row>
            </Row>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
