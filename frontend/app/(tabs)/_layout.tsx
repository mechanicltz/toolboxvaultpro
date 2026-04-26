import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      sceneContainerStyle={{ backgroundColor: "transparent" }}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "rgba(15, 15, 15, 0.92)",
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: 70,
          paddingTop: 8,
          paddingBottom: 12,
          position: "absolute",
        },
        tabBarBackground: () => null,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 1,
          textTransform: "uppercase",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarButtonTestID: "tab-home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: "Inventory",
          tabBarButtonTestID: "tab-inventory",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="construct" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dealers"
        options={{
          title: "Dealers",
          tabBarButtonTestID: "tab-dealers",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="briefcase" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="claims"
        options={{
          title: "Claims",
          tabBarButtonTestID: "tab-claims",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="build" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarButtonTestID: "tab-more",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="apps" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden tabs (still routed but not shown in tab bar) */}
      <Tabs.Screen name="borrowers" options={{ href: null }} />
      <Tabs.Screen name="reports" options={{ href: null }} />
    </Tabs>
  );
}
