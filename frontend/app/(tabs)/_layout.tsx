import { Stack } from "expo-router";

// All tab routes are siblings under /(tabs). The tab bar is now rendered
// globally in the root layout (BottomBar) so every route sees it.
export default function TabsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
      }}
    />
  );
}
