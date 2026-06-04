import { Stack } from "expo-router";
import { useColors } from "../../src/themeContext";

// All tab routes are siblings under /(tabs). The tab bar is now rendered
// globally in the root layout (BottomBar) so every route sees it. The screen
// background follows the active palette (dark for industrial/plain-dark,
// light for plain-light) so plain-light screens never show a dark gap.
export default function TabsLayout() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.bg },
      }}
    />
  );
}
