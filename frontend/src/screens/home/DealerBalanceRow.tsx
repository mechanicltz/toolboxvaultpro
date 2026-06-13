// DealerBalanceRow — one dealer's combined balance row. Extracted from
// app/(tabs)/index.tsx. Behaviour/appearance unchanged.
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { theme } from "../../theme";
import { styles } from "./homeStyles";
import { DealerLogo } from "../../components/DealerLogo";
import { DEALER_LOGO_SLOT } from "../../dealerLogos";

export function DealerBalanceRow({
  dealer,
  onAdjust,
  onOpenDealer,
}: {
  dealer: any;
  onAdjust: () => void;
  onOpenDealer: () => void;
}) {
  const credit = Number(dealer.credit_balance) || 0;
  const truck = Number(dealer.personal_balance) || 0;
  const total = credit + truck;
  return (
    <View style={styles.dealerRow}>
      <DealerLogo logo={dealer.logo} size={DEALER_LOGO_SLOT.compact} style={{ marginRight: 8 }} />
      <Text style={styles.dealerName} numberOfLines={1}>
        {dealer.name}
      </Text>
      <TouchableOpacity
        testID={`balance-${dealer.id}`}
        style={styles.dealerBalancePill}
        onPress={onOpenDealer}
        activeOpacity={0.8}
      >
        <Text
          style={[
            styles.dealerBalancePillText,
            total === 0 && { color: theme.colors.textMuted },
          ]}
        >
          ${total.toFixed(2)}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        testID={`adjust-${dealer.id}`}
        style={styles.dealerAdjustPill}
        onPress={onAdjust}
        activeOpacity={0.85}
      >
        <Text style={styles.dealerAdjustText}>Adjust</Text>
      </TouchableOpacity>
    </View>
  );
}
