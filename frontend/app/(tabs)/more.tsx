import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "../../src/theme";
import { usePrefs } from "../../src/prefs";

type RowProps = {
  icon: any;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  testID?: string;
};

const Row = ({ icon, title, subtitle, onPress, testID }: RowProps) => (
  <TouchableOpacity testID={testID} style={styles.row} onPress={onPress} activeOpacity={0.7}>
    <View style={styles.iconBox}>
      <Ionicons name={icon} size={20} color={theme.colors.accent} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.rowTitle}>{title}</Text>
      {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
    </View>
    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
  </TouchableOpacity>
);

export default function MoreScreen() {
  const router = useRouter();
  const { prefs, update } = usePrefs();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>MORE</Text>
        <Text style={styles.subtitle}>Manage everything</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <Text style={styles.sectionLabel}>ORGANIZATION</Text>
        <Row
          icon="folder"
          title="Categories"
          subtitle="Manage tool categories"
          testID="more-categories"
          onPress={() => router.push("/manage/categories")}
        />
        <Row
          icon="pricetag"
          title="Tags"
          subtitle="Manage tags"
          testID="more-tags"
          onPress={() => router.push("/manage/tags")}
        />
        <Row
          icon="location"
          title="Locations"
          subtitle="Nested storage hierarchy"
          testID="more-locations"
          onPress={() => router.push("/locations")}
        />
        <Row
          icon="cube"
          title="Toolbox Photos"
          subtitle="AI drawer mapping"
          testID="more-toolbox"
          onPress={() => router.push("/toolbox")}
        />
        <Row
          icon="shield-checkmark"
          title="Warranty Alerts"
          subtitle="Expiring & expired warranties"
          testID="more-warranty"
          onPress={() => router.push("/warranty")}
        />
        <Row
          icon="construct"
          title="Warranty Claims"
          subtitle="Track broken items by dealer"
          testID="more-claims"
          onPress={() => router.push("/warranty-claims")}
        />

        <Text style={styles.sectionLabel}>DISPLAY</Text>
        <View style={styles.toggleRow}>
          <View style={styles.iconBox}>
            <Ionicons name="cash" size={20} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Show prices in lists</Text>
            <Text style={styles.rowSub}>Hide $ amounts everywhere</Text>
          </View>
          <Switch
            testID="toggle-prices"
            value={prefs.show_prices}
            onValueChange={(v) => update({ show_prices: v })}
            trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.iconBox}>
            <Ionicons name="stats-chart" size={20} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Detail summary headers</Text>
            <Text style={styles.rowSub}>Show counts/breakdowns on lists</Text>
          </View>
          <Switch
            testID="toggle-summary"
            value={prefs.show_details_summary}
            onValueChange={(v) => update({ show_details_summary: v })}
            trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
            thumbColor="#fff"
          />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.iconBox}>
            <Ionicons name="notifications" size={20} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Warranty expiry alerts</Text>
            <Text style={styles.rowSub}>Banner on inventory tab</Text>
          </View>
          <Switch
            testID="toggle-warranty-alerts"
            value={prefs.warranty_alerts}
            onValueChange={(v) => update({ warranty_alerts: v })}
            trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
            thumbColor="#fff"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  title: { color: theme.colors.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: 2 },
  subtitle: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomColor: theme.colors.borderSubtle,
    borderBottomWidth: 1,
    gap: 12,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomColor: theme.colors.borderSubtle,
    borderBottomWidth: 1,
    gap: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  rowTitle: { color: theme.colors.textPrimary, fontWeight: "700", fontSize: 15 },
  rowSub: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
});
