import { useState, useCallback, useEffect, useRef, ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Linking,
} from "react-native";
import { AppSwitch } from "../../src/components/AppSwitch";
import { getIntroVideoEnabledAsync, setIntroVideoEnabled } from "../../src/idle";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
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
import {
  demoStyles,
  homeRowsModalStyles,
  pwStyles,
  styles,
} from "../../src/screens/more/moreStyles";
import { BevelCard } from "../../src/components/BevelCard";
import { IndustrialBanner } from "../../src/components/IndustrialBanner";
import ReportBugBadge from "../../src/components/ReportBugBadge";
import { SKIN, CAP } from "../../src/tbv/skins";
import TbvFrame from "../../src/tbv/components/TbvFrame";

import NotificationsSettingsSection from "../../src/sections/NotificationsSettingsSection";

// Fixed brand hues for the two industrial themes. Per the user spec these
// labels MUST always render in their signature colour regardless of the active
// theme: "Iron Forge" in orange, "Crimson Steel" in pink.
const IRON_ORANGE = "#FF6A00";
const CRIMSON_PINK = "#FF1A6B";
const ARCTIC_AQUA = "#1FC3E8";
const EMERALD_GREEN = "#16C871";

// The 4 appearance choices shown in the Theme accordion. `color` (when set)
// forces the label + icon + active radio to that fixed hue across all themes.
const APPEARANCE_OPTIONS = [
  {
    id: "industrial",
    icon: "construct",
    title: "Iron Forge",
    sub: "Textured metal panels · orange glow",
    color: IRON_ORANGE,
  },
  {
    id: "industrial-pink",
    icon: "color-wand",
    title: "Crimson Steel",
    sub: "Same metal panels · pink glow",
    color: CRIMSON_PINK,
  },
  {
    id: "industrial-arctic",
    icon: "snow",
    title: "Arctic",
    sub: "Same metal panels · aqua-blue glow",
    color: ARCTIC_AQUA,
  },
  {
    id: "industrial-emerald",
    icon: "leaf",
    title: "Emerald",
    sub: "Same metal panels · Irish-green glow",
    color: EMERALD_GREEN,
  },
  {
    id: "light",
    icon: "sunny",
    title: "Plain · Light",
    sub: "No skins · soft grey-blue, dark text",
    color: undefined as string | undefined,
  },
  {
    id: "dark",
    icon: "moon",
    title: "Plain · Dark",
    sub: "No skins · flat dark cards",
    color: undefined as string | undefined,
  },
] as const;

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
}) => {
  const { skin } = useSkin();
  const isIndustrial = skin === "industrial";
  return (
    <View style={styles.sectionCardWrap}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {isIndustrial ? (
        <TbvFrame
          source={SKIN.window}
          capInsets={CAP.window}
          padX={30}
          padTop={22}
          padBottom={22}
          testID={testID}
        >
          {children}
        </TbvFrame>
      ) : (
        <View style={styles.sectionCard} testID={testID}>
          {children}
        </View>
      )}
    </View>
  );
};


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
  const [homeRowsModal, setHomeRowsModal] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const { appearance, setAppearance, skin } = useSkin();
  const isIndustrial = skin === "industrial";

  // Deep-link from the new-account "choose your theme" popup. When arriving
  // with ?openTheme=1, pre-open the Theme accordion and scroll to it.
  const params = useLocalSearchParams<{ openTheme?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const settingsYRef = useRef(0);
  const themeParamHandledRef = useRef(false);
  useEffect(() => {
    if (params?.openTheme === "1" && !themeParamHandledRef.current) {
      themeParamHandledRef.current = true;
      setThemeOpen(true);
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: Math.max(settingsYRef.current - 12, 0),
          animated: true,
        });
      }, 400);
    }
  }, [params?.openTheme]);

  // Intro-video preference (device-level). Default ON.
  const [introVideoOn, setIntroVideoOn] = useState(true);
  useEffect(() => {
    getIntroVideoEnabledAsync().then(setIntroVideoOn);
  }, []);
  const onToggleIntroVideo = useCallback((v: boolean) => {
    setIntroVideoOn(v);
    setIntroVideoEnabled(v);
  }, []);

  // Subscription + admin gates.
  const [sub, setSub] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Prefilled Demo System — show the "Delete Prefilled Information" row only
  // while seeded demo data is still present on the account.
  const [demoPresent, setDemoPresent] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoConfirmOpen, setDemoConfirmOpen] = useState(false);
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
    try {
      const ds = await api.demoStatus({ forceFresh: true });
      setDemoPresent(!!ds?.present);
    } catch {
      setDemoPresent(false);
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

  // Prefilled Demo System — wipe the seeded demo data. `mode` is either
  // "everything" (also removes dealers/locations/tags/categories for a blank
  // app) or "keep_taxonomy" (keeps that setup, removes only demo records).
  const runClearDemo = useCallback(async (mode: "everything" | "keep_taxonomy") => {
    setDemoBusy(true);
    try {
      await api.demoClear(mode);
      setDemoPresent(false);
      Alert.alert(
        "Demo Data Removed",
        mode === "everything"
          ? "All sample data — including dealers, locations, tags & categories — has been deleted. You now have a blank app."
          : "Sample tools, claims and other demo records were removed. Your dealers, locations, tags & categories were kept.",
      );
    } catch {
      Alert.alert("Couldn't Remove Demo Data", "Something went wrong. Please try again.");
    } finally {
      setDemoBusy(false);
    }
  }, []);

  const promptClearDemo = useCallback(() => {
    setDemoConfirmOpen(true);
  }, []);

  const chooseClearDemo = useCallback(
    (mode: "everything" | "keep_taxonomy") => {
      setDemoConfirmOpen(false);
      runClearDemo(mode);
    },
    [runClearDemo],
  );

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

  // Metadata (label + signature colour) for the currently-active theme, shown
  // in the collapsed Theme accordion row.
  const currentAppearanceMeta =
    APPEARANCE_OPTIONS.find((o) => o.id === appearance) || APPEARANCE_OPTIONS[0];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <IndustrialBanner
        title={isPro ? "VAULT - SUBSCRIBED" : "VAULT"}
        subtitle={user?.email || "Manage everything"}
      />
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 100, paddingTop: 8 }}>
        <SectionCard title="RESOURCES" testID="more-section-system">
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

        <SectionCard title="ORGANIZATION" testID="more-section-organization">
          <SectionRow
            icon="cube"
            title="Sets & Bundles"
            subtitle="Group items into sets with a set price"
            testID="more-bundles"
            onPress={() => router.push("/bundle")}
          />
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

        <SectionCard title="DATA MANAGEMENT" testID="more-section-import-export">
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

        <SectionCard title="INSURANCE CLAIMS" testID="more-section-insurance">
          <SectionRow
            icon="shield-checkmark"
            title="Insurance Claims"
            subtitle="Document losses & generate insurance reports"
            testID="more-insurance-claims"
            onPress={() => router.push("/insurance-claims" as any)}
            isLast
          />
        </SectionCard>

        <NotificationsSettingsSection prefs={prefs} update={update} />

        {/* Position marker so ?openTheme can scroll the Theme accordion into view. */}
        <View
          onLayout={(e) => {
            settingsYRef.current = e.nativeEvent.layout.y;
          }}
        />
        {/* SETTINGS — theme, home layout & home banners. */}
        <SectionCard title="SETTINGS" testID="more-section-customize">
          {/* Theme — accordion row; expands to a grouped card of choices. */}
          <SectionRow
            icon="color-palette"
            title="Theme"
            subtitle="Choose the app's look & feel"
            testID="theme-accordion-row"
            onPress={() => setThemeOpen((o) => !o)}
            isLast={!themeOpen}
            rightSlot={
              <View style={styles.themeValueWrap}>
                <Text
                  style={[
                    styles.themeValueText,
                    currentAppearanceMeta.color ? { color: currentAppearanceMeta.color } : null,
                  ]}
                  numberOfLines={1}
                >
                  {currentAppearanceMeta.title}
                </Text>
                <Ionicons
                  name={themeOpen ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={theme.colors.textMuted}
                />
              </View>
            }
          />
          {themeOpen && (
            <View style={[styles.optGroup, isIndustrial && styles.optGroupFlat]}>
              {APPEARANCE_OPTIONS.map((opt) => {
                const active = appearance === opt.id;
                const tint = opt.color || theme.colors.accent;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    testID={`appearance-${opt.id}`}
                    activeOpacity={0.7}
                    style={[styles.optRowGrouped, active && styles.optRowGroupedActive]}
                    onPress={() => setAppearance(opt.id)}
                  >
                    <View style={styles.iconBox}>
                      <Ionicons name={opt.icon} size={18} color={tint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, opt.color ? { color: opt.color } : null]}>
                        {opt.title}
                      </Text>
                      <Text style={styles.rowSub}>{opt.sub}</Text>
                    </View>
                    <Ionicons
                      name={active ? "radio-button-on" : "radio-button-off"}
                      size={20}
                      color={active ? tint : theme.colors.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Home layout */}
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
              <AppSwitch
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
              <AppSwitch
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
              <AppSwitch
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
              <AppSwitch
                testID="toggle-warranty-alerts"
                value={prefs.warranty_alerts}
                onValueChange={(v) => update({ warranty_alerts: v })}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                thumbColor="#fff"
              />
            }
          />
          <SectionRow
            icon="film"
            title="Intro Video"
            subtitle="Play the splash video when the app starts"
            isLast
            rightSlot={
              <AppSwitch
                testID="toggle-intro-video"
                value={introVideoOn}
                onValueChange={onToggleIntroVideo}
                trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                thumbColor="#fff"
              />
            }
          />
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
            title={isPro ? "Membership" : "Upgrade to PRO"}
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
                <AppSwitch
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
          {demoPresent && (
            <SectionRow
              icon="sparkles"
              iconColor={theme.colors.accent}
              title="Delete Prefilled Information"
              subtitle={
                demoBusy
                  ? "Removing sample data…"
                  : "Remove the sample/demo data added when you signed up"
              }
              testID="more-delete-demo"
              onPress={demoBusy ? undefined : promptClearDemo}
            />
          )}
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

        {/* Report a bug — industrial badge image, pinned to the very bottom */}
        <ReportBugBadge style={{ marginTop: 14 }} testID="more-feedback" />
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
                    <AppSwitch
                      testID={`home-row-${k}`}
                      value={prefs.home_rows[k]}
                      onValueChange={(v) =>
                        update({ home_rows: { ...prefs.home_rows, [k]: v } })
                      }
                      style={{ transform: [{ scale: 0.78 }] }}
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

      {/* Delete Prefilled Information — choice modal (web-parity for the
          3-option Alert: keep setup vs wipe everything). */}
      <Modal
        visible={demoConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDemoConfirmOpen(false)}
      >
        <View style={demoStyles.backdrop}>
          <View style={demoStyles.card} testID="demo-clear-modal">
            <View style={demoStyles.header}>
              <Ionicons name="sparkles" size={20} color={theme.colors.accent} />
              <Text style={demoStyles.title}>DELETE PREFILLED INFO</Text>
              <TouchableOpacity
                onPress={() => setDemoConfirmOpen(false)}
                hitSlop={10}
                testID="demo-clear-close"
              >
                <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={demoStyles.body}>
              Choose how much of the sample data to remove. This can&apos;t be
              undone.
            </Text>

            <TouchableOpacity
              testID="demo-clear-keep"
              style={demoStyles.optBtn}
              activeOpacity={0.85}
              onPress={() => chooseClearDemo("keep_taxonomy")}
            >
              <Ionicons name="albums-outline" size={18} color={theme.colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={demoStyles.optTitle}>Keep My Setup</Text>
                <Text style={demoStyles.optSub}>
                  Remove demo tools, claims & contacts — keep dealers, locations,
                  tags & categories
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              testID="demo-clear-everything"
              style={demoStyles.optBtn}
              activeOpacity={0.85}
              onPress={() => chooseClearDemo("everything")}
            >
              <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={[demoStyles.optTitle, { color: theme.colors.danger }]}>
                  Remove Everything
                </Text>
                <Text style={demoStyles.optSub}>
                  Wipe all sample data including dealers, locations, tags &
                  categories — start with a blank app
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              testID="demo-clear-cancel"
              style={demoStyles.cancelBtn}
              activeOpacity={0.85}
              onPress={() => setDemoConfirmOpen(false)}
            >
              <Text style={demoStyles.cancelText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>


    </SafeAreaView>
  );
}
