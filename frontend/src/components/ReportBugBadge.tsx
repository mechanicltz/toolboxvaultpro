import React from "react";
import {
  Image,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";

// Industrial "REPORT A BUG · REQUEST FEATURES" badge (transparent PNG).
const BADGE = require("../../assets/tbv/report-bug-badge.png");
const ASPECT = 1204 / 484; // native trimmed dimensions (W/H)

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
  const { width: screenW } = useWindowDimensions();

  // Explicit pixel size so the image never falls back to its intrinsic
  // (giant) dimensions when a parent's width isn't determinate.
  const w = Math.min(Math.max(screenW - inset, 120), maxWidth);
  const h = w / ASPECT;

  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.85}
      onPress={() => router.push("/feedback")}
      style={[{ alignSelf: "center" }, style]}
      accessibilityRole="button"
      accessibilityLabel="Report a bug or request a feature"
    >
      <Image source={BADGE} style={{ width: w, height: h }} resizeMode="contain" />
    </TouchableOpacity>
  );
}
