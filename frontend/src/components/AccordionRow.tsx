/**
 * AccordionRow — collapsible Description Card row used to compact the
 * Tool Edit screen. Visual language matches the read-only Description
 * Cards on the Tool detail screen: bgSecondary background, subtle border,
 * tiny (7pt) bold ALL-CAPS label on the left, right-aligned value on the
 * right (when collapsed), expand chevron, expanded body underneath.
 *
 * Per the user (2026-05-26): the Tool Edit screen has 25+ accordion rows
 * so each input is its own collapsed row. Model #(s) is the FIRST row.
 */
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

const c = theme.colors;

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
  /** Disable padding/border on the wrapper (use inside another card) */
  noBorder?: boolean;
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
  noBorder,
  testID,
}: Props): React.ReactElement {
  return (
    <View
      style={[
        styles.card,
        !noBorder && styles.cardBorder,
        open && styles.cardOpen,
      ]}
    >
      <TouchableOpacity
        testID={testID}
        activeOpacity={0.6}
        onPress={onToggle}
        style={styles.row}
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

      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  // Description Card body — matches tool/[id].tsx detailsBox so the edit
  // screen reads as the same visual family as the read-only detail screen.
  card: {
    backgroundColor: c.bgSecondary,
    borderRadius: 6,
    marginBottom: 8,
    overflow: "hidden",
    ...(theme.elevation.md as object),
  },
  cardBorder: {
    borderWidth: 1,
    borderColor: c.border,
  },
  cardOpen: {
    borderColor: c.accent,
  },
  // Header row — same metrics as detailsRow (paddingVertical:8, gap:8)
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  // detailsLabel: muted, fontSize 7, letterSpacing 1.5, ALL CAPS
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
  // detailsValue: textPrimary, fontSize 10, fontWeight 700, right-aligned
  value: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "right",
    flexShrink: 1,
  },
  // Expanded body: thin separator + comfortable inputs spacing
  body: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: c.borderSubtle,
  },
});

export default AccordionRow;
