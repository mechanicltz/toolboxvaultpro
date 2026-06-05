/**
 * NotificationsSettingsSection
 * ----------------------------
 * Extracted from more.tsx to keep the Settings screen lean. Renders the whole
 * NOTIFICATIONS card:
 *
 *   • A MASTER notification toggle. Turning it ON requests the native OS
 *     notification permission (contextually, on user intent). If the user
 *     denies / has blocked notifications, we surface an "Open Settings" button
 *     instead of silently failing.
 *   • While the master is ON, an accordion reveals every notification TYPE,
 *     each with its own toggle + per-type settings (time / day-before /
 *     reminder period).
 *   • A "Send a test notification" row that stays GRAYED OUT until the master
 *     switch is ON.
 *
 * All scheduling is local-only (expo-notifications) — see notifications.ts.
 * NOTE: local notifications cannot be validated in Expo Go web preview; a real
 * device build is required to see them actually fire.
 */
import React, { useState, ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  Linking,
} from "react-native";
import * as Notifications from "expo-notifications";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import { themedStyles } from "../themeContext";
import { api } from "../api";
import { Prefs } from "../prefs";
import {
  requestPermissions as requestNotificationPermissions,
  getPermissionStatus,
  rescheduleDealerNotifications,
  reschedulePaymentRemindersNow,
  cancelDealerNotifications,
  cancelPaymentReminders,
  sendTestNotification,
} from "../notifications";
import {
  rescheduleAllBorrowReminders,
  cancelAllBorrowReminders,
} from "../borrowReminders";

type Props = {
  prefs: Prefs;
  update: (p: Partial<Prefs>) => Promise<void>;
};

// ---------- Row primitives (mirror the SectionCard pattern in more.tsx) ----------
type SectionRowProps = {
  icon: any;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  testID?: string;
  isLast?: boolean;
  rightSlot?: ReactNode;
  indent?: boolean;
  disabled?: boolean;
};

const SectionRow = ({
  icon,
  title,
  subtitle,
  onPress,
  testID,
  isLast,
  rightSlot,
  indent,
  disabled,
}: SectionRowProps) => {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  const wrapperProps = onPress ? { onPress, activeOpacity: 0.6, disabled } : {};
  return (
    <Wrapper
      testID={testID}
      style={[
        styles.sectionRow,
        indent && styles.sectionRowIndent,
        isLast && styles.sectionRowLast,
        disabled && { opacity: 0.4 },
      ]}
      {...wrapperProps}
    >
      <View style={styles.sectionRowIcon}>
        <Ionicons name={icon} size={18} color={theme.colors.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.sectionRowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.sectionRowSub} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightSlot
        ? rightSlot
        : onPress && (
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
          )}
    </Wrapper>
  );
};

// ---------- Borrow reminder period presets ----------
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

export default function NotificationsSettingsSection({ prefs, update }: Props) {
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [borrowPeriodPickerOpen, setBorrowPeriodPickerOpen] = useState(false);
  const [customDaysInput, setCustomDaysInput] = useState("");

  const masterOn = prefs.notifications_master_enabled;

  // ---- formatting helpers ----
  const formatHourMinute = (h: number, m: number): string => {
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const mm = String(m).padStart(2, "0");
    return `${h12}:${mm} ${period}`;
  };

  const formatBorrowPeriod = (hours: number): string => {
    const preset = BORROW_PRESETS.find((p) => p.hours === hours);
    if (preset) return preset.label;
    if (hours < 24) return `${hours} hours`;
    const days = hours / 24;
    if (Number.isInteger(days)) return `${days} days`;
    return `${days.toFixed(1)} days`;
  };

  // ---- Permission flow (follows the handle_permissions_contract) ----
  // Shows the native prompt when allowed; if the user has denied/blocked it,
  // routes them to the OS settings screen instead of dead-ending.
  const promptOpenSettings = () => {
    Alert.alert(
      "Notifications are off",
      "To get reminders, allow notifications for Toolbox Vault in your device settings.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Open Settings", onPress: () => Linking.openSettings() },
      ],
    );
  };

  const ensurePermission = async (): Promise<boolean> => {
    // requestNotificationPermissions() sets up the Android channel, checks the
    // current status, and only fires the native prompt when canAskAgain.
    const granted = await requestNotificationPermissions();
    if (granted) return true;
    // Not granted — either denied this round or permanently blocked. Either way
    // the only path forward is the OS settings screen.
    const status = await getPermissionStatus();
    if (status !== "granted") promptOpenSettings();
    return false;
  };

  // ---- Master toggle ----
  const handleMasterToggle = async (next: boolean) => {
    if (next) {
      const ok = await ensurePermission();
      if (!ok) return; // leave master OFF — test button stays grayed
      await update({ notifications_master_enabled: true });
      // Re-arm whatever individual types were previously enabled.
      try {
        if (prefs.dealer_notifications_enabled) {
          const dealers = await api.listDealers();
          await rescheduleDealerNotifications(dealers, {
            enabled: true,
            hour: prefs.dealer_notification_hour,
            minute: prefs.dealer_notification_minute,
            notifyDayBefore: prefs.dealer_notify_day_before,
          });
        }
      } catch {
        /* offline ok */
      }
      try {
        if (prefs.borrow_reminders_enabled) {
          const tools = await api.listTools();
          await rescheduleAllBorrowReminders(tools, {
            enabled: true,
            reminderHours: prefs.borrow_reminder_hours || 24,
          });
        }
      } catch {
        /* offline ok */
      }
      if (prefs.payment_notifications_enabled) {
        reschedulePaymentRemindersNow().catch(() => {});
      }
    } else {
      await update({ notifications_master_enabled: false });
      // Master off => silence everything (keep the per-type prefs as-is).
      await cancelDealerNotifications();
      await cancelAllBorrowReminders();
      await cancelPaymentReminders();
    }
  };

  // ---- Per-type toggles ----
  const handleDealerToggle = async (v: boolean) => {
    await update({ dealer_notifications_enabled: v });
    try {
      const dealers = await api.listDealers();
      await rescheduleDealerNotifications(dealers, {
        enabled: v,
        hour: prefs.dealer_notification_hour,
        minute: prefs.dealer_notification_minute,
        notifyDayBefore: prefs.dealer_notify_day_before,
      });
    } catch {
      /* offline ok */
    }
    if (!v) await cancelDealerNotifications();
  };

  const handleBorrowToggle = async (v: boolean) => {
    await update({ borrow_reminders_enabled: v });
    if (v) {
      try {
        const tools = await api.listTools();
        await rescheduleAllBorrowReminders(tools, {
          enabled: true,
          reminderHours: prefs.borrow_reminder_hours || 24,
        });
      } catch {
        /* offline ok */
      }
    } else {
      await cancelAllBorrowReminders();
    }
  };

  const handlePaymentToggle = async (v: boolean) => {
    await update({ payment_notifications_enabled: v });
    if (v) {
      reschedulePaymentRemindersNow().catch(() => {});
    } else {
      await cancelPaymentReminders();
    }
  };

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
      } catch {
        /* offline ok */
      }
    }
  };

  const applyDealerTime = async (h: number, m: number) => {
    await update({
      dealer_notification_hour: h,
      dealer_notification_minute: m,
    });
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
    if (prefs.payment_notifications_enabled) {
      reschedulePaymentRemindersNow().catch(() => {});
    }
  };

  const handleDayBeforeToggle = async (v: boolean) => {
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
  };

  return (
    <View style={styles.sectionCardWrap}>
      <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
      <View style={styles.sectionCard} testID="more-section-notifications">
        {/* ---- MASTER toggle ---- */}
        <SectionRow
          icon="notifications-circle"
          title="Allow notifications"
          subtitle={
            masterOn
              ? "Choose which reminders you receive below"
              : "Turn on to enable reminders on this device"
          }
          testID="notif-master-toggle-row"
          isLast={!masterOn}
          rightSlot={
            <Switch
              testID="toggle-notifications-master"
              value={masterOn}
              onValueChange={handleMasterToggle}
              trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
              thumbColor="#fff"
            />
          }
        />

        {masterOn && (
          <>
            {/* ===== Dealer route reminders ===== */}
            <SectionRow
              icon="navigate"
              title="Dealer route reminders"
              subtitle="Alert when a tool dealer is scheduled to visit"
              testID="notif-toggle-row"
              indent
              rightSlot={
                <Switch
                  value={prefs.dealer_notifications_enabled}
                  onValueChange={handleDealerToggle}
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
                  indent
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
                  subtitle="Get a heads-up the day before too"
                  indent
                  rightSlot={
                    <Switch
                      value={prefs.dealer_notify_day_before}
                      onValueChange={handleDayBeforeToggle}
                      trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                      thumbColor="#fff"
                    />
                  }
                />
              </>
            )}

            {/* ===== Borrowed-tool overdue reminders ===== */}
            <SectionRow
              icon="time"
              title="Borrowed-tool overdue reminders"
              subtitle="Notify me when a checked-out tool is still out"
              testID="notif-borrow-toggle-row"
              indent
              rightSlot={
                <Switch
                  value={prefs.borrow_reminders_enabled}
                  onValueChange={handleBorrowToggle}
                  trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                  thumbColor="#fff"
                />
              }
            />
            {prefs.borrow_reminders_enabled && (
              <SectionRow
                icon="hourglass"
                title="Reminder period"
                subtitle="How often to remind you while a tool is out"
                testID="notif-borrow-period-row"
                indent
                onPress={() => setBorrowPeriodPickerOpen(true)}
                rightSlot={
                  <Text style={styles.timeValue}>
                    {formatBorrowPeriod(prefs.borrow_reminder_hours)}
                  </Text>
                }
              />
            )}

            {/* ===== Payment notifications ===== */}
            <SectionRow
              icon="card"
              title="Payment Notifications"
              subtitle="Day-before / day-of alerts (choose per account)"
              testID="notif-payment-toggle-row"
              indent
              rightSlot={
                <Switch
                  testID="toggle-payment-notifications"
                  value={prefs.payment_notifications_enabled}
                  onValueChange={handlePaymentToggle}
                  trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                  thumbColor="#fff"
                />
              }
            />
          </>
        )}

        {/* ---- TEST notification — grayed out unless master is ON ---- */}
        <SectionRow
          icon="paper-plane"
          title="Send a test notification"
          subtitle={
            masterOn
              ? "Fires in 5 seconds — confirms delivery works"
              : "Turn on notifications above to test"
          }
          testID="notif-test-row"
          isLast
          disabled={!masterOn}
          onPress={
            masterOn
              ? async () => {
                  const ok = await sendTestNotification();
                  if (ok) {
                    Alert.alert(
                      "Test scheduled",
                      "A test notification will appear in about 5 seconds. If your phone is on silent or Do Not Disturb is on, you'll see it in Notification Center.",
                    );
                  } else {
                    promptOpenSettings();
                  }
                }
              : undefined
          }
        />
      </View>

      {/* ===== Dealer reminder time picker ===== */}
      {Platform.OS === "android" && timePickerOpen && (
        <DateTimePicker
          value={(() => {
            const d = new Date();
            d.setHours(
              prefs.dealer_notification_hour,
              prefs.dealer_notification_minute,
              0,
              0,
            );
            return d;
          })()}
          mode="time"
          is24Hour={false}
          display="default"
          onChange={async (event, selected) => {
            setTimePickerOpen(false);
            if (event.type === "set" && selected) {
              await applyDealerTime(selected.getHours(), selected.getMinutes());
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
                d.setHours(
                  prefs.dealer_notification_hour,
                  prefs.dealer_notification_minute,
                  0,
                  0,
                );
                return d;
              })()}
              mode="time"
              is24Hour={false}
              display="spinner"
              themeVariant="dark"
              textColor="#FFFFFF"
              onChange={async (_event, selected) => {
                if (selected) {
                  await applyDealerTime(selected.getHours(), selected.getMinutes());
                }
              }}
            />
          </View>
        </Modal>
      )}

      {/* ===== Borrow reminder period picker ===== */}
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
              <View
                style={[
                  styles.periodOptionRow,
                  { flexDirection: "column", alignItems: "stretch", gap: 8 },
                ]}
              >
                <Text style={styles.periodOptionLabel}>Custom (number of days)</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput
                    testID="borrow-custom-days"
                    placeholder="e.g. 10"
                    placeholderTextColor={theme.colors.textMuted}
                    value={customDaysInput}
                    onChangeText={(v) => setCustomDaysInput(v.replace(/[^0-9]/g, ""))}
                    keyboardType="number-pad"
                    style={styles.customInput}
                  />
                  <TouchableOpacity
                    style={styles.customSetBtn}
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
    </View>
  );
}

const styles = themedStyles((c) => ({
  sectionCardWrap: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  sectionLabel: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2,
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 8,
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
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  sectionRowIndent: {
    paddingLeft: 12,
    backgroundColor: c.glass,
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
  timeValue: {
    color: c.accent,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  timeModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
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
  customInput: {
    flex: 1,
    backgroundColor: c.surface,
    color: c.textPrimary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: c.border,
  },
  customSetBtn: {
    backgroundColor: c.accent,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
}));
