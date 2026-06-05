// SummaryRow — a dashboard summary line (NET WORTH-style). Extracted from
// app/(tabs)/index.tsx. Behaviour/appearance unchanged.
import React, { ReactNode } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";
import { BevelCard } from "../../components/BevelCard";
import { styles } from "./homeStyles";

export function SummaryRow({
  icon,
  label,
  value,
  sub,
  onPress,
  rightSlot,
  valueColor,
  nested,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  onPress?: () => void;
  rightSlot?: ReactNode;
  valueColor?: string;
  /**
   * When TRUE, suppresses the card-style background/border/elevation on the
   * row so it can sit inside another raised container (used by the DEALER
   * ACCOUNTS cluster which groups one header + N sub-rows into one card).
   */
  nested?: boolean;
}) {
  const innerContent = (
    <>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={theme.colors.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {/* Skip the value pill when there's no value — otherwise a hollow
          empty pillbox renders next to the label (e.g. the DEALER
          ACCOUNTS header which intentionally has no header-level total). */}
      {value !== "" && value != null ? (
        <View
          style={[
            styles.rowValuePill,
            valueColor ? { borderColor: valueColor } : null,
          ]}
        >
          <Text
            style={[styles.rowValue, valueColor ? { color: valueColor } : null]}
            numberOfLines={1}
          >
            {value}
          </Text>
        </View>
      ) : null}
      {rightSlot ? rightSlot : (onPress ? (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={theme.colors.textMuted}
          style={{ marginLeft: 8 }}
        />
      ) : null)}
    </>
  );
  // Nested rows (used inside the DEALER ACCOUNTS combined card) skip the
  // raised treatment — they sit flat inside their parent card.
  if (nested) {
    const Wrapper: any = onPress ? TouchableOpacity : View;
    return (
      <Wrapper style={styles.rowNested} onPress={onPress} activeOpacity={0.65}>
        {innerContent}
      </Wrapper>
    );
  }
  // All other summary rows render through BevelCard so the gradient surface
  // + bevel borders + drop shadow match the NET WORTH style universally.
  return (
    <BevelCard style={styles.rowOuter} onPress={onPress}>
      {innerContent}
    </BevelCard>
  );
}
