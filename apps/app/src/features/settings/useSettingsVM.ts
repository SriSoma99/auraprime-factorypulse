// ViewModel for W12 Settings & Profile (ADR-028; UI-6).
import { useState } from "react";
import { useSession } from "@/lib/session";
import { useThemeControl, type ThemeMode } from "@/ui/theme";

export function useSettingsVM() {
  const { session, signOut } = useSession();
  const theme = useThemeControl();
  const [density, setDensity] = useState<"standard" | "glove">("glove");

  return {
    session,
    mode: theme.mode,
    setMode: theme.setMode,
    density,
    setDensity,
    signOut,
  };
}
