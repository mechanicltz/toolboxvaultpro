/**
 * BevelCard
 * ------------------------------------------------------------------
 * Sharp-Bevel 3D pillbox wrapper used everywhere the app previously
 * relied on `theme.elevation.md` for the raised card look. Renders:
 *
 *   • A 145° LinearGradient surface (palette: rowGradTop → rowGradBottom)
 *     so every card has the metallic "lit from above" look matching the
 *     NET WORTH tile.
 *   • Bevel borders — lighter top + left, darker bottom + right —
 *     uniform 2 px on each side so corner mitering stays crisp.
 *   • An offset stair-step drop shadow (web `boxShadow`, native
 *     `shadowOffset`+`shadowRadius`) lifting the tile off the page.
 *
 * Usage replaces `<View style={[styles.row, …]}>` (or TouchableOpacity)
 * with `<BevelCard style={styles.row} onPress={…}>`. Children render
 * normally on top of the gradient. Any backgroundColor / border /
 * shadow inside `style` will be overridden by the bevel treatment —
 * that's the whole point.
 */
import React from "react";
import {
  View,
  TouchableOpacity,
  ViewStyle,
  StyleSheet,
  StyleProp,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "../themeContext";

export interface BevelCardProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  activeOpacity?: number;
  /** Override the corner radius (default 12). */
  radius?: number;
  /** Disable touchable feedback even if onPress is supplied. */
  disabled?: boolean;
  testID?: string;
  pointerEvents?: ViewStyle["pointerEvents"];
}

export function BevelCard({
  children,
  style,
  onPress,
  onLongPress,
  activeOpacity = 0.75,
  radius = 12,
  disabled,
  testID,
  pointerEvents,
}: BevelCardProps) {
  const c = useColors();
  const isInteractive = !!(onPress || onLongPress) && !disabled;
  const Wrapper: any = isInteractive ? TouchableOpacity : View;

  const outerStyle: ViewStyle = {
    position: "relative",
    overflow: "hidden",
    borderRadius: radius,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderTopColor: c.bevelHighlight,
    borderLeftColor: c.bevelHighlight,
    borderBottomColor: c.bevelShadow,
    borderRightColor: c.bevelShadow,
    backgroundColor: c.rowGradTop, // fallback for the brief moment before LG paints
    ...(Platform.select({
      web: {
        // Stair-step sharp drop shadow + soft glow halo around it.
        boxShadow: `4px 4px 0 ${c.bevelDrop}, 6px 6px 12px ${c.bevelDrop}` as any,
      },
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.55,
        shadowOffset: { width: 3, height: 5 },
        shadowRadius: 6,
        elevation: 8,
      },
    }) as object),
  };

  return (
    <Wrapper
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={activeOpacity}
      style={[outerStyle, style]}
      testID={testID}
      pointerEvents={pointerEvents}
    >
      <LinearGradient
        colors={[c.rowGradTop, c.rowGradBottom]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      {children}
    </Wrapper>
  );
}

export default BevelCard;
