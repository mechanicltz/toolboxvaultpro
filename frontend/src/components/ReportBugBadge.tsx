import React from "react";
import {
  Image,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
  ImageSourcePropType,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSkin } from "../themeContext";
import type { IndustrialVariant } from "../tbv/skins";

// Industrial "REPORT A BUG · REQUEST FEATURES" badge (transparent PNG).
// One asset per colour variant — plain Light/Dark force the orange base, the
// industrial colour themes (crimson/arctic/emerald) follow their accent hue.
const BADGES: Record<IndustrialVariant, ImageSourcePropType> = {
  orange: require("../../assets/tbv/report-bug-badge.png"),
  pink: require("../../assets/tbv/report-bug-badge-pink.png"),
  arctic: require("../../assets/tbv/report-bug-badge-arctic.png"),
  emerald: require("../../assets/tbv/report-bug-badge-emerald.png"),
  steel: require("../../assets/tbv/report-bug-badge-steel.png"),
};
// Native trimmed dimensions (W/H). Steel uses its own taller artwork.
const ASPECTS: Record<IndustrialVariant, number> = {
  orange: 1200 / 415,
  pink: 1200 / 415,
  arctic: 1200 / 415,
  emerald: 1200 / 415,
  steel: 1713 / 918,
};

type Props = {
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Total horizontal space (px) taken by surrounding padding/margins. */
  inset?: number;
  /** Cap the width so it doesn't get huge on tablets. */
  maxWidth?: number;
};

export default function ReportBugBadge({
  style,
  testID = "feedback-banner",
  inset = 32,
  maxWidth = 520,
}: Props) {
  const router = useRouter();
  const { industrialVariant } = useSkin();
  const { width: screenW } = useWindowDimensions();

  const source = BADGES[industrialVariant] ?? BADGES.orange;
  const aspect = ASPECTS[industrialVariant] ?? ASPECTS.orange;

  // Explicit pixel size so the image never falls back to its intrinsic
  // (giant) dimensions when a parent's width isn't determinate.
  const w = Math.min(Math.max(screenW - inset, 120), maxWidth);
  const h = w / aspect;

  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.85}
      onPress={() => router.push("/feedback")}
      style={[{ alignSelf: "center" }, style]}
      accessibilityRole="button"
      accessibilityLabel="Report a bug or request a feature"
    >
      <Image source={source} style={{ width: w, height: h }} resizeMode="contain" />
    </TouchableOpacity>
  );
}
