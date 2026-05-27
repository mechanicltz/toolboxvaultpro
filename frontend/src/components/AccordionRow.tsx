/**
 * AccordionRow — collapsible Description Card row used to compact the
 * Tool Edit screen. Tap the header to expand/collapse; expanded content is
 * rendered inline below the header.
 *
 * Per the user (2026-05-26): the Tool Edit screen now has 25+ accordion
 * rows so each input is its own collapsed row. Model #(s) is the FIRST
 * row — that field is critical to the upcoming AI model-lookup feature.
 *
 * Behavior:
 *  - `open` and `onToggle` control whether the body is rendered. The PARENT
 *    owns the state so the caller can enforce single-expand if desired.
 *  - `summary` (optional) is a one-line preview of the current value shown
 *    on the right side of the header while collapsed.
 *  - `required` adds a small orange "•" dot — borrowed from the warranty
 *    cards' visual language.
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
        styles.wrap,
        !noBorder && styles.wrapBorder,
        open && styles.wrapOpen,
      ]}
    >
      <TouchableOpacity
        testID={testID}
        activeOpacity={0.6}
        onPress={onToggle}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          {icon && (
            <Ionicons
              name={icon}
              size={18}
              color={open ? c.accent : c.textMuted}
              style={{ marginRight: 8 }}
            />
          )}
          <Text style={[styles.label, open && { color: c.accent }]}>
            {label}
            {required && <Text style={styles.requiredDot}>  •</Text>}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {!!summary && !open && (
            <Text style={styles.summary} numberOfLines={1}>
              {summary}
            </Text>
          )}
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={20}
            color={open ? c.accent : c.textMuted}
          />
        </View>
      </TouchableOpacity>

      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: c.surface,
    borderRadius: 10,
    marginBottom: 10,
    overflow: "hidden",
  },
  wrapBorder: {
    borderWidth: 1,
    borderColor: c.border,
  },
  wrapOpen: {
    borderColor: c.accent,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  label: {
    color: c.textPrimary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  requiredDot: {
    color: c.accent,
    fontWeight: "900",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "55%",
  },
  summary: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
});

export default AccordionRow;
