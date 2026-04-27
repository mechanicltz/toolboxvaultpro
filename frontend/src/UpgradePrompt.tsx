import React, { useState, useCallback, useContext } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme } from "./theme";

type UpgradeContextType = {
  show: (opts?: { title?: string; message?: string; reason?: string }) => void;
};

const UpgradeContext = React.createContext<UpgradeContextType | null>(null);

export function UpgradeProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState("Upgrade Required");
  const [message, setMessage] = useState("");
  const router = useRouter();

  const show = useCallback(
    (opts?: { title?: string; message?: string; reason?: string }) => {
      setTitle(opts?.title || "Upgrade Required");
      setMessage(
        opts?.message ||
          opts?.reason ||
          "You've reached the limits of the Free plan. Upgrade to unlock unlimited inventory, dealers, and agents."
      );
      setVisible(true);
    },
    []
  );

  const close = () => setVisible(false);
  const goSubscribe = () => {
    setVisible(false);
    router.push("/subscription");
  };

  return (
    <UpgradeContext.Provider value={{ show }}>
      {children}
      <Modal
        transparent
        animationType="fade"
        visible={visible}
        onRequestClose={close}
      >
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.iconWrap}>
              <Ionicons name="lock-closed" size={28} color={theme.colors.accent} />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>

            <View style={styles.benefits}>
              {[
                "Unlimited inventory items",
                "Unlimited dealers",
                "Unlimited authorized agents",
                "All advanced features unlocked",
              ].map((b) => (
                <View key={b} style={styles.benefitRow}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.colors.accent} />
                  <Text style={styles.benefitText}>{b}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.upgradeBtn} onPress={goSubscribe}>
              <Ionicons name="rocket" size={16} color="#000" />
              <Text style={styles.upgradeText}>VIEW PLANS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={close}>
              <Text style={styles.cancelText}>Maybe Later</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </UpgradeContext.Provider>
  );
}

export function useUpgradePrompt() {
  const ctx = useContext(UpgradeContext);
  if (!ctx) {
    // Safe fallback when used outside provider
    const router = useRouter();
    return {
      show: () => router.push("/subscription"),
    };
  }
  return ctx;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modal: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,179,0,0.12)",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.glassBorder,
  },
  title: {
    color: theme.colors.textPrimary,
    fontWeight: "900",
    fontSize: 18,
    textAlign: "center",
    letterSpacing: 1,
    marginBottom: 8,
  },
  message: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 16,
  },
  benefits: {
    backgroundColor: theme.colors.bgSecondary,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  benefitText: { color: theme.colors.textSecondary, fontSize: 13 },
  upgradeBtn: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 8,
  },
  upgradeText: { color: "#000", fontWeight: "900", fontSize: 13, letterSpacing: 1.5 },
  cancelBtn: { paddingVertical: 10, alignItems: "center" },
  cancelText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: "600" },
});
