/**
 * SteelPanel — the one component you call to render the "Steel" frame anywhere.
 *
 * All frame art, 9-slice geometry, padding, text + icon sizing and row spacing
 * come from the central src/tbv/steel.ts config, so usage is trivial and 100%
 * consistent across every screen, on phones and tablets:
 *
 *   <SteelPanel>
 *     <SteelHeader icon="briefcase" title="PORTFOLIO SUMMARY" />
 *     <SteelDivider />
 *     <SteelRow icon="cube" label="TOTAL ITEMS" value="142" />
 *     <SteelRow icon="cash" label="NET WORTH"   value="$48,250" />
 *   </SteelPanel>
 *
 * `orientation="horizontal"` swaps to the wide art for short/landscape areas.
 * The panel auto-sizes to its content and stretches to its container width.
 */
import React, { ReactNode } from "react";
import { View, Text, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TbvFrame from "../tbv/components/TbvFrame";
import {
  STEEL,
  STEEL_SRC,
  STEEL_CAP,
  STEEL_PAD,
  SteelOrientation,
} from "../tbv/steel";

export function SteelPanel({
  orientation = "vertical",
  style,
  children,
  testID,
}: {
  orientation?: SteelOrientation;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}) {
  const src = STEEL_SRC[orientation];
  const cap = STEEL_CAP[orientation];
  const pad = STEEL_PAD[orientation];
  return (
    <TbvFrame
      source={src}
      capInsets={cap}
      padX={pad.padX}
      padTop={pad.padTop}
      padBottom={pad.padBottom}
      style={style}
      testID={testID}
    >
      {children}
    </TbvFrame>
  );
}

/** Panel header — icon + title, preset sizing. */
export function SteelHeader({
  icon,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: STEEL.rowGap }}>
      <Ionicons name={icon} size={STEEL.headerIconSize} color={STEEL.accent} />
      <Text style={STEEL.title}>{title}</Text>
    </View>
  );
}

/** A single content row: icon + label + right-aligned value, preset sizing. */
export function SteelRow({
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
        paddingVertical: STEEL.rowPadV,
      }}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={STEEL.rowIconSize}
          color={STEEL.accent}
          style={{ width: STEEL.rowIconSlot }}
        />
      ) : (
        <View style={{ width: STEEL.rowIconSlot }} />
      )}
      <Text style={[STEEL.label, { flex: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      {value !== undefined ? <Text style={STEEL.value}>{String(value)}</Text> : null}
    </View>
  );
}

/** Hairline divider tuned for the brushed-metal surface. */
export function SteelDivider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: STEEL.divider,
        marginVertical: STEEL.dividerMarginV,
      }}
    />
  );
}

export default SteelPanel;
