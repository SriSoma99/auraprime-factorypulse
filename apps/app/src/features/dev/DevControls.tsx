// Local-only control strip to switch fallback levels and reset data while testing (mock.controls_enabled).
import { Pressable, View } from "react-native";
import type { FallbackLevel } from "@fp/sdk-ts";
import { Row, T } from "@/ui/primitives";
import { useTheme } from "@/ui/theme";
import { useMockControlsVM } from "./useMockControlsVM";

const LEVELS: FallbackLevel[] = ["L0", "L1", "L2", "L3", "L4", "L5"];
export function DevControls() {
  const vm = useMockControlsVM();
  const t = useTheme();
  if (!vm.available) return null;
  return (
    <View testID="dev-controls" style={{ borderBottomWidth: 1, borderStyle: "dashed", borderColor: t.note, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: t.surface }}>
      <Row>
        <T size="small" bold style={{ color: t.note }}>Mock controls</T>
        {LEVELS.map(l => (
          <Pressable key={l} testID={`mock-level-${l}`} accessibilityRole="button" accessibilityState={{ selected: vm.level === l }} onPress={() => vm.setLevel(l)}
            style={{ borderWidth: 1, borderColor: t.note, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, backgroundColor: vm.level === l ? t.note : "transparent" }}>
            <T size="small" style={{ color: vm.level === l ? t.surface : t.note }}>{l}</T>
          </Pressable>
        ))}
        <Pressable testID="mock-reset" accessibilityRole="button" onPress={vm.reset}><T size="small" style={{ color: t.note, textDecorationLine: "underline" }}>reset data</T></Pressable>
      </Row>
    </View>
  );
}
