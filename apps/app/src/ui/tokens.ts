// Design tokens for the Expo app (02 section 9; UI-2; ADR-034). Semantic names match 02 section 9.1.
export interface Palette {
  bg: string; surface: string; surfaceAlt: string; ink: string; muted: string; line: string; accent: string; onAccent: string;
  warnBg: string; warnLine: string; badBg: string; badLine: string; okBg: string; okLine: string; note: string;
  /** Navigation pane: its own surface so it stands apart from the content canvas. */
  nav: string; navInk: string; navMuted: string;
}
export const light: Palette = {
  bg: "#e4e8ed", surface: "#ffffff", surfaceAlt: "#e6e9ec", ink: "#1d2329", muted: "#5d6670", line: "#c7cdd3", accent: "#2f5d8a", onAccent: "#ffffff",
  warnBg: "#fff3d6", warnLine: "#a8790f", badBg: "#fde4e1", badLine: "#b23b2e", okBg: "#e0f2e4", okLine: "#2f7d45", note: "#6b4fa3",
  nav: "#1f2a37", navInk: "#f1f4f7", navMuted: "#b4bfcb",
};
export const dark: Palette = {
  bg: "#13171b", surface: "#1b2026", surfaceAlt: "#252c33", ink: "#e4e8ec", muted: "#9aa4ae", line: "#36404a", accent: "#7fb0e0", onAccent: "#13171b",
  warnBg: "#3a2f12", warnLine: "#e0b245", badBg: "#3d1f1b", badLine: "#ec7a6c", okBg: "#183323", okLine: "#6cc487", note: "#b39ae6",
  nav: "#0c1014", navInk: "#e4e8ec", navMuted: "#9aa4ae",
};
/** High-contrast plant-floor mode (UI-6, 02 section 9.2): high glare tolerance, sharp contrast. */
export const highContrast: Palette = {
  bg: "#050607", surface: "#111417", surfaceAlt: "#1c2126", ink: "#ffffff", muted: "#c8d0d8", line: "#4e5a66", accent: "#ffd600", onAccent: "#000000",
  warnBg: "#2d2400", warnLine: "#ffe600", badBg: "#3d0a05", badLine: "#ff5240", okBg: "#052e12", okLine: "#00e659", note: "#e0b0ff",
  nav: "#000000", navInk: "#ffffff", navMuted: "#c8d0d8",
};
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 4, md: 8, lg: 12, pill: 999 } as const;
export const font = { small: 12.5, body: 15, title: 18, h1: 22, mono: "monospace" } as const;
/** Minimum touch target for glove use (02 section 12). */
export const touchTarget = 44;
