/** Progressive taxes measured against gross earnings since the last Prestige.
 * BigInt marginal brackets prevent circumventing taxes through tiny trades or
 * frequent enterprise ticks. All amounts are in cents and rates in bps.
 */
export const PROGRESSIVE_TAX_BRACKETS = Object.freeze([
  { fromCents: 0n, rateBps: 1_500n },
  { fromCents: 100_000_000n, rateBps: 2_000n },          // 1 M$
  { fromCents: 1_000_000_000n, rateBps: 2_800n },        // 10 M$
  { fromCents: 10_000_000_000n, rateBps: 3_800n },       // 100 M$
  { fromCents: 100_000_000_000n, rateBps: 4_800n },      // 1 B$
  { fromCents: 1_000_000_000_000n, rateBps: 6_000n },    // 10 B$
  { fromCents: 100_000_000_000_000n, rateBps: 7_000n },  // 1 T$
] as const)

export function marginalTaxRateBps(lifetimeEarnedCents: bigint): bigint {
  const total = lifetimeEarnedCents < 0n ? 0n : lifetimeEarnedCents
  for (let index = PROGRESSIVE_TAX_BRACKETS.length - 1; index >= 0; index--) {
    if (total >= PROGRESSIVE_TAX_BRACKETS[index]!.fromCents)
      return PROGRESSIVE_TAX_BRACKETS[index]!.rateBps
  }
  return PROGRESSIVE_TAX_BRACKETS[0]!.rateBps
}

/** Pre-rounding cents*bps sum; callers preserve the enterprise fraction carry. */
export function progressiveTaxNumerator(profitCents: bigint, lifetimeBeforeCents: bigint): bigint {
  if (profitCents < 0n) throw new RangeError('Negative taxable income')
  let remaining = profitCents
  let cursor = lifetimeBeforeCents < 0n ? 0n : lifetimeBeforeCents
  let total = 0n
  for (let i = 0; i < PROGRESSIVE_TAX_BRACKETS.length && remaining > 0n; i++) {
    const current = PROGRESSIVE_TAX_BRACKETS[i]!
    const next = PROGRESSIVE_TAX_BRACKETS[i + 1]?.fromCents
    if (next !== undefined && cursor >= next) continue
    const width = next === undefined ? remaining :
      (next - cursor < remaining ? next - cursor : remaining)
    if (width <= 0n) continue
    total += width * current.rateBps
    cursor += width
    remaining -= width
  }
  return total
}
