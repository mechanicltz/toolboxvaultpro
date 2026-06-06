/**
 * ShadowBox / ShadowBoxSubCard
 * ----------------------------
 * The STANDARDIZED "Shadow Box" layout system for the PLAIN (Light / Dark)
 * themes. This is the single source of truth for the floating description-card
 * look the user locked in as the North Star (the warranty card on the tool
 * detail screen):
 *
 *   • ShadowBox        — the OUTER floating description card. Holds a vertical
 *                        stack of label/value rows (each with a small leading
 *                        icon). Casts a soft drop shadow (theme.elevation.md)
 *                        so it appears to float above the page.
 *
 *   • ShadowBoxSubCard — a SECOND description card nested INSIDE an expanded
 *                        accordion / row body. Same floating-shadow treatment
 *                        so it reads as a clean "card-within-a-card".
 *
 * Both are palette-aware via `themedStyles`, so Light and Dark both render
 * correctly. The textured industrial themes (Iron Forge / Crimson Steel) keep
 * their own metal-frame skinning and do NOT use these wrappers.
 *
 * Usage:
 *   <ShadowBox>
 *     ...rows...
 *     <ShadowBoxSubCard> ...nested rows... </ShadowBoxSubCard>
 *   </ShadowBox>
 */
import React, { ReactNode } from "react";
import { View, ViewStyle, StyleProp } from "react-native";
import { themedStyles } from "../themeContext";
import { theme } from "../theme";

type BoxProps = {
  children: ReactNode;
  /** Extra layout overrides (margins, etc.). Chrome is owned by the box. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Outer floating description card. */
export function ShadowBox({ children, style, testID }: BoxProps) {
  return (
    <View style={[styles.box, style]} testID={testID}>
      {children}
    </View>
  );
}

/** Nested floating sub-card, shown inside an expanded row / accordion body. */
export function ShadowBoxSubCard({ children, style, testID }: BoxProps) {
  return (
    <View style={[styles.subCard, style]} testID={testID}>
      {children}
    </View>
  );
}

const styles = themedStyles((c) => ({
  // Border is declared BEFORE spreading elevation.md so the elevation's
  // bevel-border treatment wins (this is exactly how the warranty card is
  // built — matching the user's reference screenshots).
  box: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 2,
    ...(theme.elevation.md as object),
  },
  subCard: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginVertical: 8,
    ...(theme.elevation.md as object),
  },
}));

export default ShadowBox;
