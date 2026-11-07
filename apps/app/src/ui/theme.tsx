import { createContext, useContext, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { dark, highContrast, light, type Palette } from "./tokens";

export type ThemeMode = "light" | "dark" | "highContrast" | "system";

interface ThemeContextValue {
  palette: Palette;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  palette: light,
  mode: "system",
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");

  const effectivePalette =
    mode === "highContrast"
      ? highContrast
      : mode === "dark"
      ? dark
      : mode === "light"
      ? light
      : scheme === "dark"
      ? dark
      : light;

  return (
    <ThemeContext.Provider value={{ palette: effectivePalette, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext).palette;
export const useThemeControl = () => useContext(ThemeContext);
