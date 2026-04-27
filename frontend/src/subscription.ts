/**
 * Subscription tier + free-limit utilities.
 *
 * Tiers:
 *   - free:     10 tools, 1 dealer, 1 agent per dealer
 *   - monthly:  $9.99/month, unlimited
 *   - yearly:   $100/year, unlimited
 *   - lifetime: $499 one-time, unlimited
 */
export const FREE_LIMITS = {
  tools: 10,
  dealers: 1,
  agents_per_dealer: 1,
};

export const TIER_PRICES = {
  free: 0,
  monthly: 9.99,
  yearly: 100,
  lifetime: 499,
};

export type Tier = "free" | "monthly" | "yearly" | "lifetime";

export const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  monthly: "Monthly Pro",
  yearly: "Yearly Pro",
  lifetime: "Lifetime Pro",
};

export const isPremium = (tier?: string) =>
  tier === "monthly" || tier === "yearly" || tier === "lifetime";

/** How many "extra" months the yearly tier saves vs monthly */
export function yearlyMonthlyEquivalent() {
  return TIER_PRICES.monthly * 12; // $119.88
}

export function yearlySavings() {
  return Math.round((yearlyMonthlyEquivalent() - TIER_PRICES.yearly) * 100) / 100; // $19.88
}

/**
 * Lifetime savings vs N years of yearly subs.
 * After ~5 years yearly = $500, lifetime = $499.
 */
export function lifetimeSavingsAfterYears(years: number) {
  return Math.round((years * TIER_PRICES.yearly - TIER_PRICES.lifetime) * 100) / 100;
}

export function tierLimit(tier: string | undefined, kind: keyof typeof FREE_LIMITS) {
  return isPremium(tier) ? Infinity : FREE_LIMITS[kind];
}

export function isOverLimit(tier: string | undefined, kind: keyof typeof FREE_LIMITS, count: number) {
  if (isPremium(tier)) return false;
  return count >= FREE_LIMITS[kind];
}

/**
 * Returns indices of items that should be greyed-out (locked) for a free user.
 * Free users see all items in the list, but only the first N are clickable.
 * The rest are visible (read-only) but locked behind upgrade.
 *
 * Example: free tier with 14 tools → indices 0..9 active, 10..13 locked.
 */
export function lockedIndices(tier: string | undefined, kind: keyof typeof FREE_LIMITS, total: number): Set<number> {
  if (isPremium(tier)) return new Set();
  const limit = FREE_LIMITS[kind];
  const out = new Set<number>();
  for (let i = limit; i < total; i++) out.add(i);
  return out;
}

export function isLocked(tier: string | undefined, kind: keyof typeof FREE_LIMITS, index: number): boolean {
  if (isPremium(tier)) return false;
  return index >= FREE_LIMITS[kind];
}

export function fmtMoney(n: number) {
  return `$${n.toFixed(2)}`;
}
