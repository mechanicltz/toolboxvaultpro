import { AppImage } from "../src/components/AppImage";
import { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useAppResume } from "../src/appLifecycle";
import { theme } from "../src/theme";
import { api } from "../src/api";
import { formatDateUS } from "../src/dateUtil";
import { SkinPlate } from "../src/components/SkinPlate";
import { IndustrialBanner } from "../src/components/IndustrialBanner";

import { themedStyles } from "../src/themeContext";

export default function WarrantyScreen() {
  const router = useRouter();
  const [data, setData] = useState<{ expiring: any[]; expired: any[] }>({ expiring: [], expired: [] });

  const load = useCallback(async () => {
    const d = await api.warrantyAlerts(60);
    setData(d);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  // iOS suspends in-flight fetches when the app is backgrounded; on resume
  // _layout.tsx aborts them + calls notifyAppResume() so we re-load here.
  useAppResume(useCallback(() => { load(); }, [load]));


  const renderItem = (t: any, kind: "expiring" | "expired") => {
    const ex = t.warranty?.expiry_date || "";
    const accent = kind === "expired" ? theme.colors.danger : theme.colors.warning;
    return (
      <SkinPlate
        key={t.id}
        testID={`warranty-${t.id}`}
        style={styles.rowOuter}
        innerStyle={styles.rowInner}
        onPress={() => router.push(`/tool/${t.id}`)}
      >
        <View style={styles.thumb}>
          {t.photos?.[0] ? (
            <AppImage source={{ uri: t.photos[0] }} style={{ width: "100%", height: "100%" }} />
          ) : (
            <Ionicons name="construct" size={24} color={theme.colors.accent} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.toolName}>{t.name}</Text>
          <Text style={[styles.toolMeta, { color: accent }]}>
            {kind === "expired" ? "EXPIRED" : "EXPIRING"} · {formatDateUS(ex)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
      </SkinPlate>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner
        title="WARRANTY ALERTS"
        subtitle="Expiring & Expired"
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <Text style={styles.sectionLabel}>EXPIRING SOON ({data.expiring.length})</Text>
        {data.expiring.length === 0 ? (
          <Text style={styles.empty}>None expiring in the next 60 days.</Text>
        ) : (
          data.expiring.map((t) => renderItem(t, "expiring"))
        )}
        <Text style={styles.sectionLabel}>EXPIRED ({data.expired.length})</Text>
        {data.expired.length === 0 ? (
          <Text style={styles.empty}>No expired warranties.</Text>
        ) : (
          data.expired.map((t) => renderItem(t, "expired"))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.canvas },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  title: { color: c.textPrimary, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  sectionLabel: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  rowOuter: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  thumb: {
    width: 44,
    height: 44,
    backgroundColor: c.surface,
    borderRadius: 4,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  toolName: { color: c.textPrimary, fontWeight: "700", fontSize: 10 },
  toolMeta: { color: c.warning, fontWeight: "800", fontSize: 8, letterSpacing: 1, marginTop: 2 },
  empty: { color: c.textMuted, fontStyle: "italic", padding: 24, textAlign: "center" },
}));
