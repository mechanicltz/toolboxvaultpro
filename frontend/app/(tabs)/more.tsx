import { useState, useCallback, useEffect, useRef, ReactNode } from "react";
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
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useAppResume } from "../../src/appLifecycle";
import { theme } from "../../src/theme";
import { useSkin } from "../../src/themeContext";import {
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
import { IndustrialBanner } from "../../src/components/IndustrialBanner";

import {
  requestPermissions as requestNotificationPermissions,
  rescheduleDealerNotifications,
  cancelDealerNotifications,
  sendTestNotification,
} from "../../src/notifications";
import {
  rescheduleAllBorrowReminders,
  cancelAllBorrowReminders,
} from "../../src/borrowReminders";

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

/* ---------------- Description-card grouping for the More screen ----------------
   Each named section (System / Import-Export / Organization / Customize /
   Notifications / Account) gets wrapped in a single bordered card. Rows
   inside are stacked with thin dividers between them. Mirrors the
   "Description Card" pattern used on the Home, Tool detail, and Dealer
   detail screens. */
type SectionRowProps = {
  icon: any;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  testID?: string;
  isLast?: boolean;
  rightSlot?: ReactNode;
  titleColor?: string;
  iconColor?: string;
  badge?: number;
  badgeColor?: string;
};

const SectionRow = ({
  icon,
  title,
  subtitle,
  onPress,
  testID,
  isLast,
  rightSlot,
  titleColor,
  iconColor,
  badge,
  badgeColor,
}: SectionRowProps) => {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  const wrapperProps = onPress ? { onPress, activeOpacity: 0.6 } : {};
  return (
    <Wrapper
      testID={testID}
      style={[styles.sectionRow, isLast && styles.sectionRowLast]}
      {...wrapperProps}
    >
      <View style={styles.sectionRowIcon}>
        <Ionicons
          name={icon}
          size={18}
          color={iconColor || theme.colors.accent}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[styles.sectionRowTitle, titleColor ? { color: titleColor } : null]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.sectionRowSub} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
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
      {rightSlot
        ? rightSlot
        : onPress && (
            <Ionicons
              name="chevron-forward"
              size={16}
              color={theme.colors.textMuted}
            />
          )}
    </Wrapper>
  );
};

const SectionCard = ({
  title,
  children,
  testID,
}: {
  title: string;
  children: ReactNode;
  testID?: string;
}) => (
  <View style={styles.sectionCardWrap}>
    <Text style={styles.sectionLabel}>{title}</Text>
    <View style={styles.sectionCard} testID={testID}>
      {children}
    </View>
  </View>
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
  const [borrowPeriodPickerOpen, setBorrowPeriodPickerOpen] = useState(false);
  // Local edit state for the "Custom" picker (number of days). Only used while
  // the user is typing inside the modal.
  const [customDaysInput, setCustomDaysInput] = useState("");
  const [homeRowsModal, setHomeRowsModal] = useState(false);
  const { appearance, setAppearance } = useSkin();

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

  // ---------- Borrow reminder period helpers ----------
  // Preset choices the user can pick from in the period modal. Each entry's
  // `hours` is what gets persisted into prefs.borrow_reminder_hours.
  const BORROW_PRESETS: Array<{ hours: number; label: string }> = [
    { hours: 12, label: "12 hours" },
    { hours: 24, label: "1 day" },
    { hours: 48, label: "2 days" },
    { hours: 72, label: "3 days" },
    { hours: 96, label: "4 days" },
    { hours: 120, label: "5 days" },
    { hours: 144, label: "6 days" },
    { hours: 168, label: "1 week" },
    { hours: 336, label: "2 weeks" },
    { hours: 504, label: "3 weeks" },
    { hours: 720, label: "1 month" },
  ];

  // Pretty-format hours back to the closest preset label, or "X days" for
  // custom values that don't match a preset exactly.
  const formatBorrowPeriod = (hours: number): string => {
    const preset = BORROW_PRESETS.find((p) => p.hours === hours);
    if (preset) return preset.label;
    if (hours < 24) return `${hours} hours`;
    const days = hours / 24;
    if (Number.isInteger(days)) return `${days} days`;
    return `${days.toFixed(1)} days`;
  };

  // Apply a new reminder period — saves to prefs AND re-schedules every
  // currently-checked-out tool so existing checkouts use the new cadence.
  const applyBorrowPeriod = async (hours: number) => {
    if (!Number.isFinite(hours) || hours < 1) return;
    await update({ borrow_reminder_hours: hours });
    setBorrowPeriodPickerOpen(false);
    setCustomDaysInput("");
    if (prefs.borrow_reminders_enabled) {
      try {
        const tools = await api.listTools();
        await rescheduleAllBorrowReminders(tools, {
          enabled: true,
          reminderHours: hours,
        });
      } catch { /* offline ok */ }
    }
  };

  // ---------- Home Screen Logo customization helpers ----------
  // Resizes the picked image to fit within 512x512 max, JPEG @ 80%, and
  // stores the resulting base64 data URI in prefs. Keeping the saved blob
  // small is essential since AsyncStorage is a single-string store — a
  // multi-MB photo would slow down every prefs read.
  const saveResizedLogo = useCallback(
    async (uri: string) => {
      try {
        const result = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 512 } }],
          {
            compress: 0.8,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          },
        );
        if (!result.base64) throw new Error("No image data returned");
        const dataUri = `data:image/jpeg;base64,${result.base64}`;
        await update({
          home_logo_mode: "custom",
          home_logo_data: dataUri,
        });
      } catch (e: any) {
        Alert.alert(
          "Couldn't set logo",
          e?.message || "Try a different image.",
        );
      }
    },
    [update],
  );

  const pickHomeLogoFromLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "Allow Photo Library access in your device settings to pick a logo.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    await saveResizedLogo(result.assets[0].uri);
  }, [saveResizedLogo]);

  const takeHomeLogoPhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "Allow Camera access in your device settings to take a logo photo.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    await saveResizedLogo(result.assets[0].uri);
  }, [saveResizedLogo]);

  // Open the logo-customization action sheet. Choices are: pick from
  // Library, take a Camera photo, or remove the logo entirely. (No
  // "Reset to Default" since there is no bundled default image.)
  const openHomeLogoMenu = useCallback(() => {
    Alert.alert(
      "Home Screen Logo",
      "Pick an image to display at the top of the Home tab.",
      [
        { text: "Choose from Library", onPress: pickHomeLogoFromLibrary },
        { text: "Take Photo", onPress: takeHomeLogoPhoto },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            update({ home_logo_mode: "hidden", home_logo_data: null }),
        },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true },
    );
  }, [pickHomeLogoFromLibrary, takeHomeLogoPhoto, update]);

  // Friendly subtitle for the Home Screen Logo row — tells the user the
  // current state without having to open the action sheet first.
  const logoSubtitle = (() => {
    if (prefs.home_logo_mode === "custom" && prefs.home_logo_data) {
      return "Showing your custom logo";
    }
    return "No logo set — tap to add one";
  })();

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
      <IndustrialBanner
        title="TOOLBOX VAULT"
        subtitle={user?.email || "Manage everything"}
      />
      <View style={styles.infoRow}>
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
        {/* APPEARANCE — choose the app's presentation:
            • Industrial Skin (textured metal look, no light/dark)
            • Plain · Light / Plain · Dark (flat cards, pick a mode)
            Placed at the top of More so it's easy to find. */}
        <View style={styles.appearanceCard}>
          <View style={styles.appearanceHeader}>
            <Ionicons name="color-palette" size={18} color={theme.colors.accent} />
            <Text style={styles.appearanceTitle}>APPEARANCE</Text>
          </View>

          {/* 4 appearance options. `appearance` + `setAppearance` resolve the
              skin + light/dark + industrial colour-variant atomically so the
              palette and PNG skin art always switch together in one pass. */}
          {([
            {
              id: "industrial",
              icon: "construct",
              title: "Industrial · Orange",
              sub: "Textured metal panels · orange glow",
            },
            {
              id: "industrial-pink",
              icon: "color-wand",
              title: "Industrial · Pink",
              sub: "Same metal panels · pink glow",
            },
            {
              id: "light",
              icon: "sunny",
              title: "Plain · Light",
              sub: "No skins · soft grey-blue, dark text",
            },
            {
              id: "dark",
              icon: "moon",
              title: "Plain · Dark",
              sub: "No skins · flat dark cards",
            },
          ] as const).map((opt, idx, arr) => {
            const active = appearance === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                testID={`appearance-${opt.id}`}
                activeOpacity={0.7}
                style={[
                  styles.optRow,
                  idx === arr.length - 1 && styles.optRowLast,
                  active && styles.optRowActive,
                ]}
                onPress={() => setAppearance(opt.id)}
              >
                <View style={styles.iconBox}>
                  <Ionicons name={opt.icon} size={18} color={theme.colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{opt.title}</Text>
                  <Text style={styles.rowSub}>{opt.sub}</Text>
                </View>
                <Ionicons
                  name={active ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={active ? theme.colors.accent : theme.colors.textMuted}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        <Row
          icon="chatbubble-ellipses"
          title="Report a Bug · Request a Feature"
          subtitle="Send feedback directly to the developers"
          testID="more-feedback"
          onPress={() => router.push("/feedback")}
        />

        <SectionCard title="SYSTEM" testID="more-section-system">
          <SectionRow
            icon="heart"
            title="Wish List"
            subtitle="Saved links to tools you want"
            testID="more-wishlist"
            onPress={() => router.push("/wishlist")}
          />
          <SectionRow
            icon="pricetag"
            title="Inventory for Sale"
            subtitle="List items, mark as sold, sale & sold reports"
            testID="more-for-sale"
            onPress={() => router.push("/for-sale")}
          />
          <SectionRow
            icon="shield-checkmark"
            title="Warranty Alerts"
            subtitle="Expiring & expired warranties"
            testID="more-warranty"
            onPress={() => router.push("/warranty")}
          />
          <SectionRow
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
            isLast
          />
        </SectionCard>

        <SectionCard title="IMPORT / EXPORT" testID="more-section-import-export">
          <SectionRow
            icon="document-text"
            title="Reports"
            subtitle="PDF / CSV exports & saved presets"
            testID="more-reports"
            onPress={() => router.push("/reports")}
          />
          <SectionRow
            icon="swap-horizontal"
            title="Import / Export Database"
            subtitle="Bulk-upload tools or back up to a spreadsheet"
            testID="more-import-export"
            onPress={() => router.push("/import-export" as any)}
            isLast
          />
        </SectionCard>

        <SectionCard title="ORGANIZATION" testID="more-section-organization">
          <SectionRow
            icon="folder"
            title="Categories"
            subtitle="Manage tool categories"
            testID="more-categories"
            onPress={() => router.push("/manage/categories")}
          />
          <SectionRow
            icon="pricetag"
            title="Tags"
            subtitle="Manage tags"
            testID="more-tags"
            onPress={() => router.push("/manage/tags")}
          />
          <SectionRow
            icon="location"
            title="Locations"
            subtitle="Nested storage hierarchy"
            testID="more-locations"
            onPress={() => router.push("/locations")}
            isLast
          />
        </SectionCard>

        <SectionCard title="CUSTOMIZE" testID="more-section-customize">
          <SectionRow
            icon="image"
            title="Home Screen Logo"
            subtitle={logoSubtitle}
            testID="more-home-logo"
            onPress={openHomeLogoMenu}
          />
          <SectionRow
            icon="grid"
            title="Home Screen Rows"
            subtitle="Choose which rows show on Home & reorder them"
            testID="more-home-rows"
            onPress={() => setHomeRowsModal(true)}
          />
          <SectionRow
            icon="cash"
            title="Show prices in lists"
            subtitle="Hide $ amounts everywhere"
            rightSlot={
              <Switch
                testID="toggle-prices"
                value={prefs.show_prices}
                onValueChange={(v) => update({ show_prices: v })}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                thumbColor="#fff"
              />
            }
          />
          <SectionRow
            icon="stats-chart"
            title="Detail summary headers"
            subtitle="Show counts/breakdowns on lists"
            rightSlot={
              <Switch
                testID="toggle-summary"
                value={prefs.show_details_summary}
                onValueChange={(v) => update({ show_details_summary: v })}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                thumbColor="#fff"
              />
            }
          />
          <SectionRow
            icon="map"
            title="Next dealer-route banner"
            subtitle="Show the highlighted reminder at the top of the home screen"
            rightSlot={
              <Switch
                testID="toggle-dealer-route-banner"
                value={prefs.show_dealer_route_reminder}
                onValueChange={(v) => update({ show_dealer_route_reminder: v })}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                thumbColor="#fff"
              />
            }
          />
          <SectionRow
            icon="notifications"
            title="Warranty Expiring Alerts"
            subtitle="Banner on inventory tab"
            rightSlot={
              <Switch
                testID="toggle-warranty-alerts"
                value={prefs.warranty_alerts}
                onValueChange={(v) => update({ warranty_alerts: v })}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                thumbColor="#fff"
              />
            }
            isLast
          />
        </SectionCard>

        <SectionCard title="NOTIFICATIONS" testID="more-section-notifications">
          <SectionRow
            icon="notifications"
            title="Dealer route reminders"
            subtitle="Local notification when a tool dealer is scheduled to visit"
            testID="notif-toggle-row"
            isLast={!prefs.dealer_notifications_enabled}
            rightSlot={
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
            }
          />
          {prefs.dealer_notifications_enabled && (
            <>
              <SectionRow
                icon="time"
                title="Reminder time"
                subtitle="When to send the reminder on dealer-visit days"
                testID="notif-time-row"
                onPress={() => setTimePickerOpen(true)}
                rightSlot={
                  <Text style={styles.timeValue}>
                    {formatHourMinute(
                      prefs.dealer_notification_hour,
                      prefs.dealer_notification_minute,
                    )}
                  </Text>
                }
              />
              <SectionRow
                icon="calendar"
                title="Also remind day before"
                subtitle="Get a heads-up reminder the day before too"
                rightSlot={
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
                }
              />
            </>
          )}
          {/* ------- Borrowed-tool overdue reminders (new 2026-05-26) ------ */}
          <SectionRow
            icon="time"
            title="Borrowed-tool overdue reminders"
            subtitle="Notify me when a tool I checked out is still out"
            testID="notif-borrow-toggle-row"
            isLast={!prefs.borrow_reminders_enabled}
            rightSlot={
              <Switch
                value={prefs.borrow_reminders_enabled}
                onValueChange={async (v) => {
                  if (v) {
                    const granted = await requestNotificationPermissions();
                    if (!granted) {
                      Alert.alert(
                        "Permission needed",
                        "To remind you about checked-out tools, please allow notifications for this app in your device settings.",
                      );
                      return;
                    }
                    await update({ borrow_reminders_enabled: true });
                    try {
                      const tools = await api.listTools();
                      await rescheduleAllBorrowReminders(tools, {
                        enabled: true,
                        reminderHours: prefs.borrow_reminder_hours || 24,
                      });
                    } catch { /* offline ok */ }
                  } else {
                    await update({ borrow_reminders_enabled: false });
                    await cancelAllBorrowReminders();
                  }
                }}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                thumbColor="#fff"
              />
            }
          />
          {prefs.borrow_reminders_enabled && (
            <SectionRow
              icon="hourglass"
              title="Reminder period"
              subtitle="How often to remind you while a tool is checked out"
              testID="notif-borrow-period-row"
              isLast
              onPress={() => setBorrowPeriodPickerOpen(true)}
              rightSlot={
                <Text style={styles.timeValue}>
                  {formatBorrowPeriod(prefs.borrow_reminder_hours)}
                </Text>
              }
            />
          )}
          {/* ------- TEST notification — moved OUT of the dealer-only block so
              it shows whenever ANY notification toggle is on, per user spec. */}
          {(prefs.dealer_notifications_enabled || prefs.borrow_reminders_enabled) && (
            <SectionRow
              icon="paper-plane"
              title="Send a test notification"
              subtitle="Fires in 5 seconds — confirms permissions are working"
              testID="notif-test-row"
              isLast
              onPress={async () => {
                const ok = await sendTestNotification();
                if (ok) {
                  Alert.alert(
                    "Test scheduled",
                    "A test notification will appear in about 5 seconds. If your phone is on silent or Do Not Disturb is on, you\'ll see it in Notification Center.",
                  );
                } else {
                  Alert.alert(
                    "Permission needed",
                    "Please enable notifications for this app in your device settings.",
                  );
                }
              }}
            />
          )}
        </SectionCard>

        <SectionCard title="ACCOUNT" testID="more-section-account">
          <SectionRow
            icon="person-circle"
            title="Personal Information"
            subtitle="Name, address, phone, insurance — used in reports"
            testID="more-personal-info"
            onPress={() => router.push("/personal-info")}
          />
          <SectionRow
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
            <SectionRow
              icon="cloud-download-outline"
              title="Admin · Database Backups"
              subtitle="Daily auto-backups · Google Drive sync · 30-day retention"
              testID="more-admin-backups"
              onPress={() => router.push("/admin/backups")}
            />
          )}
          <SectionRow
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
          {bioStatus && bioStatus.hasHardware ? (
            <SectionRow
              icon={
                bioStatus.label.toLowerCase().includes("face")
                  ? "scan"
                  : bioStatus.label.toLowerCase().includes("touch") ||
                    bioStatus.label.toLowerCase().includes("finger")
                  ? "finger-print"
                  : "lock-closed"
              }
              title={`${bioStatus.label} Sign-In`}
              subtitle={
                !bioStatus.isEnrolled
                  ? `Set up ${bioStatus.label} in your device settings first`
                  : bioStatus.enabled
                  ? `Auto-unlock the app with ${bioStatus.label}`
                  : `Skip the password — sign in with ${bioStatus.label}`
              }
              testID="more-biometric-toggle"
              rightSlot={
                <Switch
                  testID="toggle-biometric"
                  value={bioStatus.enabled}
                  disabled={!bioStatus.isEnrolled}
                  onValueChange={handleToggleBiometric}
                  trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                  thumbColor="#fff"
                />
              }
            />
          ) : null}
          <SectionRow
            icon="document-text"
            title="Terms of Use"
            subtitle="EULA · subscription terms"
            testID="more-terms"
            onPress={() =>
              Linking.openURL(
                "https://mechanicltz.github.io/toolboxvault-legal/terms.html",
              )
            }
          />
          <SectionRow
            icon="lock-closed"
            title="Privacy Policy"
            subtitle="How we handle your data"
            testID="more-privacy"
            onPress={() =>
              Linking.openURL(
                "https://mechanicltz.github.io/toolboxvault-legal/privacy.html",
              )
            }
          />
          <SectionRow
            icon="log-out"
            iconColor={theme.colors.danger}
            titleColor={theme.colors.danger}
            title="Sign Out"
            subtitle={user?.email || ""}
            testID="more-logout"
            onPress={() => logout()}
          />
          <SectionRow
            icon="skull"
            iconColor={theme.colors.danger}
            titleColor={theme.colors.danger}
            title="Delete Account"
            subtitle="Permanently destroy your account and all data"
            testID="more-delete-account"
            isLast
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
          />
        </SectionCard>
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

      {/* ===== Borrow reminder period picker ============================ */}
      <Modal
        visible={borrowPeriodPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBorrowPeriodPickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.timeModalBackdrop}
          activeOpacity={1}
          onPress={() => setBorrowPeriodPickerOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.timeModalSheet, { maxHeight: "85%" }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.timeModalHeader}>
              <Text style={styles.timeModalTitle}>REMINDER PERIOD</Text>
              <TouchableOpacity onPress={() => setBorrowPeriodPickerOpen(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 460 }}>
              {BORROW_PRESETS.map((p) => {
                const active = prefs.borrow_reminder_hours === p.hours;
                return (
                  <TouchableOpacity
                    key={p.hours}
                    style={[
                      styles.periodOptionRow,
                      active && styles.periodOptionRowActive,
                    ]}
                    onPress={() => applyBorrowPeriod(p.hours)}
                  >
                    <Text
                      style={[
                        styles.periodOptionLabel,
                        active && { color: theme.colors.accent, fontWeight: "900" },
                      ]}
                    >
                      {p.label}
                    </Text>
                    {active && (
                      <Ionicons name="checkmark" size={18} color={theme.colors.accent} />
                    )}
                  </TouchableOpacity>
                );
              })}
              {/* Custom days input — accepts any positive number */}
              <View style={[styles.periodOptionRow, { flexDirection: "column", alignItems: "stretch", gap: 8 }]}>
                <Text style={styles.periodOptionLabel}>Custom (number of days)</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput
                    testID="borrow-custom-days"
                    placeholder="e.g. 10"
                    placeholderTextColor={theme.colors.textMuted}
                    value={customDaysInput}
                    onChangeText={(v) => setCustomDaysInput(v.replace(/[^0-9]/g, ""))}
                    keyboardType="number-pad"
                    style={{
                      flex: 1,
                      backgroundColor: theme.colors.surface,
                      color: theme.colors.textPrimary,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                  />
                  <TouchableOpacity
                    style={{
                      backgroundColor: theme.colors.accent,
                      borderRadius: 8,
                      paddingHorizontal: 16,
                      justifyContent: "center",
                    }}
                    onPress={() => {
                      const days = parseInt(customDaysInput || "0", 10);
                      if (days > 0) applyBorrowPeriod(days * 24);
                    }}
                  >
                    <Text style={{ color: "#000", fontWeight: "900" }}>SET</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

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
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
    flexWrap: "wrap",
  },
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

  /* ---------- Description-card grouping wrappers for each MORE section ---------- */
  // Outer wrapper provides horizontal margin so the card edges align with
  // existing screens. Inside it sits the section label + a single bordered
  // box. (Each section now reads as ONE consolidated card instead of N
  // separate floating row-cards — see "Description Cards" pattern used on
  // Home/Tool/Dealer screens.)
  sectionCardWrap: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  sectionCard: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    ...(theme.elevation.md as object),
  },
  // Each row inside a section card. Thin bottom divider between siblings
  // (removed for the last row via `sectionRowLast`).
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  sectionRowLast: {
    borderBottomWidth: 0,
  },
  sectionRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
  },
  sectionRowTitle: {
    color: c.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  sectionRowSub: {
    color: c.textSecondary,
    fontSize: 9,
    marginTop: 2,
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
  // ---- Appearance selector (skin + light/dark) ----
  appearanceCard: {
    backgroundColor: c.bgSecondary,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    overflow: "hidden",
    ...(theme.elevation.md as object),
  },
  appearanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  appearanceTitle: {
    color: c.textSecondary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  optRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
  },
  optRowLast: {},
  optRowActive: {
    backgroundColor: c.glass,
  },
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
  // Reminder-period picker rows (Borrow-Reminder modal)
  periodOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  periodOptionRowActive: {
    backgroundColor: "rgba(237, 126, 44, 0.08)",
  },
  periodOptionLabel: {
    color: c.textPrimary,
    fontSize: 15,
    fontWeight: "600",
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
