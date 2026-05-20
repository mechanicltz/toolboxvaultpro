import { useState, useCallback, useEffect, useRef } from "react";
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
  Alert,
  Linking,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useAppResume } from "../../src/appLifecycle";
import { theme } from "../../src/theme";
import { useThemeMode } from "../../src/themeContext";
import {
  getBiometricStatus,
  enableBiometric,
  disableBiometric,
  type BiometricStatus,
} from "../../src/biometric";
import { usePrefs, HOME_ROW_LABELS, HomeRowKey } from "../../src/prefs";
import { api } from "../../src/api";
import { useAuth } from "../../src/AuthContext";
import { APP_VERSION_LABEL } from "../../src/version";
import { themedStyles } from "../../src/themeContext";
import { BevelCard } from "../../src/components/BevelCard";

import {
  requestPermissions as requestNotificationPermissions,
  rescheduleDealerNotifications,
  cancelDealerNotifications,
  sendTestNotification,
} from "../../src/notifications";

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
  <BevelCard testID={testID} style={styles.row} onPress={onPress} activeOpacity={0.7}>
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
  </BevelCard>
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
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [homeRowsModal, setHomeRowsModal] = useState(false);
  const { mode: themeMode, setMode: setThemeMode } = useThemeMode();

  // Subscription + admin gates.
  const [sub, setSub] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Audit #11: track the auto-close timer for the change-password modal so
  // it can't fire setState after this screen unmounts.
  const pwCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (pwCloseTimerRef.current) {
        clearTimeout(pwCloseTimerRef.current);
        pwCloseTimerRef.current = null;
      }
    };
  }, []);

  // Refresh subscription + admin status when we land on this screen.
  const refreshAccountState = useCallback(async () => {
    try {
      const s = await api.getSubscription();
      setSub(s);
    } catch {
      // not logged in or backend down — leave defaults
    }
    try {
      const me = await api.adminWhoAmI();
      setIsAdmin(!!me?.is_admin);
    } catch {
      setIsAdmin(false);
    }
  }, []);
  useEffect(() => {
    refreshAccountState();
  }, [refreshAccountState]);
  useFocusEffect(
    useCallback(() => {
      refreshAccountState();
    }, [refreshAccountState]),
  );
  // Also refresh on app resume (e.g. after a backgrounded subscription change).
  useAppResume(useCallback(() => { refreshAccountState(); }, [refreshAccountState]));

  // Biometric (Face ID / Touch ID) status — re-read on focus so any
  // change made elsewhere is reflected here. Disabling on web is fine
  // since the helpers no-op on that platform.
  const [bioStatus, setBioStatus] = useState<BiometricStatus | null>(null);
  const refreshBio = useCallback(async () => {
    setBioStatus(await getBiometricStatus());
  }, []);
  useEffect(() => {
    refreshBio();
  }, [refreshBio]);
  useFocusEffect(
    useCallback(() => {
      refreshBio();
    }, [refreshBio]),
  );

  const handleToggleBiometric = async (next: boolean) => {
    if (!bioStatus) return;
    if (next) {
      // Turning ON — we need the user's password to store in SecureStore.
      // Prompt for it inline.
      let pw = "";
      const askPassword = () =>
        new Promise<string | null>((resolve) => {
          Alert.prompt(
            `Enable ${bioStatus.label}?`,
            `Confirm your password to enable ${bioStatus.label} sign-in.`,
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
              {
                text: "Enable",
                onPress: (v) => resolve((v || "").trim() || null),
              },
            ],
            "secure-text",
          );
        });
      if (Platform.OS !== "ios") {
        Alert.alert(
          `Enable ${bioStatus.label}`,
          `To enable ${bioStatus.label}, please sign out and the app will offer the prompt on your next sign-in.`,
          [{ text: "OK" }],
        );
        return;
      }
      pw = (await askPassword()) || "";
      if (!pw) return;
      // Validate the password against the backend before saving.
      try {
        if (!user?.email) throw new Error("No active user");
        const ok = await api
          .login({ email: user.email, password: pw })
          .catch(() => null);
        if (!ok) {
          Alert.alert("Wrong password", "Please try again.");
          return;
        }
        // enableBiometric() now ALSO fires an OS biometric prompt
        // immediately. This is what triggers iOS to show its one-time
        // "Allow Toolbox Vault to use Face ID?" permission dialog, and
        // confirms the user's face/finger before we commit anything
        // to storage. If they cancel, leave the toggle off.
        const ok2 = await enableBiometric(user.email, pw);
        await refreshBio();
        if (ok2) {
          Alert.alert(
            `${bioStatus.label} enabled`,
            `You'll be signed in automatically with ${bioStatus.label} next time.`,
          );
        } else {
          Alert.alert(
            `${bioStatus.label} not enabled`,
            `We couldn't confirm your ${bioStatus.label}. Try again, or check that ${bioStatus.label} is set up in your phone's settings.`,
          );
        }
      } catch (e: any) {
        Alert.alert("Couldn't enable", e?.message || "Try again.");
      }
    } else {
      await disableBiometric();
      await refreshBio();
    }
  };

  // Source of truth for "is the user PRO right now?" — uses the backend's
  // computed `is_active` (which honours expires_at / lifetime / will_renew).
  // Both this badge AND the paywall + redeem-promo screen MUST use the same
  // rule or the user sees contradictory state (e.g. "FREE TIER" on More but
  // "You already have PRO" on the paywall when their RC sub has expired).
  const isPro = !!(sub?.is_lifetime || sub?.is_active);
  const proLabel = (() => {
    if (sub?.is_lifetime) return "✨ LIFETIME PRO";
    if (isPro) {
      if (sub?.expires_at) {
        return `PRO until ${new Date(sub.expires_at).toLocaleDateString()}`;
      }
      return "✨ PRO";
    }
    return "FREE TIER";
  })();

  // Format hour:minute as "7:00 AM" / "1:30 PM" for the row.
  const formatHourMinute = (h: number, m: number): string => {
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const mm = String(m).padStart(2, "0");
    return `${h12}:${mm} ${period}`;
  };

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
      pwCloseTimerRef.current = setTimeout(() => {
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>TOOLBOX VAULT</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {user?.email || "Manage everything"}
        </Text>
        <View
          style={[
            styles.proBadge,
            { borderColor: isPro ? theme.colors.accent : theme.colors.border },
          ]}
        >
          <Ionicons
            name={isPro ? "star" : "star-outline"}
            size={11}
            color={isPro ? theme.colors.accent : theme.colors.textMuted}
          />
          <Text
            style={[
              styles.proBadgeText,
              { color: isPro ? theme.colors.accent : theme.colors.textMuted },
            ]}
          >
            {proLabel}
          </Text>
        </View>
        <Text style={styles.versionLine} testID="more-version">
          {APP_VERSION_LABEL}
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Light / Dark mode toggle — placed at top of the More tab so
            users can flip themes without scrolling. */}
        <BevelCard style={styles.toggleRow}>
          <View style={styles.iconBox}>
            <Ionicons
              name={themeMode === "light" ? "sunny" : "moon"}
              size={20}
              color={theme.colors.accent}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Light / Dark Theme</Text>
            <Text style={styles.rowSub}>
              {themeMode === "light"
                ? "Soft grey-blue background, dark text"
                : "Industrial dark workshop look"}
            </Text>
          </View>
          <Switch
            testID="toggle-light-mode"
            value={themeMode === "light"}
            onValueChange={(v) => setThemeMode(v ? "light" : "dark")}
            trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
            thumbColor="#fff"
          />
        </BevelCard>

        <Row
          icon="chatbubble-ellipses"
          title="Report a Bug · Request a Feature"
          subtitle="Send feedback directly to the developers"
          testID="more-feedback"
          onPress={() => router.push("/feedback")}
        />

        <Text style={styles.sectionLabel}>SYSTEM</Text>

        <Row
          icon="heart"
          title="Wish List"
          subtitle="Saved links to tools you want"
          testID="more-wishlist"
          onPress={() => router.push("/wishlist")}
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

        <Text style={styles.sectionLabel}>IMPORT / EXPORT</Text>
        <Row
          icon="document-text"
          title="Reports"
          subtitle="PDF / CSV exports & saved presets"
          testID="more-reports"
          onPress={() => router.push("/reports")}
        />
        <Row
          icon="swap-horizontal"
          title="Import / Export Database"
          subtitle="Bulk-upload tools or back up to a spreadsheet"
          testID="more-import-export"
          onPress={() => router.push("/import-export" as any)}
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

        {/* Home Screen Rows — collapsed into a pillbox row that opens a
            modal containing the reorder/visibility list. (Was previously an
            inline always-expanded card — user feedback Round 4.) */}
        <Row
          icon="grid"
          title="Home Screen Rows"
          subtitle="Choose which rows show on Home & reorder them"
          testID="more-home-rows"
          onPress={() => setHomeRowsModal(true)}
        />

        <BevelCard style={styles.toggleRow}>
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
        </BevelCard>

        <BevelCard style={styles.toggleRow}>
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
        </BevelCard>

        <BevelCard style={styles.toggleRow}>
          <View style={styles.iconBox}>
            <Ionicons name="notifications" size={20} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Warranty Expiring Alerts</Text>
            <Text style={styles.rowSub}>Banner on inventory tab</Text>
          </View>
          <Switch
            testID="toggle-warranty-alerts"
            value={prefs.warranty_alerts}
            onValueChange={(v) => update({ warranty_alerts: v })}
            trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
            thumbColor="#fff"
          />
        </BevelCard>

        {/* Light / Dark mode toggle has moved to the TOP of the More tab
            (see beginning of ScrollView). */}

        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>

        <BevelCard style={styles.toggleRow} testID="notif-toggle-row">
          <View style={styles.iconBox}>
            <Ionicons name="notifications" size={20} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Dealer route reminders</Text>
            <Text style={styles.rowSub}>
              Local notification when a tool dealer is scheduled to visit
            </Text>
          </View>
          <Switch
            value={prefs.dealer_notifications_enabled}
            onValueChange={async (v) => {
              if (v) {
                const granted = await requestNotificationPermissions();
                if (!granted) {
                  Alert.alert(
                    "Permission needed",
                    "To remind you about dealer visits, please allow notifications for this app in your device settings.",
                  );
                  return;
                }
                await update({ dealer_notifications_enabled: true });
                try {
                  const dealers = await api.listDealers();
                  await rescheduleDealerNotifications(dealers, {
                    enabled: true,
                    hour: prefs.dealer_notification_hour,
                    minute: prefs.dealer_notification_minute,
                    notifyDayBefore: prefs.dealer_notify_day_before,
                  });
                } catch {
                  /* dealers fetch may fail offline; user can re-toggle later */
                }
              } else {
                await update({ dealer_notifications_enabled: false });
                await cancelDealerNotifications();
              }
            }}
            trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
            thumbColor="#fff"
          />
        </BevelCard>

        {prefs.dealer_notifications_enabled && (
          <>
            <BevelCard
              style={styles.toggleRow}
              onPress={() => setTimePickerOpen(true)}
              testID="notif-time-row"
            >
              <View style={styles.iconBox}>
                <Ionicons name="time" size={20} color={theme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Reminder time</Text>
                <Text style={styles.rowSub}>
                  When to send the reminder on dealer-visit days
                </Text>
              </View>
              <Text style={styles.timeValue}>
                {formatHourMinute(
                  prefs.dealer_notification_hour,
                  prefs.dealer_notification_minute,
                )}
              </Text>
            </BevelCard>

            <BevelCard style={styles.toggleRow}>
              <View style={styles.iconBox}>
                <Ionicons name="calendar" size={20} color={theme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Also remind day before</Text>
                <Text style={styles.rowSub}>
                  Get a heads-up reminder the day before too
                </Text>
              </View>
              <Switch
                value={prefs.dealer_notify_day_before}
                onValueChange={async (v) => {
                  await update({ dealer_notify_day_before: v });
                  try {
                    const dealers = await api.listDealers();
                    await rescheduleDealerNotifications(dealers, {
                      enabled: true,
                      hour: prefs.dealer_notification_hour,
                      minute: prefs.dealer_notification_minute,
                      notifyDayBefore: v,
                    });
                  } catch {
                    /* no-op */
                  }
                }}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                thumbColor="#fff"
              />
            </BevelCard>

            <BevelCard
              style={styles.toggleRow}
              testID="notif-test-row"
              onPress={async () => {
                const ok = await sendTestNotification();
                if (ok) {
                  Alert.alert(
                    "Test scheduled",
                    "A test notification will appear in about 5 seconds. If your phone is on silent or Do Not Disturb is on, you'll see it in Notification Center.",
                  );
                } else {
                  Alert.alert(
                    "Permission needed",
                    "Please enable notifications for this app in your device settings.",
                  );
                }
              }}
            >
              <View style={styles.iconBox}>
                <Ionicons name="paper-plane" size={20} color={theme.colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Send a test notification</Text>
                <Text style={styles.rowSub}>
                  Fires in 5 seconds — confirms permissions are working
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={theme.colors.textMuted}
              />
            </BevelCard>
          </>
        )}

        <Text style={styles.sectionLabel}>ACCOUNT</Text>

        <Row
          icon="person-circle"
          title="Personal Information"
          subtitle="Name, address, phone, insurance — used in reports"
          testID="more-personal-info"
          onPress={() => router.push("/personal-info")}
        />

        <Row
          icon="star-outline"
          title={isPro ? "Manage Subscription" : "Upgrade to PRO"}
          subtitle={
            isPro
              ? "View or cancel your subscription"
              : "Unlock unlimited tools and full features"
          }
          testID="more-paywall"
          onPress={() => router.push("/paywall")}
        />

        {isAdmin && (
          <Row
            icon="cloud-download-outline"
            title="Admin · Database Backups"
            subtitle="Monthly auto-backups · manual triggers · downloads"
            testID="more-admin-backups"
            onPress={() => router.push("/admin/backups")}
          />
        )}

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

        {/* Biometric (Face ID / Touch ID / Fingerprint) sign-in toggle —
            only shown on native builds when the device has hardware +
            an enrolled biometric. Disabling wipes the saved credentials
            from the OS Keychain / Keystore. */}
        {bioStatus && bioStatus.hasHardware ? (
          <BevelCard style={styles.toggleRow} testID="more-biometric-toggle">
            <View style={styles.iconBox}>
              <Ionicons
                name={
                  bioStatus.label.toLowerCase().includes("face")
                    ? "scan"
                    : bioStatus.label.toLowerCase().includes("touch") ||
                      bioStatus.label.toLowerCase().includes("finger")
                    ? "finger-print"
                    : "lock-closed"
                }
                size={20}
                color={theme.colors.accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{bioStatus.label} Sign-In</Text>
              <Text style={styles.rowSub}>
                {!bioStatus.isEnrolled
                  ? `Set up ${bioStatus.label} in your device settings first`
                  : bioStatus.enabled
                  ? `Auto-unlock the app with ${bioStatus.label}`
                  : `Skip the password — sign in with ${bioStatus.label}`}
              </Text>
            </View>
            <Switch
              testID="toggle-biometric"
              value={bioStatus.enabled}
              disabled={!bioStatus.isEnrolled}
              onValueChange={handleToggleBiometric}
              trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
              thumbColor="#fff"
            />
          </BevelCard>
        ) : null}

        <BevelCard
          style={styles.row}
          onPress={() =>
            Linking.openURL(
              "https://mechanicltz.github.io/toolboxvault-legal/terms.html",
            )
          }
          activeOpacity={0.7}
          testID="more-terms"
        >
          <View style={styles.iconBox}>
            <Ionicons name="document-text" size={20} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Terms of Use</Text>
            <Text style={styles.rowSub}>EULA · subscription terms</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={theme.colors.textMuted} />
        </BevelCard>

        <BevelCard
          style={styles.row}
          onPress={() =>
            Linking.openURL(
              "https://mechanicltz.github.io/toolboxvault-legal/privacy.html",
            )
          }
          activeOpacity={0.7}
          testID="more-privacy"
        >
          <View style={styles.iconBox}>
            <Ionicons name="lock-closed" size={20} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Privacy Policy</Text>
            <Text style={styles.rowSub}>How we handle your data</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={theme.colors.textMuted} />
        </BevelCard>

        <BevelCard
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
        </BevelCard>

        <BevelCard
          style={styles.row}
          activeOpacity={0.7}
          testID="more-delete-account"
          onPress={() => {
            Alert.alert(
              "Delete Account",
              "Are you sure you want to delete your account?",
              [
                { text: "No", style: "cancel" },
                {
                  text: "Yes",
                  style: "destructive",
                  onPress: () => router.push("/delete-account" as any),
                },
              ],
              { cancelable: true },
            );
          }}
        >
          <View style={styles.iconBox}>
            <Ionicons name="skull" size={20} color={theme.colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: theme.colors.danger }]}>
              Delete Account
            </Text>
            <Text style={styles.rowSub}>
              Permanently destroy your account and all data
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </BevelCard>
      </ScrollView>

      {/* Home Screen Rows modal — pick which rows show on Home and reorder them */}
      <Modal
        visible={homeRowsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setHomeRowsModal(false)}
      >
        <View style={homeRowsModalStyles.backdrop}>
          <View style={homeRowsModalStyles.card}>
            <View style={homeRowsModalStyles.header}>
              <Ionicons name="grid" size={20} color={theme.colors.accent} />
              <Text style={homeRowsModalStyles.title}>HOME SCREEN ROWS</Text>
              <TouchableOpacity
                onPress={() => setHomeRowsModal(false)}
                hitSlop={10}
                testID="home-rows-close"
              >
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={homeRowsModalStyles.help}>
              Toggle visibility · use ↑↓ to reorder. Top of the list shows first on Home.
            </Text>
            <ScrollView style={{ maxHeight: 500 }}>
              {prefs.home_row_order.map((k, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === prefs.home_row_order.length - 1;
                const moveUp = () => {
                  if (isFirst) return;
                  const next = [...prefs.home_row_order];
                  [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                  update({ home_row_order: next });
                };
                const moveDown = () => {
                  if (isLast) return;
                  const next = [...prefs.home_row_order];
                  [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                  update({ home_row_order: next });
                };
                return (
                  <View key={k} style={styles.homeRowToggle}>
                    <View style={styles.homeRowMoveCol}>
                      <TouchableOpacity
                        testID={`home-row-up-${k}`}
                        onPress={moveUp}
                        disabled={isFirst}
                        style={[styles.homeRowMoveBtn, isFirst && { opacity: 0.25 }]}
                        hitSlop={6}
                      >
                        <Ionicons name="chevron-up" size={16} color={theme.colors.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`home-row-down-${k}`}
                        onPress={moveDown}
                        disabled={isLast}
                        style={[styles.homeRowMoveBtn, isLast && { opacity: 0.25 }]}
                        hitSlop={6}
                      >
                        <Ionicons name="chevron-down" size={16} color={theme.colors.accent} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.homeRowToggleLabel}>{HOME_ROW_LABELS[k]}</Text>
                    <Switch
                      testID={`home-row-${k}`}
                      value={prefs.home_rows[k]}
                      onValueChange={(v) =>
                        update({ home_rows: { ...prefs.home_rows, [k]: v } })
                      }
                      trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                      thumbColor="#fff"
                    />
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={homeRowsModalStyles.doneBtn}
              onPress={() => setHomeRowsModal(false)}
              testID="home-rows-done"
            >
              <Text style={homeRowsModalStyles.doneBtnText}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

      {/* Time picker — schedules when on dealer-route days the reminder fires.
          On iOS, the picker is rendered INSIDE a bottom-sheet modal so taps
          reach the picker (not the dismiss overlay). On Android, the system
          shows its native dialog. */}
      {Platform.OS === "android" && timePickerOpen && (
        <DateTimePicker
          value={(() => {
            const d = new Date();
            d.setHours(prefs.dealer_notification_hour, prefs.dealer_notification_minute, 0, 0);
            return d;
          })()}
          mode="time"
          is24Hour={false}
          display="default"
          onChange={async (event, selected) => {
            // Android auto-dismisses; respect dismiss vs. set events.
            setTimePickerOpen(false);
            if (event.type === "set" && selected) {
              const h = selected.getHours();
              const m = selected.getMinutes();
              await update({ dealer_notification_hour: h, dealer_notification_minute: m });
              try {
                const dealers = await api.listDealers();
                await rescheduleDealerNotifications(dealers, {
                  enabled: prefs.dealer_notifications_enabled,
                  hour: h,
                  minute: m,
                  notifyDayBefore: prefs.dealer_notify_day_before,
                });
              } catch {
                /* no-op */
              }
            }
          }}
        />
      )}
      {Platform.OS === "ios" && (
        <Modal
          visible={timePickerOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setTimePickerOpen(false)}
        >
          <TouchableOpacity
            style={styles.timeModalBackdrop}
            activeOpacity={1}
            onPress={() => setTimePickerOpen(false)}
          />
          <View style={styles.timeModalSheet}>
            <View style={styles.timeModalHeader}>
              <TouchableOpacity onPress={() => setTimePickerOpen(false)}>
                <Text style={styles.timeModalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.timeModalTitle}>Reminder Time</Text>
              <TouchableOpacity onPress={() => setTimePickerOpen(false)}>
                <Text style={styles.timeModalDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={(() => {
                const d = new Date();
                d.setHours(prefs.dealer_notification_hour, prefs.dealer_notification_minute, 0, 0);
                return d;
              })()}
              mode="time"
              is24Hour={false}
              display="spinner"
              themeVariant="dark"
              textColor="#FFFFFF"
              onChange={async (_event, selected) => {
                if (selected) {
                  const h = selected.getHours();
                  const m = selected.getMinutes();
                  await update({ dealer_notification_hour: h, dealer_notification_minute: m });
                  try {
                    const dealers = await api.listDealers();
                    await rescheduleDealerNotifications(dealers, {
                      enabled: prefs.dealer_notifications_enabled,
                      hour: h,
                      minute: m,
                      notifyDayBefore: prefs.dealer_notify_day_before,
                    });
                  } catch {
                    /* no-op */
                  }
                }
              }}
            />
          </View>
        </Modal>
      )}

    </SafeAreaView>
  );
}

const homeRowsModalStyles = themedStyles((c) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: c.bgSecondary,
    padding: 20,
    borderTopWidth: 2,
    borderTopColor: c.accent,
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  title: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
  },
  help: {
    color: c.textMuted,
    fontSize: 10,
    marginVertical: 12,
    lineHeight: 14,
  },
  doneBtn: {
    marginTop: 16,
    backgroundColor: c.accent,
    height: 48,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  doneBtnText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 2,
    fontSize: 12,
  },
}));


const pwStyles = themedStyles((c) => ({
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
    backgroundColor: c.bgSecondary,
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: c.border,
  
    ...(theme.elevation.md as object),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  title: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  label: {
    color: c.textSecondary,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 6,
  },
  input: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: c.textPrimary,
    fontSize: 10,
  
    ...(theme.elevation.input as object),
  },
  err: {
    color: c.danger,
    fontSize: 9,
    marginTop: 10,
  },
  ok: {
    color: "#27AE60",
    fontSize: 9,
    marginTop: 10,
  },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: c.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#000",
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 10,
  },
}));

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: { color: c.textPrimary, fontSize: 14, fontWeight: "900", letterSpacing: 2.5 },
  subtitle: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  versionLine: {
    color: c.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: 4,
  },
  proBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 6,
  },
  proBadgeText: {
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  sectionLabel: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: c.bgSecondary,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    ...(theme.elevation.md as object),
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    backgroundColor: c.bgSecondary,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    ...(theme.elevation.md as object),
  },
  iconBox: {
    width: 36,
    height: 36,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  rowTitle: { color: c.textPrimary, fontWeight: "700", fontSize: 11 },
  rowSub: { color: c.textSecondary, fontSize: 9, marginTop: 2 },
  timeValue: {
    color: c.accent,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  timeModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  timeModalSheet: {
    backgroundColor: c.bg,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  timeModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  timeModalTitle: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 1,
  },
  timeModalCancel: {
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  timeModalDone: {
    color: c.accent,
    fontSize: 13,
    fontWeight: "800",
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: c.accent,
    paddingHorizontal: 7,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  badgeText: {
    color: "#000",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  homeRowsCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: c.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.borderSubtle,
  
    ...(theme.elevation.md as object),
  },
  homeRowsTitle: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  homeRowsHelp: {
    color: c.textSecondary,
    fontSize: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  homeRowToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
  },
  homeRowMoveCol: {
    flexDirection: "column",
    gap: 2,
  },
  homeRowMoveBtn: {
    width: 26,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 4,
    backgroundColor: c.bg,
  },
  homeRowToggleLabel: {
    flex: 1,
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "600",
  },
}));
