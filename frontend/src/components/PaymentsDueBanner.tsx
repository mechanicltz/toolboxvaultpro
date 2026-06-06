// Home "payments due this week" banner. Self-contained: reads its own prefs
// (CUSTOMIZE → show_payments_banner) and fetches upcoming payments on focus.
// Renders nothing when hidden or when nothing is due within 7 days.
import React, { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { theme } from "../theme";
import { api, DealerPaymentDue } from "../api";
import { usePrefs } from "../prefs";
import { BevelCard } from "./BevelCard";
import { themedStyles } from "../themeContext";

export function PaymentsDueBanner() {
  const router = useRouter();
  const { prefs } = usePrefs();
  const [items, setItems] = useState<DealerPaymentDue[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      api
        .dealerPaymentsUpcoming(7)
        .then((r) => { if (alive) setItems(r.items || []); })
        .catch(() => {});
      return () => { alive = false; };
    }, []),
  );

  if (!prefs.show_payments_banner || items.length === 0) return null;

  const total = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  const overdue = items.some((i) => i.overdue);
  const first = items[0];

  return (
    <BevelCard
      testID="home-payments-banner"
      style={[styles.banner, overdue && { borderLeftColor: theme.colors.danger }]}
      onPress={() => router.push((first ? `/dealer/${first.dealer_id}` : "/dealers") as any)}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="card" size={20} color={overdue ? theme.colors.danger : theme.colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>
          {overdue ? "PAYMENTS DUE / OVERDUE" : "PAYMENTS DUE THIS WEEK"}
        </Text>
        <Text style={styles.text} numberOfLines={1}>
          {items.length} due · total ${total.toFixed(2)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </BevelCard>
  );
}

const styles = themedStyles((c) => ({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.bgSecondary,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: theme.radii.md,
    borderLeftWidth: 3,
    borderLeftColor: c.accent,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.accent,
    marginRight: 12,
  },
  label: { color: c.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  text: { color: c.textPrimary, fontSize: 14, fontWeight: "700", marginTop: 3 },
}));
