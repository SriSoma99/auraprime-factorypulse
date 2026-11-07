// Domain components from the inventory (02 section 8): badges, banner, shell bar. Meaning never by colour alone.
import { Pressable, Text, View } from "react-native";
import type { FallbackLevel, Schemas } from "@fp/sdk-ts";
import { Chip, Row, T } from "./primitives";
import { useTheme } from "./theme";
import { font, radius, space } from "./tokens";

const IMPACT_SYMBOL = { high: "▲▲", medium: "▲", low: "△" } as const;
export function ImpactBadge({ impact, basic, unknown }: { impact: Schemas["ImpactLevel"] | null | undefined; basic?: boolean; unknown?: boolean }) {
  const t = useTheme();
  if (unknown) return <Badge text="impact unknown" dashed borderColor={t.warnLine} />;
  if (!impact) return null;
  return <Badge text={`${IMPACT_SYMBOL[impact]} ${impact}${basic ? " · basic" : ""}`} dashed={basic} borderColor={basic ? t.warnLine : "transparent"} />;
}

const TRUST_SYMBOL = { high: "●", medium: "◐", low: "○", not_scored: "–" } as const;
export function TrustBadge({ trust }: { trust: Schemas["TrustBadge"] | null | undefined }) {
  const t = useTheme();
  if (!trust) return null;
  const label = trust.level === "not_scored" ? "not scored" : trust.level.toUpperCase();
  const score = trust.score === null || trust.score === undefined ? "" : ` ${trust.score.toFixed(2)}`;
  return <Badge text={`${TRUST_SYMBOL[trust.level]} ${label}${score}`} borderColor={trust.level === "low" ? t.badLine : t.line} />;
}

export function Badge({ text, dashed, borderColor }: { text: string; dashed?: boolean; borderColor?: string }) {
  const t = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: borderColor ?? t.line, borderStyle: dashed ? "dashed" : "solid", borderRadius: radius.sm, paddingHorizontal: 6, alignSelf: "flex-start" }}>
      <Text style={{ fontFamily: font.mono, fontSize: 12, color: t.ink }}>{text}</Text>
    </View>
  );
}

export function DraftTag() { return <Badge text="DRAFT · NOT SENT TO EQUIPMENT" />; }

export function FallbackBanner({ level, banner }: { level: FallbackLevel; banner: { tone: "warn" | "bad"; text: string } | null }) {
  const t = useTheme();
  if (!banner) return null;
  const tone = banner.tone === "warn" ? { bg: t.warnBg, line: t.warnLine } : { bg: t.badBg, line: t.badLine };
  return (
    <View accessibilityRole="alert" testID="fallback-banner" style={{ backgroundColor: tone.bg, borderLeftWidth: 5, borderLeftColor: tone.line, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
      <Row><T bold mono>{level}</T><T>{banner.text}</T></Row>
    </View>
  );
}

export function ShellBar({ level, tenant, site, user, onSignOut }: { level: FallbackLevel; tenant?: string; site?: string; user?: string; onSignOut: () => void }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.line, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Row>
          <Chip label={level === "L0" ? "L0 Normal" : `${level} Degraded`} testID="level-chip" />
          <Chip label="SYNTHETIC DATA" dashed />
        </Row>
        {/* Shrinks and wraps on a phone so Sign out stays on screen and reachable. */}
        <Row style={{ flexShrink: 1, justifyContent: "flex-end" }}>
          {tenant ? <T size="small" tone="muted">{tenant} · {site}</T> : null}
          {user ? <T size="small">{user}</T> : null}
          <Pressable accessibilityRole="button" onPress={onSignOut} hitSlop={8} style={{ paddingVertical: 4 }}><T size="small" tone="accent">Sign out</T></Pressable>
        </Row>
      </Row>
    </View>
  );
}
