/**
 * Feedback / Bug Report / Feature Request form.
 * On submit, opens the user's mail client pre-filled to
 * MechanicVault@gmail.com with a formatted message including the app
 * version. Falls back to a plain `mailto:` link on web where
 * expo-mail-composer is unavailable.
 */
import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { theme } from "../src/theme";
import { useAuth } from "../src/AuthContext";
import { api } from "../src/api";

import { themedStyles } from "../src/themeContext";

const DESTINATION_EMAIL = "MechanicVault@gmail.com";
const APP_VERSION =
  (Constants.expoConfig as any)?.version ||
  (Constants as any).manifest?.version ||
  "1.0.0";

type Platform_ = "Apple" | "Android";

export default function FeedbackScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [platform, setPlatform] = useState<Platform_>(
    Platform.OS === "android" ? "Android" : "Apple"
  );
  const [subject, setSubject] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [isBug, setIsBug] = useState<boolean>(false);
  const [isFeature, setIsFeature] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Prefill from logged-in user
  useEffect(() => {
    if (user) {
      if (user.name && !name) setName(user.name);
      if (user.email && !email) setEmail(user.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const validate = (): string | null => {
    if (!name.trim()) return "Please enter your name.";
    if (!email.trim()) return "Please enter your email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "Please enter a valid email address.";
    if (!subject.trim()) return "Please enter a subject.";
    if (!message.trim()) return "Please enter a message.";
    return null;
  };

  const buildEmailBody = (): string => {
    // Checkboxes first, then message, then user info at bottom
    const tags: string[] = [];
    if (isBug) tags.push("[x] BUG REPORT");
    else tags.push("[ ] Bug report");
    if (isFeature) tags.push("[x] FEATURE REQUEST");
    else tags.push("[ ] Feature request");

    const header = tags.join("\n");
    const platformLine = `Platform: ${platform}`;
    const versionLine = `App version: ${APP_VERSION}`;

    const body =
      `${header}\n` +
      `${platformLine}\n` +
      `${versionLine}\n` +
      `\n` +
      `Subject: ${subject.trim()}\n` +
      `\n` +
      `Message:\n${message.trim()}\n` +
      `\n` +
      `---\n` +
      `Submitted by:\n` +
      `${name.trim()}\n` +
      `${email.trim()}`;
    return body;
  };

  const onSubmit = async () => {
    const err = validate();
    if (err) {
      Alert.alert("Missing info", err);
      return;
    }
    setSubmitting(true);
    try {
      await api.submitFeedback({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        platform,
        is_bug: isBug,
        is_feature: isFeature,
        app_version: APP_VERSION,
      });
      Alert.alert(
        "Message sent",
        "Thanks for your feedback! Your message has been sent and we'll get back to you as soon as possible.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.toLowerCase().includes("too many")) {
        Alert.alert(
          "Slow down",
          "You've sent several messages recently. Please wait a few minutes and try again.",
        );
      } else {
        Alert.alert(
          "Could not send",
          msg || "There was a problem sending your message. Please try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons
            name="chevron-back"
            size={24}
            color={theme.colors.textPrimary}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CONTACT · FEEDBACK</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.intro}>
            Report a bug or request a new feature. We&apos;ll get back to you
            as soon as possible.
          </Text>

          {/* Name */}
          <Text style={styles.label}>NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor={theme.colors.textMuted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            testID="feedback-name"
          />

          {/* Email */}
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={theme.colors.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            testID="feedback-email"
          />

          {/* Platform */}
          <Text style={styles.label}>PLATFORM</Text>
          <View style={styles.segmented}>
            {(["Apple", "Android"] as Platform_[]).map((p) => {
              const on = platform === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[styles.segBtn, on && styles.segBtnOn]}
                  onPress={() => setPlatform(p)}
                  testID={`feedback-platform-${p.toLowerCase()}`}
                >
                  <Ionicons
                    name={p === "Apple" ? "logo-apple" : "logo-android"}
                    size={16}
                    color={on ? "#000" : theme.colors.textPrimary}
                  />
                  <Text style={[styles.segText, on && { color: "#000" }]}>
                    {p}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Subject */}
          <Text style={styles.label}>SUBJECT</Text>
          <TextInput
            style={styles.input}
            placeholder="Short summary"
            placeholderTextColor={theme.colors.textMuted}
            value={subject}
            onChangeText={setSubject}
            testID="feedback-subject"
          />

          {/* Checkboxes (mutually exclusive — pick ONE) */}
          <Text style={styles.label}>TYPE (pick one)</Text>
          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => {
              if (isBug) {
                setIsBug(false);
              } else {
                setIsBug(true);
                setIsFeature(false);
              }
            }}
            activeOpacity={0.7}
            testID="feedback-bug-checkbox"
          >
            <View style={[styles.checkbox, isBug && styles.checkboxOn]}>
              {isBug && (
                <Ionicons name="checkmark" size={14} color="#000" />
              )}
            </View>
            <Ionicons
              name="bug"
              size={18}
              color={theme.colors.danger}
              style={{ marginLeft: 4 }}
            />
            <Text style={styles.checkLabel}>I&apos;m reporting a bug</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => {
              if (isFeature) {
                setIsFeature(false);
              } else {
                setIsFeature(true);
                setIsBug(false);
              }
            }}
            activeOpacity={0.7}
            testID="feedback-feature-checkbox"
          >
            <View style={[styles.checkbox, isFeature && styles.checkboxOn]}>
              {isFeature && (
                <Ionicons name="checkmark" size={14} color="#000" />
              )}
            </View>
            <Ionicons
              name="sparkles"
              size={18}
              color={theme.colors.accent}
              style={{ marginLeft: 4 }}
            />
            <Text style={styles.checkLabel}>
              I&apos;m requesting a new feature
            </Text>
          </TouchableOpacity>

          {/* Message */}
          <Text style={styles.label}>MESSAGE</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="Describe in detail…"
            placeholderTextColor={theme.colors.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            testID="feedback-message"
          />

          {/* Version footer (informational) */}
          <Text style={styles.versionNote}>
            App version {APP_VERSION} will be included automatically.
          </Text>

          <View style={{ height: 8 }} />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submit, submitting && { opacity: 0.6 }]}
            onPress={onSubmit}
            disabled={submitting}
            activeOpacity={0.85}
            testID="feedback-submit"
          >
            {submitting ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="send" size={16} color="#000" />
                <Text style={styles.submitText}>SEND MESSAGE</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: c.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerTitle: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
  body: { padding: 16, paddingBottom: 24 },
  intro: {
    color: c.textSecondary,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 18,
  },
  label: {
    color: c.accent,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: c.bgSecondary,
    color: c.textPrimary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 11,
  
    ...(theme.elevation.input as object),
  },
  textarea: { minHeight: 120, paddingTop: 10 },
  segmented: {
    flexDirection: "row",
    gap: 8,
  },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 10,
    borderRadius: 6,
  
    ...(theme.elevation.md as object),
  },
  segBtnOn: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  segText: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: c.border,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.bgSecondary,
  },
  checkboxOn: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  checkLabel: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "700",
    flex: 1,
  },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: c.accent,
    borderRadius: 6,
    paddingVertical: 16,
    backgroundColor: c.bgSecondary,
  
    ...(theme.elevation.md as object),
  },
  pickBtnText: {
    color: c.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  versionNote: {
    color: c.textMuted,
    fontSize: 9,
    fontStyle: "italic",
    marginTop: 16,
    textAlign: "center",
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: c.border,
    padding: 14,
    backgroundColor: c.bg,
  },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.accent,
    paddingVertical: 14,
    borderRadius: 8,
  },
  submitText: {
    color: "#000",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
  },
}));
