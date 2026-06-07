import React from "react";
import {
  Image,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";

// Industrial "REPORT A BUG · REQUEST FEATURES" badge (transparent PNG).
const BADGE = require("../../assets/tbv/report-bug-badge.png");
const ASPECT = 1204 / 484; // native trimmed dimensions

type Props = {
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export default function ReportBugBadge({ style, testID = "feedback-banner" }: Props) {
  const router = useRouter();
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.85}
      onPress={() => router.push("/feedback")}
      style={style}
      accessibilityRole="button"
      accessibilityLabel="Report a bug or request a feature"
    >
      <Image source={BADGE} style={styles.img} resizeMode="contain" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  img: { width: "100%", aspectRatio: ASPECT },
});
