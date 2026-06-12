import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Modal,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import { PillButton } from "../components/PillButton";

import { themedStyles } from "../themeContext";

interface Props {
  receipts?: string[];
  /**
   * Optional add-receipt callback. When provided, an "ADD" pill is shown
   * even with zero receipts so the user can attach them right from the
   * tool detail page (user report #4).
   */
  onAdd?: () => void;
}

const { width: SCREEN_W } = Dimensions.get("window");

/**
 * View-only receipts gallery for the tool detail page.
 *
 * Reads `tool.receipts` (array of data: URIs or base64 strings written by the
 * receipt-scanner / "ADD RECEIPT" flow). Tapping any thumbnail opens a
 * fullscreen, horizontally-swipeable lightbox.
 */
export function ReceiptsSection({ receipts, onAdd }: Props) {
  const list = Array.isArray(receipts) ? receipts.filter(Boolean) : [];
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  // Even with zero receipts, render the section header + helper text so the
  // attachment family (Photos / Docs / Receipts) all look consistent
  // (per user 2026-05-26: match the DocumentsSection empty-state look).
  if (list.length === 0) {
    if (!onAdd) return null;
    return (
      <View>
        <View style={styles.headerRow}>
          <Text style={styles.sectionLabel}>RECEIPTS</Text>
          <PillButton
            testID="add-receipt-empty"
            label="ADD"
            icon="add-circle"
            variant="active"
            onPress={onAdd}
          />
        </View>
        <Text style={styles.empty}>
          Attach receipt photos for insurance, warranty claims, and PDF reports.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>RECEIPTS ({list.length})</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {onAdd && (
            <PillButton
              testID="add-receipt-header"
              label="ADD"
              icon="add-circle"
              variant="active"
              onPress={onAdd}
            />
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.thumbStrip}
      >
        {list.map((uri, i) => (
          <TouchableOpacity
            key={i}
            testID={`receipt-thumb-${i}`}
            onPress={() => {
              setIdx(i);
              setOpen(true);
            }}
            activeOpacity={0.85}
          >
            <View style={styles.thumbWrap}>
              <Image source={{ uri }} style={styles.thumb} />
              <View style={styles.thumbBadge}>
                <Ionicons name="receipt" size={10} color="#000" />
                <Text style={styles.thumbBadgeText}>{i + 1}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Fullscreen swipeable lightbox */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.lightboxBg}>
          <View style={styles.lightboxTopBar}>
            <Text style={styles.lightboxTitle}>
              RECEIPT {idx + 1} OF {list.length}
            </Text>
            <TouchableOpacity
              testID="receipt-close-btn"
              style={styles.lightboxClose}
              onPress={() => setOpen(false)}
              hitSlop={10}
            >
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
              if (i !== idx) setIdx(i);
            }}
            contentOffset={{ x: idx * SCREEN_W, y: 0 }}
            style={{ flex: 1 }}
          >
            {list.map((uri, i) => (
              <ScrollView
                key={i}
                maximumZoomScale={4}
                minimumZoomScale={1}
                style={{ width: SCREEN_W }}
                contentContainerStyle={styles.lightboxImageWrap}
                centerContent
              >
                <Image source={{ uri }} style={styles.lightboxImage} resizeMode="contain" />
              </ScrollView>
            ))}
          </ScrollView>
          {list.length > 1 && (
            <View style={styles.lightboxDots}>
              {list.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === idx && { backgroundColor: theme.colors.accent, width: 16 },
                  ]}
                />
              ))}
            </View>
          )}
          <Text style={styles.lightboxHint}>
            Pinch to zoom · swipe to view next
          </Text>
        </View>
      </Modal>
    </View>
  );
}

const styles = themedStyles((c) => ({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 6,
  },
  sectionLabel: {
    color: c.textMuted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
  },
  viewLink: {
    color: c.accent,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  // Match edit.tsx smallScanBtn — orange OUTLINE button + accent text +
  // small + icon (per user 2026-05-27 IMG_6430.png reference).
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: c.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: "transparent",
  },
  addBtnText: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  empty: {
    color: c.textMuted,
    fontSize: 10,
    fontStyle: "italic",
    paddingVertical: 4,
    lineHeight: 14,
  },
  thumbStrip: {
    gap: 8,
    paddingVertical: 6,
    paddingRight: 8,
  },
  thumbWrap: {
    position: "relative",
  },
  thumb: {
    width: 92,
    height: 92,
    borderRadius: 6,
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: c.border,
  },
  thumbBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: c.accent,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 999,
  },
  thumbBadgeText: {
    color: "#000",
    fontSize: 8,
    fontWeight: "900",
  },
  addPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: c.accent,
    backgroundColor: c.surface,
    marginTop: 6,
  },
  addPillText: {
    color: c.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  lightboxBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
  },
  lightboxTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 10,
  },
  lightboxTitle: {
    color: c.accent,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  lightboxClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxImageWrap: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  lightboxImage: {
    width: SCREEN_W,
    height: "100%",
    aspectRatio: undefined,
  },
  lightboxDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  lightboxHint: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 9,
    textAlign: "center",
    paddingBottom: 24,
    letterSpacing: 1,
  },
}));
