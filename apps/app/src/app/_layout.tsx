import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/api";
import { SessionProvider } from "@/lib/session";
import { ThemeProvider } from "@/ui/theme";

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SessionProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
