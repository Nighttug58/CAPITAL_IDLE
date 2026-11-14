import type { CapitalState } from '../capital.ts'
import { getCollectionSlot, FAME_BOOST_BPS_PER_LEVEL, type FameBoostId } from './catalog.ts'
import { getAbsolutePrestigeStatus } from './absolute.ts'

/** One source of truth for all six bonuses: Fame Shop + owned luxury objects. */
export interface BonusBreakdown {
  readonly shopBps: number
  readonly collectionBps: number
  readonly totalBps: number
}

export function getBonusBreakdown(
  state: Pick<CapitalState, 'prestige'>, id: FameBoostId,
): BonusBreakdown {
  const shopBps = state.prestige.boosts[id] * FAME_BOOST_BPS_PER_LEVEL
  let collectionBps = 0
  // Iterate owned IDs only: no temporary Set or scan of the full catalog
  // for every 1-second dividend tick or click.
  for (const slotId of state.prestige.ownedCollectionIds) {
    const slot = getCollectionSlot(slotId)
    if (slot?.boostId === id) collectionBps += slot.bonusBps
  }
  // Prestige amplifies only purchased Shop bonuses, NEVER the collection share.
  const factor = getAbsolutePrestigeStatus(state).factor
  return { shopBps, collectionBps, totalBps: shopBps * factor + collectionBps }
}

export function getTotalBonusBps(state: Pick<CapitalState, 'prestige'>, id: FameBoostId): number {
  return getBonusBreakdown(state, id).totalBps
}

export function getBonusMultiplier(state: Pick<CapitalState, 'prestige'>, id: FameBoostId): number {
  return 1 + getTotalBonusBps(state, id) / 10_000
}

/**
 * Convert an unrounded 1.01^N factor into a high-precision fixed-point rate
 * (one-millionth of a basis point). All money arithmetic then uses BigInt,
 * so fractional boosted bonuses never pass through unsafe JS money floats.
 * Extreme boosts that cannot fit in this finite rate are rejected, not minted.
 */
export const BONUS_RATE_PRECISION = 1_000_000
const RATE_DENOMINATOR = BigInt(10_000 * BONUS_RATE_PRECISION)
const PRECISION = BigInt(BONUS_RATE_PRECISION)
export function getRewardRateUnits(bonusBps: number): bigint | null {
  if (!Number.isFinite(bonusBps) || bonusBps < 0) return null
  const units = Math.round(bonusBps * BONUS_RATE_PRECISION)
  if (!Number.isSafeInteger(units)) return null
  return RATE_DENOMINATOR + BigInt(units)
}

/** Scale any nonnegative bigint unit (e.g. enterprise nanodollars) safely. */
export function scaleRewardUnits(base: bigint, bonusBps: number): bigint | null {
  if (base < 0n) return null
  const rate = getRewardRateUnits(bonusBps)
  return rate === null ? null : base * rate / RATE_DENOMINATOR
}

/**
 * Reward in integer cents with a saved carry expressed in 1/10 000th cent.
 * At Prestige multipliers the rate uses 1e-6 bp precision; only the tiny
 * remainder below the preexisting carry resolution is rounded.
 */
export function scaleRewardCents(
  baseCents: number, bonusBps: number, carryBps = 0,
): { readonly cents: number; readonly carryBps: number } | null {
  if (!Number.isSafeInteger(baseCents) || baseCents < 0 ||
    !Number.isSafeInteger(carryBps) || carryBps < 0 || carryBps >= 10_000) return null
  const rate = getRewardRateUnits(bonusBps)
  if (rate === null) return null

  const scaled = BigInt(baseCents) * rate + BigInt(carryBps) * PRECISION
  const whole = scaled / RATE_DENOMINATOR
  const remainder = scaled % RATE_DENOMINATOR
  // Round only the sub-carry remainder. A carry rounding to one full cent
  // rolls into the payout rather than ever becoming invalid.
  const roundedCarry = (remainder + PRECISION / 2n) / PRECISION
  const additionalCent = roundedCarry >= 10_000n ? 1n : 0n
  const cents = whole + additionalCent
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return { cents: Number(cents), carryBps: Number(additionalCent ? 0n : roundedCarry) }
}

/** New Fame events only. Calculations never reprice already-awarded Fame. */
export function scaleNewFameMicros(
  state: Pick<CapitalState, 'prestige'>, baseFameMicros: number,
): number | null {
  if (!Number.isSafeInteger(baseFameMicros) || baseFameMicros < 0) return null
  const amount = scaleRewardUnits(BigInt(baseFameMicros), getTotalBonusBps(state, 'fame'))
  return amount !== null && amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null
}
