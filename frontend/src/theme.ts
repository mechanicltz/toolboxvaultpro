import { Platform } from "react-native";

export const theme = {
  // Workshop Pro Light — premium industrial, daylight-friendly, editorial, with 3D depth
  colors: {
    bg: "transparent",
    bgSecondary: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceAlt: "#FAF7F1",
    glass: "rgba(255, 255, 255, 0.92)",
    glassBorder: "#E5E1D8",
    accent: "#FFC107",
    accentSecondary: "#0F172A",
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    textMuted: "#94A3B8",
    textOnAccent: "#0F172A",
    border: "#D6D1C5",
    borderSubtle: "#EAE6DD",
    success: "#15803D",
    danger: "#B91C1C",
    warning: "#B45309",
    // Highlights for 3D depth
    highlight: "rgba(255, 255, 255, 0.85)",
    shadowDeep: "rgba(15, 23, 42, 0.18)",
    shadowSoft: "rgba(15, 23, 42, 0.08)",
  },
  gradients: {
    paper: ["#F7F4EE", "#EDE8DD", "#F7F4EE"],
    accent: ["#FFD54F", "#FFC107", "#FFA000"],
    accentRaised: ["#FFE082", "#FFC107"],
    surface: ["#FFFFFF", "#FAF7F1"],
    surfaceRaised: ["#FFFFFF", "#F1ECDF"],
    danger: ["#EF4444", "#B91C1C"],
    success: ["#22C55E", "#15803D"],
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  radii: { none: 0, sm: 6, md: 10, lg: 14, pill: 999 },
  font: { h1: 32, h2: 24, h3: 20, body: 16, sm: 14, xs: 12 },

  // 3D elevation system — multi-layer shadows for tactile depth
  elevation: {
    // Subtle lift (e.g. chips, inputs)
    sm: Platform.select({
      web: {
        boxShadow:
          "0 1px 1px rgba(15, 23, 42, 0.04), 0 2px 4px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.6)" as any,
      },
      default: {
        shadowColor: "#0F172A",
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: 1 },
        shadowRadius: 3,
        elevation: 2,
      },
    }),
    // Standard card lift
    md: Platform.select({
      web: {
        boxShadow:
          "0 1px 2px rgba(15, 23, 42, 0.06), 0 4px 8px rgba(15, 23, 42, 0.08), 0 8px 16px rgba(15, 23, 42, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.85)" as any,
      },
      default: {
        shadowColor: "#0F172A",
        shadowOpacity: 0.14,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
        elevation: 5,
      },
    }),
    // Raised: FAB, modals, banners
    lg: Platform.select({
      web: {
        boxShadow:
          "0 2px 4px rgba(15, 23, 42, 0.08), 0 8px 16px rgba(15, 23, 42, 0.10), 0 16px 32px rgba(15, 23, 42, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.85)" as any,
      },
      default: {
        shadowColor: "#0F172A",
        shadowOpacity: 0.20,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 18,
        elevation: 10,
      },
    }),
    // Glow lift for accent buttons (warm yellow)
    accent: Platform.select({
      web: {
        boxShadow:
          "0 2px 4px rgba(255, 160, 0, 0.30), 0 6px 14px rgba(255, 193, 7, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.6), inset 0 -2px 0 rgba(212, 130, 0, 0.25)" as any,
      },
      default: {
        shadowColor: "#FFA000",
        shadowOpacity: 0.45,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 10,
        elevation: 6,
      },
    }),
    // Pressed / recessed (search bars, inputs)
    inset: Platform.select({
      web: {
        boxShadow:
          "inset 0 1px 2px rgba(15, 23, 42, 0.10), inset 0 2px 4px rgba(15, 23, 42, 0.04)" as any,
      },
      default: {
        // RN doesn't support inset shadows natively
        borderTopWidth: 1,
        borderTopColor: "rgba(15, 23, 42, 0.08)",
      },
    }),
  },
};
