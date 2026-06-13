// Home screen styles — extracted from app/(tabs)/index.tsx to keep that
// screen file small (reduces the blast-radius of edits). Theme-reactive via
// themedStyles; behaviour/appearance is unchanged.
import { Platform, StyleSheet } from "react-native";
import { theme } from "../../theme";
import { themedStyles } from "../../themeContext";
import { TBV } from "../../tbv/skins";

export const styles = themedStyles((c) => ({
  container: { flex: 1, backgroundColor: "transparent" },
  bg: { flex: 1, backgroundColor: TBV.ink },
  bgVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,10,10,0.60)" },
  gateVeil: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,10,10,0.55)",
  },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 2,
  },
  // Industrial header — centered TOOLBOX VAULT nameplate over the textured
  // steel plate, with an orange hairline groove beneath (matches login).
  header: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  nameplate: { width: "92%", maxWidth: 380, height: 82 },
  // Native-text TOOLBOX VAULT wordmark (replaces the PNG nameplate).
  wordmark: {
    fontFamily: "BebasNeue_400Regular",
    fontSize: 40,
    letterSpacing: 2.5,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  wordmarkSteel: { color: "#D8D8D8" },
  wordmarkVault: { color: c.accent },
  // Top-right build beacon — bright + bold so it's unmistakable.
  buildStamp: {
    position: "absolute",
    top: 10,
    right: 92,
    zIndex: 100,
    color: c.accent,
    fontFamily: "Rajdhani_700Bold",
    fontSize: 13,
    letterSpacing: 1.5,
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  headerSub: {
    color: c.accent,
    fontFamily: "Rajdhani_700Bold",
    fontSize: 11,
    letterSpacing: 3,
    marginTop: 6,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  title: {
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2.5,
    flexShrink: 1,
  },
  subtitle: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: 3,
  },
  versionLine: {
    color: c.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginTop: 4,
  },

  /* Decorative center logo on Home — fixed height so even large user
     photos render as a contained thumbnail. Width is responsive (fills
     the content padding) and resizeMode="contain" preserves aspect
     ratio so square photos AND wide banners both look right. */
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoImage: {
    width: "60%",
    height: 140,
  },

  /* #23 — Quick actions (Add Item / New Claim) */
  quickRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  quickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
  },
  quickBtnText: {
    color: c.textPrimary,
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1,
  },
  quickBtnSkin: {
    flex: 1,
    height: 40,
    overflow: "hidden",
    borderRadius: 6,
  },
  quickBtnSkinFill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  quickBtnSkinImg: {
    borderRadius: 6,
  },
  quickBtnSkinText: {
    color: "#0A0A0A",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 1,
    // Raised slightly so the label sits centered on the skinned button plate
    // (the plate art has a thicker bottom bevel that pushed text low).
    marginBottom: 4,
  },

  /* Highlighted next-route banner */
  bannerLayout: { marginBottom: 14 },
  routeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  routeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.accent,
  },
  routeBannerLabel: {
    color: c.accent,
    fontFamily: "BebasNeue_400Regular",
    fontSize: 12,
    letterSpacing: 1.4,
  },
  routeBannerText: {
    color: TBV.steel,
    fontFamily: "Rajdhani_700Bold",
    fontSize: 13,
    marginTop: 2,
  },

  /* Main list — claim-screen style: separate cards w/ rounded corners + small gap */
  list: {
    gap: 8,
  },

  // ---------- DETAILS BOX (warranty-card style, mirrors tool/dealer detail) ----------
  detailsBoxLayout: { marginBottom: 14 },
  nestedCardLayout: { marginVertical: 6 },
  detailsBox: {
    backgroundColor: "rgba(18,18,18,0.92)",
    borderWidth: 1.5,
    borderColor: "rgba(255,133,51,0.45)",
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    ...(Platform.select({
      web: { boxShadow: "0 4px 14px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)" as any },
      default: { shadowColor: "#000", shadowOpacity: 0.6, shadowOffset: { width: 0, height: 5 }, shadowRadius: 10, elevation: 8 },
    }) as object),
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginVertical: 2,
    borderRadius: 6,
    // Deep recessed "machined slot" — each line is its own seated container.
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderTopColor: "rgba(0,0,0,0.85)",
    borderLeftColor: "rgba(0,0,0,0.7)",
    borderRightColor: "rgba(255,255,255,0.07)",
    borderBottomColor: "rgba(255,255,255,0.11)",
    gap: 6,
  },
  // Orange accent tick to the left of every row label (control-panel readout).
  rowTick: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    backgroundColor: c.accent,
    marginRight: 10,
  },
  rowLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    marginRight: 4,
  },
  detailsRowLast: {
    borderBottomWidth: 0,
  },
  detailsLabel: {
    color: TBV.textMuted,
    fontFamily: "BebasNeue_400Regular",
    fontSize: 14,
    letterSpacing: 1.2,
  },
  detailsRowSub: {
    color: c.accent,
    fontFamily: "Rajdhani_600SemiBold",
    fontSize: 9,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  detailsValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
    justifyContent: "flex-end",
  },
  detailsValue: {
    color: TBV.steel,
    fontFamily: "BebasNeue_400Regular",
    fontSize: 14,
    letterSpacing: 0.5,
    textAlign: "right",
    flexShrink: 0,
    // Recessed "gauge readout" chip — hugs the number, no dead space.
    backgroundColor: "rgba(0,0,0,0.34)",
    borderColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
  },
  valueMuted: { color: TBV.textMuted },
  noChip: { backgroundColor: "transparent", borderWidth: 0, paddingHorizontal: 0 },
  // Dealer rows inside the dealer-accounts card use a slightly larger name
  // since the dealer name is the row's primary identifier (analogous to the
  // agent rows on the dealer detail screen).
  dealerRowName: {
    color: TBV.steel,
    fontFamily: "Rajdhani_700Bold",
    fontSize: 14,
  },
  dealerAdjustChip: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: c.accent,
    borderRadius: 5,
  },
  dealerAdjustChipText: {
    color: c.accent,
    fontFamily: "BebasNeue_400Regular",
    fontSize: 14,
    letterSpacing: 0,
  },

  // ---------- NESTED SUB-CARD (used for DEALER ACCOUNTS inside the main
  // Description Card so the dealer cluster reads as a card-within-a-card). ----------
  nestedCard: {
    backgroundColor: "rgba(8,8,8,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,133,51,0.22)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginVertical: 6,
  },
  // The header row inside the nested card gets an emphasized bottom border so
  // it visually separates from the dealer list directly below it.
  nestedHeaderRow: {
    borderBottomColor: c.border,
  },
  // The TOTAL footer inside the dealer sub-card — label uses the same
  // typography as every other row label in the Description Card; only the
  // value is accent-colored so the grand total still reads as a "total"
  // without breaking the visual rhythm of the rest of the card.
  nestedTotalRow: {
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 10,
    marginTop: 2,
  },
  nestedTotalLabel: {
    color: TBV.steel,
    fontFamily: "BebasNeue_400Regular",
    fontSize: 14,
    letterSpacing: 1.5,
  },
  nestedTotalValue: {
    color: c.accent,
    fontFamily: "BebasNeue_400Regular",
    fontSize: 14,
    letterSpacing: 1.2,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: c.bgSecondary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    ...(theme.elevation.md as object),
  },
  rowNested: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "transparent",
  },
  // Layout-only style for SummaryRow when rendered through BevelCard. The
  // BevelCard supplies the gradient surface + borders + drop shadow — this
  // block just controls inner flex layout & padding.
  rowOuter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  /* Sharp Bevel 3D — the OUTER pillbox gets a chiseled bevel: thicker
     lighter top + left edge (highlight catching light from the top), thicker
     darker bottom + right edge (drop-off shadow). A visible offset outer
     drop shadow lifts the whole tile off the page. Layout dimensions stay
     identical to the standard `row` style. */
  rowBevel: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    // Uniform 2px borders on every side — only the COLOURS differ — so the
    // corner mitering stays clean.
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderTopColor: c.bevelHighlight,
    borderLeftColor: c.bevelHighlight,
    borderBottomColor: c.bevelShadow,
    borderRightColor: c.bevelShadow,
    overflow: "hidden",
    ...(Platform.select({
      web: {
        boxShadow: `4px 4px 0 ${c.bevelDrop}, 6px 6px 12px ${c.bevelDrop}` as any,
      },
      default: {
        shadowColor: "#000",
        shadowOpacity: 0.55,
        shadowOffset: { width: 3, height: 5 },
        shadowRadius: 6,
        elevation: 8,
      },
    }) as object),
  },
  bevelGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  bevelInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.bg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: c.border,
  },
  rowLabel: {
    color: c.textPrimary,
    ...theme.text.default,
  },
  rowSub: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "600",
    marginTop: 2,
    letterSpacing: 0.3,
  },
  rowValuePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: c.bg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    minWidth: 64,
    alignItems: "center",
    marginLeft: 6,
  },
  rowValue: {
    color: c.textPrimary,
    ...theme.text.default,
  },

  /* Dealer rows (two-line) — nested inside the OWED TO DEALERS card */
  emptyInline: {
    color: c.textMuted,
    fontSize: 10,
    fontStyle: "italic",
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlign: "center",
  },
  owedCluster: {
    backgroundColor: c.bgSecondary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    overflow: "hidden",
    ...(theme.elevation.md as object),
  },
  owedDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  /* Subtotal row pinned to the bottom of the DEALER ACCOUNTS cluster — sums
     up everything owed across all dealers above. Transparent background so
     it inherits the parent gradient surface (no jarring darker rectangle). */
  owedTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "transparent",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  owedTotalLabel: {
    color: c.textMuted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  owedTotalValue: {
    color: c.accent,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  dealerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  // ── Plain Description-Card styles (restored from the 05-30 backup) ──
  // A single box of flat label/value rows, with the dealer cluster as a
  // nested card-within-a-card. All palette-aware so Plain Light + Dark work.
  pdBox: {
    backgroundColor: c.bgSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
    ...(theme.elevation.md as object),
  },
  // Outer ShadowBox layout wrapper (chrome owned by <ShadowBox/>).
  pdBoxWrap: { marginBottom: 12 },
  pdRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  pdRowIcon: { marginRight: 10 },
  pdRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
    gap: 8,
  },
  pdRowLast: { borderBottomWidth: 0 },
  pdLabel: {
    color: c.textMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  pdSub: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 1.2,
    marginTop: 2,
  },
  pdValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    justifyContent: "flex-end",
  },
  pdValue: {
    color: c.textPrimary,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
    flexShrink: 1,
  },
  pdDealerName: {
    color: c.textPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
  pdDealerPaySub: {
    color: c.accent,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  detailsDealerPaySub: {
    color: c.accent,
    fontFamily: "Rajdhani_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.3,
    marginTop: 1,
  },
  pdAdjustChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1.5,
    borderColor: c.accent,
    borderRadius: 6,
  },
  pdAdjustChipText: {
    color: c.accent,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  pdNestedCard: {
    backgroundColor: c.bg,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginVertical: 6,
  },
  pdNestedHeaderRow: { borderBottomColor: c.border },
  pdNestedTotalRow: {
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 10,
    marginTop: 2,
  },
  pdNestedTotalLabel: {
    color: c.textMuted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  pdNestedTotalValue: {
    color: c.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  dealerName: {
    flex: 1,
    color: c.textPrimary,
    ...theme.text.default,
  },
  dealerTotal: {
    color: c.textPrimary,
    fontSize: 11,
    fontWeight: "900",
    minWidth: 64,
    textAlign: "right",
  },
  dealerBalancePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: c.bg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    minWidth: 76,
    alignItems: "center",
  },
  dealerBalancePillText: {
    color: c.textPrimary,
    fontSize: 10,
    fontWeight: "900",
  },
  dealerAdjustPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: c.accent,
    borderRadius: 999,
  },
  dealerAdjustText: {
    color: "#000",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  /* Feedback */
  feedbackLayout: { marginTop: 16 },
  feedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  feedbackTitle: {
    color: TBV.steel,
    fontFamily: "BebasNeue_400Regular",
    fontSize: 14,
    letterSpacing: 1,
  },
  feedbackSub: {
    color: TBV.textMuted,
    fontFamily: "Rajdhani_600SemiBold",
    fontSize: 11,
    marginTop: 3,
  },
  tip: {
    color: TBV.textMuted,
    fontFamily: "Rajdhani_500Medium",
    fontSize: 10,
    textAlign: "center",
    marginTop: 14,
  },
  // ---- PLAIN MODE (non-skinned) Home layout ----
  plainSafe: { flex: 1, backgroundColor: c.canvas },
  plainContent: { padding: 16, paddingBottom: 110, gap: 10 },
  plainBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  plainBannerLabel: {
    color: c.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  plainBannerText: {
    color: c.textPrimary,
    ...theme.text.default,
    marginTop: 3,
  },
  // Plain-mode flat stat list (mimics the pre-skin home layout). Rows are
  // hairline-divided lines with NO icon chips / per-row cards, and they use the
  // exact same `theme.text.default` size + weight as the dealer rows so the
  // dealer section and the rows below it read as one uniform list.
  plainStatList: {
    paddingHorizontal: 2,
  },
  plainStatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
    gap: 10,
  },
  plainStatRowLast: { borderBottomWidth: 0 },
  plainStatLabel: {
    color: c.textPrimary,
    ...theme.text.default,
    letterSpacing: 1,
  },
  plainStatSub: {
    color: c.textMuted,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginTop: 2,
  },
  plainStatValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  plainStatValue: {
    color: c.textPrimary,
    ...theme.text.default,
    textAlign: "right",
  },
  plainBuildStamp: {
    position: "absolute",
    top: 6,
    right: 10,
    zIndex: 50,
    color: c.textMuted,
    fontSize: 9,
    fontWeight: "700",
    opacity: 0.7,
  },
  // Old-style plain Home text header (TOOLBOX VAULT / SUMMARY / version + ADD ITEM)
  plainHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.borderSubtle,
  },
  plainTitle: {
    color: c.textPrimary,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 2,
  },
  plainSummary: {
    color: c.accent,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 3,
    marginTop: 2,
  },
  plainVersion: {
    color: c.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 2,
  },
  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: c.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  addItemText: {
    color: c.accent,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
  // Readable bottom hint for plain mode (the global `tip` uses a hardcoded
  // muted grey that is too light to read on the light palette).
  plainTip: {
    color: c.textSecondary,
    fontSize: 12,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 16,
  },
}));
