/**
 * AccordionRow — a single collapsible row inside the shared Description Card
 * on the Tool Edit screen. Visual language MIRRORS the read-only Description
 * Card on tool/[id].tsx exactly: each row is a flat divider row (hairline
 * borderBottom in `borderSubtle`) sitting inside ONE parent `detailsBox`.
 *
 * Per user (2026-05-26):
 *  - All accordion rows must live inside ONE master Description Card —
 *    NOT 17 individual scattered cards.
 *  - Colors must respond to Light/Dark mode (the previous module-level
 *    StyleSheet.create snapshotted dark colors and looked off in light mode).
 *
 * The component is now visually transparent — no own background, no own
 * border, no own shadow, no own margin. It only paints a bottom hairline
 * unless `lastRow` is set. The parent container owns all chrome.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { themedStyles } from "../themeContext";
import { theme } from "../theme";

type Props = {
  /** Icon name from Ionicons set — left adornment */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Bold label e.g. "MODEL NUMBER(S)" */
  label: string;
  /** One-line preview of the current value when collapsed */
  summary?: string;
  /** Shows a small orange dot indicator on the header */
  required?: boolean;
  /** True = expanded (renders children below header) */
  open: boolean;
  /** Header tap handler */
  onToggle: () => void;
  /** Expanded content */
  children: React.ReactNode;
  /** When true, the row skips its bottom divider (use on the final row) */
  lastRow?: boolean;
  /** testID for testing */
  testID?: string;
};

export function AccordionRow({
  icon,
  label,
  summary,
  required,
  open,
  onToggle,
  children,
  lastRow,
  testID,
}: Props): React.ReactElement {
  const c = theme.colors;
  return (
    <View style={[styles.row, !lastRow && !open && styles.rowDivider]}>
      <TouchableOpacity
        testID={testID}
        activeOpacity={0.6}
        onPress={onToggle}
        style={styles.header}
      >
        <View style={styles.left}>
          {icon && (
            <Ionicons
              name={icon}
              size={13}
              color={open ? c.accent : c.textMuted}
              style={{ marginRight: 6 }}
            />
          )}
          <Text style={[styles.label, open && { color: c.accent }]}>
            {label}
            {required && <Text style={styles.requiredDot}>  •</Text>}
          </Text>
        </View>
        <View style={styles.right}>
          {!!summary && !open && (
            <Text style={styles.value} numberOfLines={1}>
              {summary}
            </Text>
          )}
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            color={open ? c.accent : c.textMuted}
          />
        </View>
      </TouchableOpacity>

      {open && (
        <View style={styles.body}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = themedStyles((c) => ({
  // No background / border / shadow / margin — parent `detailsBox` owns those.
  row: {
    backgroundColor: "transparent",
  },
  // Hairline between collapsed rows — matches detailsRow on tool/[id].tsx.
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  // Same metrics as detailsRow: paddingVertical 8, no horizontal padding
  // (the parent `detailsBox` pads horizontally for the whole stack).
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 8,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  // detailsLabel — muted, fontSize 7, letterSpacing 1.5, ALL CAPS
  label: {
    color: c.textMuted,
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  requiredDot: {
    color: c.accent,
    fontWeight: "900",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    maxWidth: "65%",
    justifyContent: "flex-end",
  },
  // detailsValue — textPrimary, fontSize 10, fontWeight 700, right-aligned
  value: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "right",
    flexShrink: 1,
  },
  // Expanded body — wrapped in a subtly accent-tinted inset panel so the
  // active input area visually pops out of the surrounding Description
  // Card. Per user (2026-05-26): "give the expanded area a slight bevelled
  // edge so it doesn't blend in".
  //
  // We use the theme's `glass` (soft accent-orange tint) + `glassBorder`
  // (matching orange-glow border) pair — those are theme-reactive and
  // already calibrated for dark + light modes.
  body: {
    backgroundColor: c.glass,
    borderWidth: 1.5,
    borderColor: c.accent,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 12,
    marginTop: 4,
    marginBottom: 10,
    ...(theme.elevation.input as object),
  },
  bodyDivider: {
    // Kept as a no-op for backward compat — the body now has its own
    // border on all sides, no separate divider needed.
  },
}));

export default AccordionRow;
