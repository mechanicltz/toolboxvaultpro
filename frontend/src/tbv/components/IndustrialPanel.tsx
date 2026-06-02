/**
 * IndustrialPanel — native, scale-safe "machined steel" container used to skin
 * dashboard/list sections in the Toolbox Vault look. No stretched frame images
 * (so it never smears on long lists). Provides: gunmetal gradient face, beveled
 * metal edges, a top orange accent bar, and hardware bolts in the corners.
 *
 * variant="panel"  → primary section panel (bolts + accent bar)
 * variant="nested" → lighter inset sub-card (no bolts, slim accent)
 */
import React from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface Props {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: "panel" | "nested";
  accentBar?: boolean;
  testID?: string;
}

function Bolt({ style }: { style: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.bolt, style]}>
      <View style={styles.boltDot} />
    </View>
  );
}

export function IndustrialPanel({
  children,
  style,
  variant = "panel",
  accentBar = true,
  testID,
}: Props) {
  const nested = variant === "nested";
  return (
    <View
      testID={testID}
      style={[nested ? styles.wrapNested : styles.wrap, style]}
    >
      <LinearGradient
        colors={nested ? ["#212327", "#16181B", "#101113"] : ["#34373C", "#1E2024", "#131416"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {accentBar && (
        <LinearGradient
          colors={["#FF8A33", "#FF6A00"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={nested ? styles.accentBarNested : styles.accentBar}
        />
      )}
      {!nested && (
        <>
          <Bolt style={styles.boltTL} />
          <Bolt style={styles.boltTR} />
          <Bolt style={styles.boltBL} />
          <Bolt style={styles.boltBR} />
        </>
      )}
      <View style={nested ? styles.innerNested : styles.inner}>{children}</View>
    </View>
  );
}

const BEVEL = {
  borderTopColor: "rgba(255,255,255,0.14)",
  borderLeftColor: "rgba(255,255,255,0.07)",
  borderRightColor: "rgba(0,0,0,0.55)",
  borderBottomColor: "rgba(0,0,0,0.6)",
} as const;

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1.5,
    ...BEVEL,
  },
  wrapNested: {
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    ...BEVEL,
  },
  inner: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14 },
  innerNested: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  accentBar: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  accentBarNested: { position: "absolute", top: 0, left: 0, right: 0, height: 2, opacity: 0.85 },
  // Hardware bolts
  bolt: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#0C0D0F",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  boltDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  boltTL: { top: 7, left: 7 },
  boltTR: { top: 7, right: 7 },
  boltBL: { bottom: 7, left: 7 },
  boltBR: { bottom: 7, right: 7 },
});

export default IndustrialPanel;
