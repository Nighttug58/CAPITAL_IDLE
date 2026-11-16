/**
 * BigInt continuation of the current v7 XP curve. Up to the last safely
 * representable level, the thresholds are EXACTLY the ones in game.ts.
 * After that boundary the +1% tier continues with fixed rational arithmetic;
 * no Number overflow, arbitrary hard level cap or per-level O(level) walk.
 *
 * IMPORTANT: Rebalancing XP thresholds is pass 5, not part of this module.
 */
import { getLevelStartThreshold } from './game.ts'

let boundaryLevel = 1
let boundaryThreshold = 0n
let boundaryIncrement = 1n

// Compute this once (roughly 2,000 iterations), not for every XP tick.
for (let level = 2; ; level++) {
  const next = getLevelStartThreshold(level)
  if (!Number.isSafeInteger(next)) break
  const prior = getLevelStartThreshold(level - 1)
  boundaryLevel = level
  boundaryThreshold = BigInt(next)
  boundaryIncrement = BigInt(next - prior)
}

export const LAST_SAFE_XP_LEVEL = boundaryLevel

/** Cumulative threshold, integer dollars, for the level being entered. */
export function getExactLevelStartThreshold(level: number): bigint {
  if (!Number.isSafeInteger(level) || level < 1) throw new RangeError('Invalid level')
  if (level <= boundaryLevel) return BigInt(getLevelStartThreshold(level))
  const k = BigInt(level - boundaryLevel)
  const p101 = 101n ** k
  const p100 = 100n ** k
  // First out-of-range increment, rounded once to the nearest dollar.
  const first = (boundaryIncrement * 101n + 50n) / 100n
  // Sum_{i=0..k-1} first * (101/100)^i, rounded to a whole dollar.
  const denominator = 100n ** (k - 1n)
  const increment = (first * (p101 - p100) + denominator / 2n) / denominator
  return boundaryThreshold + increment
}

/** XP is in CENTS in the save, not floating-point dollars. */
export function getExactLevel(experienceCents: bigint): number {
  if (experienceCents <= 0n) return 1
  // The entire safe prefix can be binary-searched without walking levels.
  let low = 1
  let high = boundaryLevel
  const safeCents = boundaryThreshold * 100n
  if (experienceCents >= safeCents) {
    low = boundaryLevel
    high = boundaryLevel + 1
    // At each step, double the distance from the boundary.
    while (experienceCents >= getExactLevelStartThreshold(high) * 100n) {
      low = high
      const doubled = boundaryLevel + (high - boundaryLevel) * 2
      if (!Number.isSafeInteger(doubled) || doubled <= high) {
        throw new RangeError('XP level exceeds addressable JS level count')
      }
      high = doubled
    }
  }
  while (low + 1 < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (getExactLevelStartThreshold(middle) * 100n <= experienceCents) low = middle
    else high = middle
  }
  return low
}

export function getExactLevelProgress(experienceCents: bigint): Readonly<{
  level: number; startCents: bigint; nextCents: bigint; fractionBasisPoints: number
}> {
  const level = getExactLevel(experienceCents)
  const startCents = getExactLevelStartThreshold(level) * 100n
  const nextCents = getExactLevelStartThreshold(level + 1) * 100n
  const numerator = experienceCents > startCents ? experienceCents - startCents : 0n
  const basis = numerator * 10_000n / (nextCents - startCents)
  return { level, startCents, nextCents, fractionBasisPoints: Number(basis > 10_000n ? 10_000n : basis) }
}
