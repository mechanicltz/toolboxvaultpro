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
  const extra = items.length > 1 ? ` +${items.length - 1} more` : "";
  const firstLabel = first ? `${first.dealer_name} ${first.account_label}` : "";

  return (
    <BevelCard
      testID="home-payments-banner"
      style={[styles.banner, overdue && { borderLeftColor: theme.colors.danger }]}
      onPress={() => router.push((first ? `/dealer/${first.dealer_id}` : "/dealers") as any)}
    >
      <Ionicons name="card" size={22} color={overdue ? theme.colors.danger : theme.colors.accent} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.label}>
          {overdue ? "PAYMENTS DUE / OVERDUE" : "PAYMENTS DUE THIS WEEK"}
        </Text>
        <Text style={styles.text} numberOfLines={1}>
          {items.length} due · ${total.toFixed(2)} — {firstLabel}{extra}
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
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: theme.radii.md,
    borderLeftWidth: 3,
    borderLeftColor: c.accent,
  },
  label: { color: c.textSecondary, fontSize: 9, fontWeight: "900", letterSpacing: 1.5 },
  text: { color: c.textPrimary, fontSize: 13, fontWeight: "700", marginTop: 3 },
}));
