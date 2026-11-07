import { Redirect, Tabs, usePathname } from "expo-router";
import { useWindowDimensions, View } from "react-native";
import { useSession } from "@/lib/session";
import { useStatusVM } from "@/features/shell/useStatusVM";
import { DevControls } from "@/features/dev/DevControls";
import { SCREEN_CATALOG, firstAllowedHref, navigation, pathAllowed } from "@/features/shell/access";
import { FallbackBanner, ShellBar } from "@/ui/domain";
import { Card, Loading, Screen, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";

export default function AppLayout() {
  const { ready, session, signOut } = useSession();
  const status = useStatusVM();
  const t = useTheme();
  const wide = useWindowDimensions().width >= 900;
  const pathname = usePathname();
  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/sign-in" />;
  // Role-based access (ADR-040): a path the role may not view goes to the first screen it may; the API refuses it too.
  const perms = session.permissions;
  if (!pathAllowed(perms, pathname)) {
    const home = firstAllowedHref(perms);
    if (home && home !== pathname) return <Redirect href={home as any} />;
    return <Screen testID="no-access"><Card tone="warn"><T>Your role has no screens assigned. Ask your tenant admin.</T></Card></Screen>;
  }
  const nav = navigation(perms, wide);
  const shown = new Set(nav.tabs.map(s => s.screen));
  const hrefFor = (screen: string) => { const s = SCREEN_CATALOG.find(x => x.screen === screen)!; return shown.has(s.screen) ? (s.href as any) : null; };
  // Every visible tab sets href: tabs with and without it render different link layouts on web.
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ShellBar level={status.level} tenant={session.tenantName} site={session.siteName} user={session.displayName} onSignOut={() => void signOut()} />
      <FallbackBanner level={status.level} banner={status.banner} />
      <DevControls />
      <Tabs screenOptions={{ headerShown: false, tabBarPosition: wide ? "left" : "bottom", tabBarActiveTintColor: t.onAccent, tabBarInactiveTintColor: t.navMuted, tabBarActiveBackgroundColor: t.accent,
        tabBarStyle: { backgroundColor: t.nav, borderColor: t.nav, ...(wide ? { width: 190 } : {}) }, tabBarLabelStyle: { fontSize: wide ? 13 : 11, ...(wide ? {} : { marginLeft: 0, marginHorizontal: 0 }) }, tabBarIcon: () => null, tabBarIconStyle: { display: "none" }, tabBarItemStyle: { justifyContent: "center", ...(wide ? {} : { paddingHorizontal: 0 }) }, tabBarVariant: wide ? "material" : "uikit" }}>
        {/* Tabs follow the role's permissions; phone width keeps the main screens plus More (02 sections 4.2 and 4.4). */}
        <Tabs.Screen name="index" options={{ title: "Plant", href: hrefFor("plant") }} />
        <Tabs.Screen name="line" options={{ title: "Line", href: hrefFor("line") }} />
        <Tabs.Screen name="alerts" options={{ title: "Alerts", href: hrefFor("alerts") }} />
        <Tabs.Screen name="approvals/index" options={{ title: "Approvals", href: hrefFor("approvals") }} />
        <Tabs.Screen name="trust" options={{ title: "Trust", href: hrefFor("trust") }} />
        <Tabs.Screen name="control-tower" options={{ title: "Control Tower", href: hrefFor("control_tower") }} />
        <Tabs.Screen name="knowledge" options={{ title: "Knowledge", href: hrefFor("knowledge") }} />
        <Tabs.Screen name="compliance" options={{ title: "Compliance", href: hrefFor("compliance") }} />
        <Tabs.Screen name="developer" options={{ title: "Developer", href: hrefFor("developer") }} />
        <Tabs.Screen name="learning" options={{ title: "Learning", href: hrefFor("learning") }} />
        <Tabs.Screen name="field" options={{ title: "Field", href: hrefFor("field") }} />
        <Tabs.Screen name="admin" options={{ title: "Admin", href: hrefFor("admin") }} />
        <Tabs.Screen name="settings" options={{ title: "Settings", href: hrefFor("settings") }} />
        <Tabs.Screen name="more" options={{ title: "More", href: nav.more.length ? ("/more" as any) : null }} />
        <Tabs.Screen name="approvals/[id]" options={{ href: null }} />
        <Tabs.Screen name="incidents/[id]" options={{ href: null }} />
        <Tabs.Screen name="work-orders/[id]" options={{ href: null }} />
      </Tabs>
    </View>
  );
}
