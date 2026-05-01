/**
 * Feedback / Bug Report / Feature Request form.
 * On submit, opens the user's mail client pre-filled to
 * MechanicVault@gmail.com with a formatted message and (if a bug photo
 * was attached) the image as an attachment. Falls back to a plain
 * `mailto:` link on web where expo-mail-composer is unavailable.
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
  Image,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as MailComposer from "expo-mail-composer";
import * as ImagePicker from "expo-image-picker";
import { theme } from "../src/theme";
import { useAuth } from "../src/AuthContext";

const DESTINATION_EMAIL = "MechanicVault@gmail.com";

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
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Prefill from logged-in user
  useEffect(() => {
    if (user) {
      if (user.name && !name) setName(user.name);
      if (user.email && !email) setEmail(user.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow photo library access to attach a screenshot."
        );
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.7,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        setPhotoUri(res.assets[0].uri);
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not pick a photo.");
    }
  };

  const clearPhoto = () => setPhotoUri(null);

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

    const body =
      `${header}\n` +
      `${platformLine}\n` +
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
      const body = buildEmailBody();
      const prefixTag = isBug ? "[BUG] " : isFeature ? "[FEATURE] " : "";
      const emailSubject = `${prefixTag}${subject.trim()}`;

      if (Platform.OS === "web") {
        // Web: use mailto:. Attachments not supported via mailto so just
        // open the mail client with the body; user can attach the photo
        // manually if needed.
        const mailto =
          `mailto:${DESTINATION_EMAIL}` +
          `?subject=${encodeURIComponent(emailSubject)}` +
          `&body=${encodeURIComponent(body)}`;
        await Linking.openURL(mailto);
        showSuccessAndExit();
        return;
      }

      // Native: use MailComposer
      const available = await MailComposer.isAvailableAsync();
      if (!available) {
        // Fall back to mailto on native too
        const mailto =
          `mailto:${DESTINATION_EMAIL}` +
          `?subject=${encodeURIComponent(emailSubject)}` +
          `&body=${encodeURIComponent(body)}`;
        const supported = await Linking.canOpenURL(mailto);
        if (supported) {
          await Linking.openURL(mailto);
          showSuccessAndExit();
          return;
        }
        Alert.alert(
          "No mail app",
          "No email app is configured on this device. Please install or set up a mail app, then try again."
        );
        return;
      }

      const attachments: string[] = [];
      if (isBug && photoUri) {
        // expo-image-picker returns a file:// URI in the app's cache dir
        // that MailComposer can attach directly. No need to copy.
        attachments.push(photoUri);
      }

      const result = await MailComposer.composeAsync({
        recipients: [DESTINATION_EMAIL],
        subject: emailSubject,
        body,
        attachments: attachments.length ? attachments : undefined,
        isHtml: false,
      });

      if (result.status === "sent" || result.status === "saved") {
        showSuccessAndExit();
      } else if (result.status === "cancelled") {
        // User backed out — no popup, stay on screen
        setSubmitting(false);
        return;
      } else {
        showSuccessAndExit();
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not open your mail app.");
    } finally {
      setSubmitting(false);
    }
  };

  const showSuccessAndExit = () => {
    Alert.alert(
      "Message sent",
      "Thanks for your feedback! Your message has been sent to MechanicVault@gmail.com.",
      [{ text: "OK", onPress: () => router.back() }]
    );
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
            Report a bug or request a new feature. Your message will be sent
            to {DESTINATION_EMAIL}.
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
                // If switching from bug → feature, drop any attached photo
                setPhotoUri(null);
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

          {/* Photo attachment (only when bug is checked) */}
          {isBug && (
            <>
              <Text style={styles.label}>ATTACH SCREENSHOT (optional)</Text>
              {photoUri ? (
                <View style={styles.photoWrap}>
                  <Image
                    source={{ uri: photoUri }}
                    style={styles.photoPreview}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={styles.photoRemove}
                    onPress={clearPhoto}
                    testID="feedback-remove-photo"
                  >
                    <Ionicons name="close" size={16} color="#000" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.pickBtn}
                  onPress={pickPhoto}
                  testID="feedback-pick-photo"
                >
                  <Ionicons
                    name="image"
                    size={18}
                    color={theme.colors.accent}
                  />
                  <Text style={styles.pickBtnText}>
                    Add screenshot of the bug
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
  },
  body: { padding: 16, paddingBottom: 24 },
  intro: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 18,
  },
  label: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.bgSecondary,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
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
    backgroundColor: theme.colors.bgSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 10,
    borderRadius: 6,
  },
  segBtnOn: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  segText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
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
    borderColor: theme.colors.border,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.bgSecondary,
  },
  checkboxOn: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  checkLabel: {
    color: theme.colors.textPrimary,
    fontSize: 14,
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
    borderColor: theme.colors.accent,
    borderRadius: 6,
    paddingVertical: 16,
    backgroundColor: theme.colors.bgSecondary,
  },
  pickBtnText: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
  photoWrap: {
    position: "relative",
    borderRadius: 8,
    overflow: "hidden",
  },
  photoPreview: {
    width: "100%",
    height: 180,
    backgroundColor: theme.colors.bgSecondary,
  },
  photoRemove: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: theme.colors.accent,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: 14,
    backgroundColor: theme.colors.bg,
  },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: 8,
  },
  submitText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
  },
});
