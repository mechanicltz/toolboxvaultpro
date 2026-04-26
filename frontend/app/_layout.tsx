import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View } from "react-native";
import { AuroraBackground } from "../src/Aurora";
import { BottomBar } from "../src/BottomBar";
import { ReportsFab } from "../src/ReportsFab";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0A0A0A" }}>
      <StatusBar style="light" />
      <AuroraBackground>
        <View style={{ flex: 1 }}>
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
            <ReportsFab />
          </View>
          <BottomBar />
        </View>
      </AuroraBackground>
    </GestureHandlerRootView>
  );
}
