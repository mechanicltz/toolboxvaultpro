/**
 * ShadowBox / ShadowBoxSubCard / ShadowBoxMini
 * --------------------------------------------
 * The STANDARDIZED "Shadow Box" layout system for the PLAIN (Light / Dark)
 * themes. Single source of truth for the floating description-card look the
 * user locked in as the North Star (the warranty card on the tool detail
 * screen):
 *
 *   • ShadowBox        — OUTER floating description card. Holds a vertical
 *                        stack of label/value rows. Soft drop shadow
 *                        (theme.elevation.md) so it floats above the page.
 *
 *   • ShadowBoxSubCard — a SECOND description card nested INSIDE an expanded
 *                        accordion / row body. Same floating-shadow treatment
 *                        so it reads as a clean "card-within-a-card".
 *
 *   • ShadowBoxMini    — a SMALL floating stat tile (e.g. the little summary
 *                        cards on the contact detail screen). Same chrome,
 *                        tighter radius / padding, meant to sit in a row/grid.
 *
 * All are palette-aware via `themedStyles`, so Light and Dark both render
 * correctly. The textured industrial themes (Iron Forge / Crimson Steel) keep
 * their own metal-frame skinning and do NOT use these wrappers.
 *
 * Any box can be made tappable by passing `onPress`.
 */
import React, { ReactNode } from "react";
import { View, TouchableOpacity, ViewStyle, StyleProp } from "react-native";
import { themedStyles } from "../themeContext";
import { theme } from "../theme";

type BoxProps = {
  children: ReactNode;
  /** Extra layout overrides (margins, flexDirection, etc.). Chrome is owned by the box. */
  style?: StyleProp<ViewStyle>;
  /** When provided the box becomes a TouchableOpacity. */
  onPress?: () => void;
  /** Optional long-press handler (e.g. enter multi-select mode). */
  onLongPress?: () => void;
  activeOpacity?: number;
  testID?: string;
  /** Render as a PLAIN box (no floating drop-shadow) — used for list rows. */
  flat?: boolean;
};

function Box({
  baseStyle,
  children,
  style,
  onPress,
  onLongPress,
  activeOpacity = 0.85,
  testID,
}: BoxProps & { baseStyle: StyleProp<ViewStyle> }) {
  if (onPress || onLongPress) {
    return (
      <TouchableOpacity
        style={[baseStyle, style]}
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={activeOpacity}
        testID={testID}
      >
        {children}
      </TouchableOpacity>
    );
  }
  return (
    <View style={[baseStyle, style]} testID={testID}>
      {children}
    </View>
  );
}

/** Outer floating description card. Pass `flat` for a plain (no-shadow) box. */
export function ShadowBox({ flat, ...props }: BoxProps) {
  return <Box baseStyle={flat ? styles.boxFlat : styles.box} {...props} />;
}

/** Nested floating sub-card, shown inside an expanded row / accordion body. */
export function ShadowBoxSubCard(props: BoxProps) {
  return <Box baseStyle={styles.subCard} {...props} />;
}

/** Small floating stat tile, meant to sit in a row/grid. */
export function ShadowBoxMini(props: BoxProps) {
  return <Box baseStyle={styles.mini} {...props} />;
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
  // Plain box — same chrome as `box` but WITHOUT the floating drop-shadow.
  boxFlat: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  // Flattened: content now sits directly inside the parent ShadowBox, with a
  // simple divider separating consecutive items (no nested floating card).
  subCard: {
    paddingHorizontal: 0,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  mini: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    ...(theme.elevation.md as object),
  },
}));

export default ShadowBox;
