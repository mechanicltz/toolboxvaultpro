import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Modal, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Contacts from "expo-contacts";
import { themedStyles } from "../themeContext";
import { theme } from "../theme";
import { useIntroFinished } from "../introState";
import { setPermissionsOnboardingDone } from "../onboardingState";
import { requestPermissions as requestNotifPermission } from "../notifications";

// One-time first-launch permission priming. Shows a short "why we need this"
// card for Notifications, then Photos, then Contacts. ALLOW triggers the real
// OS prompt; NOT NOW skips (the user can enable it later in Settings). Runs
// once per device (AsyncStorage flag), only after the intro video, and blocks
// the other first-launch popups until it's finished (onboardingState signal).
const DONE_KEY = "tbv_permissions_onboarded_v1";

type StepKey = "notifications" | "photos" | "contacts";

type StepDef = {
  key: StepKey;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  request: () => Promise<void>;
};

const STEPS: StepDef[] = [
  {
    key: "notifications",
    icon: "notifications",
    title: "Stay in the loop",
    body:
      "Allow notifications so we can remind you about dealer route days, payments due, tools you've loaned out, and new features we add.",
    request: async () => {
      try {
        await requestNotifPermission();
      } catch {
        /* best-effort */
      }
    },
  },
  {
    key: "photos",
    icon: "images",
    title: "Add photos & receipts",
    body:
      "Allow photo access so you can attach pictures of your tools, receipts, and documents to keep everything on record.",
    request: async () => {
      try {
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      } catch {
        /* best-effort */
      }
    },
  },
  {
    key: "contacts",
    icon: "people",
    title: "Import your contacts",
    body:
      "Allow contact access so you can quickly pull in names and phone numbers for your dealers and the people you lend tools to.",
    request: async () => {
      try {
        await Contacts.requestPermissionsAsync();
      } catch {
        /* best-effort */
      }
    },
  },
];

export function PermissionsOnboarding() {
  const introDone = useIntroFinished();
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);
  const s = styles;

  const finish = useCallback(() => {
    setVisible(false);
    AsyncStorage.setItem(DONE_KEY, "1").catch(() => {});
    setPermissionsOnboardingDone(true);
  }, []);

  useEffect(() => {
    if (!introDone || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      // Web / unsupported → nothing to ask; unblock the other popups.
      if (Platform.OS === "web") {
        setPermissionsOnboardingDone(true);
        return;
      }
      let already: string | null = null;
      try {
        already = await AsyncStorage.getItem(DONE_KEY);
      } catch {
        /* storage unavailable — treat as not done */
      }
      if (already === "1") {
        setPermissionsOnboardingDone(true);
        return;
      }
      // Small delay so it appears just after the dashboard settles.
      setTimeout(() => setVisible(true), 500);
    })();
  }, [introDone]);

  const advance = useCallback(() => {
    setIndex((i) => {
      const next = i + 1;
      if (next >= STEPS.length) {
        finish();
        return i;
      }
      return next;
    });
  }, [finish]);

  const onAllow = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await STEPS[index].request();
    } finally {
      setBusy(false);
      advance();
    }
  }, [busy, index, advance]);

  if (!visible) return null;
  const step = STEPS[index];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={s.overlay}>
        <View style={s.card} testID="perm-onboarding-card">
          <View style={s.iconWrap}>
            <Ionicons name={step.icon} size={34} color={theme.colors.accent} />
          </View>
          <Text style={s.stepCount}>{`STEP ${index + 1} OF ${STEPS.length}`}</Text>
          <Text style={s.title}>{step.title}</Text>
          <Text style={s.body}>{step.body}</Text>

          <View style={s.dots}>
            {STEPS.map((st, i) => (
              <View key={st.key} style={[s.dot, i === index && s.dotActive]} />
            ))}
          </View>

          <TouchableOpacity
            testID={`perm-allow-${step.key}`}
            activeOpacity={0.85}
            onPress={onAllow}
            disabled={busy}
            style={[s.primaryBtn, busy && { opacity: 0.6 }]}
          >
            <Text style={s.primaryBtnText}>ALLOW</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID={`perm-skip-${step.key}`}
            activeOpacity={0.7}
            onPress={advance}
            disabled={busy}
            style={s.ghostBtn}
          >
            <Text style={s.ghostBtnText}>NOT NOW</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles((c) => ({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: c.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    padding: 26,
    alignItems: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: c.bgSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  stepCount: {
    color: c.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  title: {
    color: c.textPrimary,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 10,
  },
  body: {
    color: c.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 18,
  },
  dots: { flexDirection: "row", gap: 8, marginBottom: 20 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.border,
  },
  dotActive: { backgroundColor: c.accent, width: 20 },
  primaryBtn: {
    alignSelf: "stretch",
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: c.accent,
    alignItems: "center",
  },
  primaryBtnText: {
    color: c.textOnAccent,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1,
  },
  ghostBtn: {
    alignSelf: "stretch",
    paddingVertical: 13,
    marginTop: 8,
    alignItems: "center",
  },
  ghostBtnText: {
    color: c.textMuted,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
  },
}));

export default PermissionsOnboarding;
