import { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { theme } from "../../src/theme";
import { usePrefs } from "../../src/prefs";
import { api } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { TIER_LABELS, isPremium } from "../../src/subscription";

type RowProps = {
  icon: any;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  testID?: string;
  badge?: number;
  badgeColor?: string;
};

const Row = ({ icon, title, subtitle, onPress, testID, badge, badgeColor }: RowProps) => (
  <TouchableOpacity testID={testID} style={styles.row} onPress={onPress} activeOpacity={0.7}>
    <View style={styles.iconBox}>
      <Ionicons name={icon} size={20} color={theme.colors.accent} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.rowTitle}>{title}</Text>
      {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
    </View>
    {!!badge && badge > 0 && (
      <View
        style={[
          styles.badge,
          badgeColor ? { backgroundColor: badgeColor } : null,
        ]}
      >
        <Text style={styles.badgeText}>{badge > 99 ? "99+" : String(badge)}</Text>
      </View>
    )}
    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
  </TouchableOpacity>
);

export default function MoreScreen() {
  const router = useRouter();
  const { prefs, update } = usePrefs();
  const { user, logout } = useAuth();
  const [mntDue, setMntDue] = useState({ overdue: 0, due_soon: 0 });
  const [pwOpen, setPwOpen] = useState(false);
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState("");
  const [pwOk, setPwOk] = useState("");

  const submitPasswordChange = async () => {
    setPwErr("");
    setPwOk("");
    if (!pwNew || pwNew.length < 6) {
      setPwErr("Password must be at least 6 characters.");
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwErr("New password and confirmation do not match.");
      return;
    }
    setPwBusy(true);
    try {
      await api.updateMe({ password: pwNew });
      setPwOk("Password changed.");
      setPwNew("");
      setPwConfirm("");
      setTimeout(() => {
        setPwOpen(false);
        setPwOk("");
      }, 1200);
    } catch (e: any) {
      setPwErr(String(e?.message || e));
    } finally {
      setPwBusy(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      api
        .upcomingMaintenance(30)
        .then((res) =>
          setMntDue({ overdue: res.overdue || 0, due_soon: res.due_soon || 0 })
        )
        .catch(() => {});
    }, [])
  );

  const totalDue = mntDue.overdue + mntDue.due_soon;
  const tier = (user?.subscription?.tier || "free") as "free" | "monthly" | "yearly" | "lifetime";
  const isPaid = isPremium(tier);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>MORE</Text>
        <Text style={styles.subtitle}>{user?.email || "Manage everything"}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <TouchableOpacity
          style={[styles.row, styles.subscriptionRow]}
          onPress={() => router.push("/subscription")}
          activeOpacity={0.7}
          testID="more-subscription"
        >
          <View
            style={[
              styles.iconBox,
              { backgroundColor: isPaid ? "rgba(255,179,0,0.15)" : theme.colors.surface },
            ]}
          >
            <Ionicons
              name={isPaid ? (tier === "lifetime" ? "diamond" : "shield-checkmark") : "leaf"}
              size={20}
              color={isPaid ? theme.colors.accent : theme.colors.textSecondary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Subscription</Text>
            <Text style={styles.rowSub}>
              {TIER_LABELS[tier]}
              {!isPaid ? " — Tap to upgrade for unlimited access" : ""}
            </Text>
          </View>
          {!isPaid && (
            <View style={styles.upgradePill}>
              <Text style={styles.upgradePillText}>UPGRADE</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>

        <Row
          icon="key"
          title="Change Password"
          subtitle="Update your account password"
          testID="more-change-password"
          onPress={() => {
            setPwNew("");
            setPwConfirm("");
            setPwErr("");
            setPwOk("");
            setPwOpen(true);
          }}
        />

        <Row
          icon="person-circle"
          title="Personal Information"
          subtitle="Name, address, phone, insurance — used in reports"
          testID="more-personal-info"
          onPress={() => router.push("/personal-info")}
        />

        <Row
          icon="heart"
          title="Wish List"
          subtitle="Saved links to tools you want"
          testID="more-wishlist"
          onPress={() => router.push("/wishlist")}
        />

        <Row
          icon="people"
          title="Borrowers"
          subtitle="Who has your tools"
          testID="more-borrowers"
          onPress={() => router.push("/borrowers")}
        />

        <Row
          icon="pricetag"
          title="Inventory for Sale"
          subtitle="List items, mark as sold, sale & sold reports"
          testID="more-for-sale"
          onPress={() => router.push("/for-sale")}
        />

        <Row
          icon="shield-checkmark"
          title="Warranty Alerts"
          subtitle="Expiring & expired warranties"
          testID="more-warranty"
          onPress={() => router.push("/warranty")}
        />

        <Row
          icon="settings"
          title="Maintenance"
          subtitle={
            totalDue > 0
              ? `${mntDue.overdue} overdue, ${mntDue.due_soon} due soon`
              : "Calibration & service schedules"
          }
          testID="more-maintenance"
          badge={totalDue}
          badgeColor={mntDue.overdue > 0 ? theme.colors.danger : theme.colors.accent}
          onPress={() => router.push("/maintenance")}
        />

        <Text style={styles.sectionLabel}>REPORTS</Text>
        <Row
          icon="document-text"
          title="Reports"
          subtitle="PDF / CSV exports & saved presets"
          testID="more-reports"
          onPress={() => router.push("/reports")}
        />

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

        <Text style={styles.sectionLabel}>SESSION</Text>
        <TouchableOpacity
          style={styles.row}
          onPress={() => logout()}
          activeOpacity={0.7}
          testID="more-logout"
        >
          <View style={styles.iconBox}>
            <Ionicons name="log-out" size={20} color={theme.colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: theme.colors.danger }]}>Sign Out</Text>
            <Text style={styles.rowSub}>{user?.email || ""}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </ScrollView>

      {/* Change Password Modal */}
      <Modal
        visible={pwOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPwOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={pwStyles.backdrop}
        >
          <View style={pwStyles.card}>
            <View style={pwStyles.header}>
              <Ionicons name="key" size={20} color={theme.colors.accent} />
              <Text style={pwStyles.title}>CHANGE PASSWORD</Text>
              <TouchableOpacity
                onPress={() => setPwOpen(false)}
                hitSlop={10}
                testID="pw-close"
              >
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={pwStyles.label}>NEW PASSWORD</Text>
            <TextInput
              testID="pw-new"
              value={pwNew}
              onChangeText={setPwNew}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="At least 6 characters"
              placeholderTextColor={theme.colors.textMuted}
              style={pwStyles.input}
            />
            <Text style={pwStyles.label}>CONFIRM NEW PASSWORD</Text>
            <TextInput
              testID="pw-confirm"
              value={pwConfirm}
              onChangeText={setPwConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Re-enter the new password"
              placeholderTextColor={theme.colors.textMuted}
              style={pwStyles.input}
            />
            {!!pwErr && <Text style={pwStyles.err}>{pwErr}</Text>}
            {!!pwOk && <Text style={pwStyles.ok}>{pwOk}</Text>}
            <TouchableOpacity
              testID="pw-submit"
              style={[pwStyles.primaryBtn, pwBusy && { opacity: 0.6 }]}
              disabled={pwBusy}
              onPress={submitPasswordChange}
            >
              {pwBusy ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={pwStyles.primaryBtnText}>UPDATE PASSWORD</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const pwStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: theme.colors.bgSecondary,
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  title: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.textPrimary,
    fontSize: 14,
  },
  err: {
    color: theme.colors.danger,
    fontSize: 12,
    marginTop: 10,
  },
  ok: {
    color: "#27AE60",
    fontSize: 12,
    marginTop: 10,
  },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 13,
  },
});

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
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 7,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  badgeText: {
    color: "#000",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  subscriptionRow: {
    backgroundColor: theme.colors.glass,
  },
  upgradePill: {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 6,
  },
  upgradePillText: { color: "#000", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
});
