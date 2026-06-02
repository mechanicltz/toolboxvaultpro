/**
 * Toolbox Vault design tokens — one set per theme. Unified accent #FF6A00.
 * Consumed via useTbvTheme(); never hard-code these hexes in screens.
 */
export interface TbvTokens {
  orange: string;
  orangeDeep: string;
  headSteel: string; // "TOOLBOX" word
  headVault: string; // "VAULT" word
  text: string;
  textMuted: string;
  value: string;
  pageVeil: string;     // overlay on the background image for legibility
  cardBorder: string;   // strong orange keyline
  cardBorderSoft: string;
  divider: string;
  ink: string;          // text color on top of the orange button
}

export const TBV_TOKENS: { dark: TbvTokens; light: TbvTokens } = {
  dark: {
    orange: "#FF6A00",
    orangeDeep: "#E55F00",
    headSteel: "#D8D8D8",
    headVault: "#FF6A00",
    text: "#F2F2F2",
    textMuted: "#C8C8C8",
    value: "#E8E8E8",
    pageVeil: "rgba(10,10,10,0.55)",
    cardBorder: "rgba(255,106,0,0.45)",
    cardBorderSoft: "rgba(255,106,0,0.22)",
    divider: "rgba(255,255,255,0.08)",
    ink: "#0A0A0A",
  },
  light: {
    orange: "#FF6A00",
    orangeDeep: "#E55F00",
    headSteel: "#3A3A3A",
    headVault: "#FF6A00",
    text: "#1A1A1A",
    textMuted: "#5A5A5A",
    value: "#1A1A1A",
    pageVeil: "rgba(244,246,248,0.30)",
    cardBorder: "rgba(255,106,0,0.55)",
    cardBorderSoft: "rgba(255,106,0,0.30)",
    divider: "rgba(0,0,0,0.10)",
    ink: "#0A0A0A",
  },
};
