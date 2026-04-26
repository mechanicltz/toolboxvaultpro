export const theme = {
  // Cyber HUD — futuristic, terminal/Tron, neon glow
  colors: {
    bg: "transparent", // grid is rendered in HUD background
    bgSecondary: "rgba(0, 8, 20, 0.78)",
    surface: "rgba(0, 30, 50, 0.65)",
    surfaceAlt: "rgba(0, 18, 36, 0.78)",
    glass: "rgba(0, 240, 255, 0.06)",
    glassBorder: "rgba(0, 240, 255, 0.30)",
    accent: "#00F0FF", // neon cyan
    accentSecondary: "#FF00C8", // magenta
    textPrimary: "#E6FBFF",
    textSecondary: "#7EC8D9",
    textMuted: "#4A6F7C",
    textOnAccent: "#000814",
    border: "rgba(0, 240, 255, 0.25)",
    borderSubtle: "rgba(0, 240, 255, 0.10)",
    success: "#00FF87",
    danger: "#FF3366",
    warning: "#FFB800",
  },
  gradients: {
    cyber: ["#000814", "#001428", "#000814"],
    cyberAccent: ["#00F0FF", "#0077FF"],
    cyberDanger: ["#FF3366", "#FF00C8"],
    cyberSuccess: ["#00FF87", "#00F0FF"],
    glass: ["rgba(0, 240, 255, 0.10)", "rgba(0, 240, 255, 0.02)"],
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radii: {
    none: 0,
    sm: 0,
    md: 2,
    lg: 4,
    pill: 999,
  },
  font: {
    h1: 32,
    h2: 24,
    h3: 20,
    body: 16,
    sm: 14,
    xs: 12,
  },
  // Glow shadows (web-friendly)
  glow: {
    cyan: "0 0 20px rgba(0, 240, 255, 0.6)",
    magenta: "0 0 20px rgba(255, 0, 200, 0.5)",
    danger: "0 0 16px rgba(255, 51, 102, 0.5)",
    success: "0 0 16px rgba(0, 255, 135, 0.45)",
  },
};
