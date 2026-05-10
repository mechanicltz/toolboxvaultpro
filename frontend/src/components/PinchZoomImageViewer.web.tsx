// Web fallback — browser already provides native pinch/scroll zoom on
// images, so we render a simple full-screen modal containing a large image.
// Trackpad / mobile-Safari pinch / Ctrl+scroll all work out of the box.
import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type PinchZoomImageViewerProps = {
  images: { uri: string }[];
  imageIndex: number;
  visible: boolean;
  onRequestClose: () => void;
};

export default function PinchZoomImageViewer({
  images,
  imageIndex,
  visible,
  onRequestClose,
}: PinchZoomImageViewerProps) {
  const [idx, setIdx] = useState(imageIndex);
  useEffect(() => {
    setIdx(imageIndex);
  }, [imageIndex, visible]);

  if (!images || images.length === 0) return null;
  const cur = images[idx] || images[0];
  const hasMany = images.length > 1;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <Pressable style={s.backdrop} onPress={onRequestClose}>
        {/* Scroll wrapper lets web users zoom in via Ctrl/Cmd+scroll or pinch */}
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          bouncesZoom
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          pinchGestureEnabled
        >
          {/* eslint-disable-next-line react-native/no-inline-styles */}
          <Pressable onPress={(e: any) => e.stopPropagation && e.stopPropagation()}>
            <Image
              source={{ uri: cur.uri }}
              style={s.image as any}
              resizeMode="contain"
            />
          </Pressable>
        </ScrollView>

        <TouchableOpacity
          onPress={onRequestClose}
          style={s.closeBtn}
          hitSlop={12}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>

        {hasMany && (
          <>
            <TouchableOpacity
              style={[s.navBtn, { left: 12 }]}
              onPress={() => setIdx((i) => (i - 1 + images.length) % images.length)}
              hitSlop={12}
            >
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.navBtn, { right: 12 }]}
              onPress={() => setIdx((i) => (i + 1) % images.length)}
              hitSlop={12}
            >
              <Ionicons name="chevron-forward" size={28} color="#fff" />
            </TouchableOpacity>
          </>
        )}
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { width: "100%", height: "100%" },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  image: {
    width: "95vw" as any,
    height: "85vh" as any,
    maxWidth: 1400,
  },
  closeBtn: {
    position: "absolute",
    top: 18,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  navBtn: {
    position: "absolute",
    top: "48%" as any,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
});
