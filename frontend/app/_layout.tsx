import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View } from "react-native";
import { AuroraBackground } from "../src/Aurora";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#F7F4EE" }}>
      <StatusBar style="dark" />
      <AuroraBackground>
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "transparent" },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="tool/[id]" />
            <Stack.Screen name="tool/edit" />
          </Stack>
        </View>
      </AuroraBackground>
    </GestureHandlerRootView>
  );
}
