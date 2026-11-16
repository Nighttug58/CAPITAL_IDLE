/**
 * Exact XP thresholds for the V2 economy. The previous V8 XP curve is kept as
 * an immutable migration authority: V3 -> V4 conversion preserves level and
 * fraction instead of granting XP or Fame on load.
 *
 * The 1 XP per eligible $ reward rate is unchanged. Required XP at each level
 * is 5x for levels 1–50, rises continuously to 10x at level 100, then 25x
 * at level 200 and beyond. Only thresholds change, never credited XP rates.
 */
import { getLevelStartThreshold } from './game.ts'

let boundaryLevel = 1
let boundaryThreshold = 0n
let boundaryIncrement = 1n

// Roughly 2,000 iterations once at startup, not per click, purchase or level.
for (let level = 2; ; level++) {
  const next = getLevelStartThreshold(level)
  if (!Number.isSafeInteger(next)) break
  const prior = getLevelStartThreshold(level - 1)
  boundaryLevel = level
  boundaryThreshold = BigInt(next)
  boundaryIncrement = BigInt(next - prior)
}
export const LAST_SAFE_XP_LEVEL = boundaryLevel

/** The original XP V3 thresholds (dollars) must NEVER be repriced. */
export function getExactV3LevelStartThreshold(level: number): bigint {
  if (!Number.isSafeInteger(level) || level < 1) throw new RangeError('Invalid XP level')
  if (level <= boundaryLevel) return BigInt(getLevelStartThreshold(level))
  const k = BigInt(level - boundaryLevel)
  const p101 = 101n ** k
  const p100 = 100n ** k
  const first = (boundaryIncrement * 101n + 50n) / 100n
  const denominator = 100n ** (k - 1n)
  const increment = (first * (p101 - p100) + denominator / 2n) / denominator
  return boundaryThreshold + increment
}

/** Current XP V4 thresholds (dollars): monotone and joined at 50/100/200. */
export function getExactLevelStartThreshold(level: number): bigint {
  const historical = getExactV3LevelStartThreshold(level)
  if (level <= 50) return historical * 5n
  if (level <= 100) return historical * BigInt(250 + 5 * (level - 50)) / 50n
  if (level <= 200) return historical * BigInt(1000 + 15 * (level - 100)) / 100n
  return historical * 25n
}

function getLevelFor(experienceCents: bigint, threshold: (level: number) => bigint): number {
  if (experienceCents <= 0n) return 1
  let low = 1
  let high = boundaryLevel
  if (experienceCents >= threshold(boundaryLevel) * 100n) {
    low = boundaryLevel
    high = boundaryLevel + 1
    while (experienceCents >= threshold(high) * 100n) {
      low = high
      const doubled = boundaryLevel + (high - boundaryLevel) * 2
      if (!Number.isSafeInteger(doubled) || doubled <= high)
        throw new RangeError('XP level exceeds addressable JS level count')
      high = doubled
    }
  }
  while (low + 1 < high) {
    const mid = low + Math.floor((high - low) / 2)
    if (threshold(mid) * 100n <= experienceCents) low = mid
    else high = mid
  }
  return low
}
export function getExactV3Level(experienceCents: bigint): number {
  return getLevelFor(experienceCents, getExactV3LevelStartThreshold)
}
export function getExactLevel(experienceCents: bigint): number {
  return getLevelFor(experienceCents, getExactLevelStartThreshold)
}

/** Round proportionally within the existing level, never to a higher level. */
export function rebaseV3ExperienceCents(oldCents: bigint): bigint {
  if (oldCents < 0n) throw new RangeError('Negative XP')
  const level = getExactV3Level(oldCents)
  const fromStart = getExactV3LevelStartThreshold(level) * 100n
  const fromNext = getExactV3LevelStartThreshold(level + 1) * 100n
  const toStart = getExactLevelStartThreshold(level) * 100n
  const toNext = getExactLevelStartThreshold(level + 1) * 100n
  const fraction = (oldCents - fromStart) * (toNext - toStart) / (fromNext - fromStart)
  const result = toStart + fraction
  return result >= toNext ? toNext - 1n : result
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
