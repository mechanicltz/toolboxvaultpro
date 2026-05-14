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

import { themedStyles } from "../themeContext";

interface Props {
  receipts?: string[];
}

const { width: SCREEN_W } = Dimensions.get("window");

/**
 * View-only receipts gallery for the tool detail page.
 *
 * Reads `tool.receipts` (array of data: URIs or base64 strings written by the
 * receipt-scanner / "ADD RECEIPT" flow). Tapping any thumbnail opens a
 * fullscreen, horizontally-swipeable lightbox.
 */
export function ReceiptsSection({ receipts }: Props) {
  const list = Array.isArray(receipts) ? receipts.filter(Boolean) : [];
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);

  if (list.length === 0) return null;

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>RECEIPTS ({list.length})</Text>
        <TouchableOpacity
          testID="view-receipts-link"
          onPress={() => {
            setIdx(0);
            setOpen(true);
          }}
          activeOpacity={0.7}
          hitSlop={6}
        >
          <Text style={styles.viewLink}>VIEW ALL ›</Text>
        </TouchableOpacity>
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
