/**
 * Industrial design system — public exports.
 * Per Part 6 of the Toolbox Vault Industrial Design System.
 */
export * from "./tokens";
export * from "./TBVThemeContext";
export * from "./TBVText";
export * from "./tbvAssets";
export * from "./IndustrialButton";
export * from "./IndustrialCard";
export * from "./IndustrialInput";
export * from "./IndustrialPanel";
export * from "./IndustrialModal";
export * from "./IndustrialHeader";
export * from "./IndustrialStatCard";
export * from "./IndustrialToolCard";

// Back-compat alias retained for any leftover imports.
export { TBVThemeProvider as IndustrialThemeProvider } from "./TBVThemeContext";
