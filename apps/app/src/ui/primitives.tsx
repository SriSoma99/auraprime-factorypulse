// Shared UI primitives (component inventory, 02 section 8). Presentational only (ADR-028).
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useTheme } from "./theme";
import { font, radius, space, touchTarget } from "./tokens";

export function Screen({ children, scroll = true, testID }: { children: ReactNode; scroll?: boolean; testID?: string }) {
  const t = useTheme();
  const inner = <View style={{ padding: space.lg, gap: space.md, maxWidth: 1200, width: "100%", alignSelf: "center" }}>{children}</View>;
  return scroll
    ? <ScrollView testID={testID} style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: space.xl }}>{inner}</ScrollView>
    : <View testID={testID} style={{ flex: 1, backgroundColor: t.bg }}>{inner}</View>;
}

type Tone = "default" | "muted" | "accent" | "bad" | "warn" | "ok";
export function T({ children, size = "body", tone = "default", bold, mono, style, numberOfLines, testID }: { children: ReactNode; size?: keyof typeof font | number; tone?: Tone; bold?: boolean; mono?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number; testID?: string }) {
  const t = useTheme();
  const color = { default: t.ink, muted: t.muted, accent: t.accent, bad: t.badLine, warn: t.warnLine, ok: t.okLine }[tone];
  const fontSize = typeof size === "number" ? size : (font[size] as number);
  return <Text testID={testID} numberOfLines={numberOfLines} style={[{ color, fontSize, fontWeight: bold ? "600" : "400", fontFamily: mono ? font.mono : undefined }, style]}>{children}</Text>;
}

export function Heading({ children, level = 1 }: { children: ReactNode; level?: 1 | 2 | 3 }) {
  if (level === 3) return <T size="small" tone="muted" bold style={{ letterSpacing: 0.8, textTransform: "uppercase" }}>{children}</T>;
  return <T size={level === 1 ? "h1" : "title"} bold>{children}</T>;
}

export function Card({ children, tone = "default", emphasis, dashed, style, testID }: { children: ReactNode; tone?: "default" | "warn" | "bad" | "ok" | "alt"; emphasis?: boolean; dashed?: boolean; style?: StyleProp<ViewStyle>; testID?: string }) {
  const t = useTheme();
  const map = { default: [t.surface, t.line], alt: [t.surfaceAlt, t.line], warn: [t.warnBg, t.warnLine], bad: [t.badBg, t.badLine], ok: [t.okBg, t.okLine] } as const;
  const [bg, border] = map[tone];
  return <View testID={testID} style={[{ backgroundColor: bg, borderColor: emphasis ? t.ink : border, borderWidth: emphasis ? 2 : 1, borderStyle: dashed ? "dashed" : "solid", borderRadius: radius.md, padding: space.md, gap: space.sm }, style]}>{children}</View>;
}

export function Row({ children, gap = space.sm, wrap = true, align = "center", style }: { children: ReactNode; gap?: number; wrap?: boolean; align?: ViewStyle["alignItems"]; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", flexWrap: wrap ? "wrap" : "nowrap", alignItems: align, gap }, style]}>{children}</View>;
}

export function Chip({ label, tone = "default", dashed, mono, testID }: { label: string; tone?: "default" | "ai" | "warn" | "bad" | "ok"; dashed?: boolean; mono?: boolean; testID?: string }) {
  const t = useTheme();
  const border = { default: t.line, ai: t.accent, warn: t.warnLine, bad: t.badLine, ok: t.okLine }[tone];
  const color = tone === "ai" ? t.accent : t.ink;
  return (
    <View testID={testID} style={{ borderWidth: 1, borderColor: border, borderStyle: dashed ? "dashed" : "solid", borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2, backgroundColor: tone === "ai" ? "transparent" : t.surfaceAlt, alignSelf: "flex-start" }}>
      <Text style={{ color, fontSize: 12, fontWeight: tone === "ai" || dashed ? "600" : "400", fontFamily: mono ? font.mono : undefined }}>{label}</Text>
    </View>
  );
}

export function Button({ label, onPress, variant = "secondary", disabled, testID, accessibilityHint }: { label: string; onPress: () => void; variant?: "primary" | "secondary"; disabled?: boolean; testID?: string; accessibilityHint?: string }) {
  const t = useTheme();
  const primary = variant === "primary";
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} accessibilityHint={accessibilityHint} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.btn, { minHeight: touchTarget, backgroundColor: primary ? t.accent : t.surface, borderColor: primary ? t.accent : t.ink, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }]}>
      <Text style={{ color: primary ? t.onAccent : t.ink, fontSize: 15, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return <View accessibilityLabel={label} style={{ padding: space.xl, alignItems: "center" }}><ActivityIndicator /></View>;
}

export function Divider() { const t = useTheme(); return <View style={{ height: 1, backgroundColor: t.line }} />; }

const styles = StyleSheet.create({ btn: { borderWidth: 1.5, borderRadius: radius.sm + 2, paddingHorizontal: 14, paddingVertical: 8, alignItems: "center", justifyContent: "center" } });
