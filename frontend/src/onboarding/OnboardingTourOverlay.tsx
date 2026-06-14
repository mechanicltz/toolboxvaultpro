// First-run onboarding tour — visual overlay.
//
// Mounted once at the root (inside ShellNav). When the tour is active it dims
// the screen (focusing attention + blocking accidental taps) and shows a themed
// coaching card with the step, a "where to look" hint, progress dots and
// Back / Next / Skip controls.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "../themeContext";
import { useOnboardingTour } from "./OnboardingTour";

export function OnboardingTourOverlay() {
  const { active, steps, index, next, back, stop } = useOnboardingTour();
  const c = useColors();
  const insets = useSafeAreaInsets();

  if (!active || !steps.length) return null;

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const isFirst = index === 0;

  return (
    <View style={styles.fill} pointerEvents="auto" testID="onboarding-tour-overlay">
      {/* Dim layer — captures touches so the screen underneath isn't tappable
          mid-tour. The user advances with NEXT. */}
      <View style={styles.dim} />

      <View
        style={[styles.cardWrap, { paddingBottom: insets.bottom + 78 }]}
        pointerEvents="box-none"
      >
        <View
          style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}
          testID="onboarding-tour-card"
        >
          <View style={styles.headerRow}>
            <View style={[styles.iconCircle, { backgroundColor: c.accent }]}>
              <Ionicons name={step.icon} size={20} color={c.textOnAccent} />
            </View>
            <Text style={[styles.stepCount, { color: c.textMuted }]}>
              STEP {index + 1} OF {steps.length}
            </Text>
            <TouchableOpacity
              testID="onboarding-tour-skip"
              onPress={stop}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={[styles.skip, { color: c.textMuted }]}>SKIP</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.title, { color: c.textPrimary }]}>{step.title}</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>{step.body}</Text>

          {step.hint ? (
            <View style={[styles.hintRow, { borderColor: c.border }]}>
              <Ionicons name="arrow-forward-circle" size={15} color={c.accent} />
              <Text style={[styles.hintText, { color: c.textSecondary }]}>{step.hint}</Text>
            </View>
          ) : null}

          <View style={styles.dotsRow}>
            {steps.map((s, i) => (
              <View
                key={s.key}
                style={[
                  styles.dot,
                  { backgroundColor: i === index ? c.accent : c.border },
                  i === index && styles.dotActive,
                ]}
              />
            ))}
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity
              testID="onboarding-tour-back"
              disabled={isFirst}
              onPress={back}
              activeOpacity={0.8}
              style={[
                styles.backBtn,
                { borderColor: c.border, opacity: isFirst ? 0.4 : 1 },
              ]}
            >
              <Ionicons name="arrow-back" size={15} color={c.textSecondary} />
              <Text style={[styles.backBtnText, { color: c.textSecondary }]}>BACK</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="onboarding-tour-next"
              onPress={next}
              activeOpacity={0.85}
              style={[styles.nextBtn, { backgroundColor: c.accent }]}
            >
              <Text style={[styles.nextBtnText, { color: c.textOnAccent }]}>
                {isLast ? "FINISH" : "NEXT"}
              </Text>
              <Ionicons
                name={isLast ? "checkmark" : "arrow-forward"}
                size={16}
                color={c.textOnAccent}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, zIndex: 9000, elevation: 9000 },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(6,7,9,0.66)" },
  cardWrap: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCount: { flex: 1, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  skip: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  title: { fontSize: 19, fontWeight: "900", letterSpacing: 0.2, marginBottom: 6 },
  body: { fontSize: 14, lineHeight: 20 },
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  hintText: { flex: 1, fontSize: 12.5, lineHeight: 17, fontWeight: "600" },
  dotsRow: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 16 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 18 },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
  },
  backBtnText: { fontSize: 13, fontWeight: "800", letterSpacing: 0.6 },
  nextBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  nextBtnText: { fontSize: 14, fontWeight: "900", letterSpacing: 0.8 },
});
