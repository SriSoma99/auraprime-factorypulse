import { Redirect } from "expo-router";
import { Pressable } from "react-native";
import { useSession } from "@/lib/session";
import { useSignInVM } from "@/features/signin/useSignInVM";
import { Card, Chip, Heading, Loading, Row, Screen, T } from "@/ui/primitives";
import { advisoryNote } from "@/lib/copy";

export default function SignIn() {
  const { session } = useSession();
  const vm = useSignInVM();
  if (session) return <Redirect href="/" />;
  return (
    <Screen testID="sign-in">
      <Heading>AuraPrime FactoryPulse</Heading>
      <Row><Chip label="SYNTHETIC DATA" dashed /><Chip label="Local sign-in" /></Row>
      <T tone="muted">Choose who you are. In production this is the identity provider; locally it signs you in as a seeded user so every role and session type can be tested.</T>
      {vm.loading ? <Loading /> : null}
      {vm.error ? <Card tone="bad"><T bold>The mock API is not reachable.</T><T>Start it with pnpm dev:api, then reload.</T></Card> : null}
      {Object.entries(vm.groups).map(([group, people]) => (
        <Card key={group}>
          <Heading level={3}>{group}</Heading>
          {people.map(p => (
            <Pressable key={p.principalId} accessibilityRole="button" testID={`principal-${p.principalId}`} onPress={() => void vm.choose(p)}>
              <Card emphasis={false} style={{ minHeight: 44 }}>
                <T bold>{p.displayName}</T>
                <T size="small" tone="muted">{p.role.replace(/_/g, " ")} · {p.sessionType.replace(/_/g, " ")}</T>
              </Card>
            </Pressable>
          ))}
        </Card>
      ))}
      <T size="small" tone="muted">{advisoryNote}</T>
    </Screen>
  );
}
