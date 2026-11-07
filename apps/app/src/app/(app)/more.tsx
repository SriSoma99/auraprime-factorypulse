// More: the permitted screens that do not fit the phone tab bar (02 section 4.2; ADR-040).
import { Pressable } from "react-native";
import { router } from "expo-router";
import { useSession } from "@/lib/session";
import { navigation } from "@/features/shell/access";
import { Card, Heading, Screen, T } from "@/ui/primitives";

export default function More() {
  const { session } = useSession();
  return (
    <Screen testID="screen-more">
      <Heading>More</Heading>
      {navigation(session?.permissions, false).more.map(l => (
        <Pressable key={l.href} accessibilityRole="link" testID={`more-${l.href.slice(1)}`} onPress={() => router.push(l.href as any)}>
          <Card><T bold>{l.title}</T><T size="small" tone="muted">{l.detail}</T></Card>
        </Pressable>
      ))}
    </Screen>
  );
}
