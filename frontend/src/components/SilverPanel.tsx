/**
 * SilverPanel — the one component you call to render the brushed-silver frame.
 *
 * All frame art, 9-slice geometry, padding, text + icon sizing and row spacing
 * come from the central src/tbv/silver.ts config, so usage is trivial and 100%
 * consistent across every screen, on phones and tablets:
 *
 *   <SilverPanel>
 *     <SilverHeader icon="briefcase" title="PORTFOLIO SUMMARY" />
 *     <SilverDivider />
 *     <SilverRow icon="cube" label="TOTAL ITEMS" value="142" />
 *     <SilverRow icon="cash" label="NET WORTH"   value="$48,250" />
 *   </SilverPanel>
 *
 * The panel auto-sizes to its content and stretches to its container width with
 * the chamfered metal corners staying crisp.
 */
import React, { ReactNode } from "react";
import { View, Text, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TbvFrame from "../tbv/components/TbvFrame";
import { SILVER, SILVER_SRC, SILVER_CAP, SILVER_PAD } from "../tbv/silver";

export function SilverPanel({
  style,
  children,
  testID,
}: {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}) {
  return (
    <TbvFrame
      source={SILVER_SRC}
      capInsets={SILVER_CAP}
      padX={SILVER_PAD.padX}
      padTop={SILVER_PAD.padTop}
      padBottom={SILVER_PAD.padBottom}
      style={style}
      testID={testID}
    >
      {children}
    </TbvFrame>
  );
}

/** Panel header — icon + title, preset sizing. */
export function SilverHeader({
  icon,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: SILVER.rowGap }}>
      <Ionicons name={icon} size={SILVER.headerIconSize} color={SILVER.accent} />
      <Text style={SILVER.title}>{title}</Text>
    </View>
  );
}

/** A single content row: icon + label + right-aligned value, preset sizing. */
export function SilverRow({
  icon,
  label,
  value,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string | number;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: SILVER.rowPadV,
      }}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={SILVER.rowIconSize}
          color={SILVER.accent}
          style={{ width: SILVER.rowIconSlot }}
        />
      ) : (
        <View style={{ width: SILVER.rowIconSlot }} />
      )}
      <Text style={[SILVER.label, { flex: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      {value !== undefined ? <Text style={SILVER.value}>{String(value)}</Text> : null}
    </View>
  );
}

/** Hairline divider tuned for the brushed-metal surface. */
export function SilverDivider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: SILVER.divider,
        marginVertical: SILVER.dividerMarginV,
      }}
    />
  );
}

export default SilverPanel;
