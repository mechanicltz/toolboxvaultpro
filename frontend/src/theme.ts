import { Platform } from "react-native";

export const theme = {
  // Original Industrial Dark — yellow/black workshop, with 3D depth
  colors: {
    bg: "#0A0A0A",
    bgSecondary: "#1A1A1A",
    surface: "#0F0F0F",
    surfaceAlt: "#171717",
    glass: "rgba(255, 179, 0, 0.06)",
    glassBorder: "rgba(255, 179, 0, 0.18)",
    accent: "#FFB300",
    accentSecondary: "#F97316",
    textPrimary: "#FFFFFF",
    textSecondary: "#E5E5E5",
    textMuted: "#737373",
    textOnAccent: "#000000",
    border: "#2D2D2D",
    borderSubtle: "#1F1F1F",
    success: "#10B981",
    danger: "#EF4444",
    warning: "#F59E0B",
    highlight: "rgba(255, 255, 255, 0.10)",
    shadowDeep: "rgba(0, 0, 0, 0.8)",
    shadowSoft: "rgba(0, 0, 0, 0.5)",
  },
  gradients: {
    base: ["#0A0A0A", "#181818", "#0A0A0A"],
    accent: ["#FFD54F", "#FFB300", "#FF8F00"],
    danger: ["#F87171", "#DC2626"],
    success: ["#34D399", "#059669"],
    surface: ["#202020", "#0F0F0F"],
    surfaceRaised: ["#262626", "#101010"],
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  radii: { none: 0, sm: 4, md: 8, lg: 12, pill: 999 },
  font: { h1: 32, h2: 24, h3: 20, body: 16, sm: 14, xs: 12 },
  // 3D elevation system (dark theme — light highlights, deep black drop shadows)
  elevation: {
    sm: Platform.select({
      web: {
        boxShadow:
          "0 1px 2px rgba(0, 0, 0, 0.50), 0 3px 6px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.10), inset 0 -1px 0 rgba(0, 0, 0, 0.50)" as any,
      },
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.45,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 5,
        elevation: 4,
      },
    }),
    md: Platform.select({
      web: {
        boxShadow:
          "0 2px 4px rgba(0, 0, 0, 0.55), 0 8px 16px rgba(0, 0, 0, 0.50), 0 16px 32px rgba(0, 0, 0, 0.40), inset 0 1px 0 rgba(255, 255, 255, 0.12), inset 0 -2px 0 rgba(0, 0, 0, 0.50)" as any,
      },
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.55,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 12,
        elevation: 8,
      },
    }),
    lg: Platform.select({
      web: {
        boxShadow:
          "0 4px 8px rgba(0, 0, 0, 0.60), 0 16px 32px rgba(0, 0, 0, 0.55), 0 32px 64px rgba(0, 0, 0, 0.45), inset 0 2px 0 rgba(255, 255, 255, 0.12), inset 0 -3px 0 rgba(0, 0, 0, 0.55)" as any,
      },
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.65,
        shadowOffset: { width: 0, height: 14 },
        shadowRadius: 24,
        elevation: 14,
      },
    }),
    accent: Platform.select({
      web: {
        boxShadow:
          "0 4px 8px rgba(255, 143, 0, 0.45), 0 12px 24px rgba(255, 179, 0, 0.40), 0 20px 40px rgba(255, 179, 0, 0.20), inset 0 2px 0 rgba(255, 255, 255, 0.40), inset 0 -3px 0 rgba(184, 100, 0, 0.55)" as any,
      },
      default: {
        shadowColor: "#FF8F00",
        shadowOpacity: 0.65,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 16,
        elevation: 12,
      },
    }),
    inset: Platform.select({
      web: {
        boxShadow:
          "inset 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 4px 10px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(0, 0, 0, 0.4)" as any,
      },
      default: {
        borderTopWidth: 1,
        borderTopColor: "rgba(0, 0, 0, 0.6)",
      },
    }),
  },
};
