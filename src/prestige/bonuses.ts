import type { CapitalState } from '../capital.ts'
import { COLLECTION_SLOTS, FAME_BOOST_BPS_PER_LEVEL, type FameBoostId } from './catalog.ts'

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
  const owned = new Set(state.prestige.ownedCollectionIds)
  const collectionBps = COLLECTION_SLOTS.reduce(
    (sum, slot) => sum + (slot.boostId === id && owned.has(slot.id) ? slot.bonusBps : 0),
    0,
  )
  return { shopBps, collectionBps, totalBps: shopBps + collectionBps }
}

export function getTotalBonusBps(state: Pick<CapitalState, 'prestige'>, id: FameBoostId): number {
  return getBonusBreakdown(state, id).totalBps
}

export function getBonusMultiplier(state: Pick<CapitalState, 'prestige'>, id: FameBoostId): number {
  return 1 + getTotalBonusBps(state, id) / 10_000
}

/**
 * Reward in integer cents with a carry expressed in 1/10 000th of a cent.
 * The original cash is preserved, even when a +0.1% collection bonus
 * is too small to yield one whole cent on a single interaction.
 */
export function scaleRewardCents(
  baseCents: number, bonusBps: number, carryBps = 0,
): { readonly cents: number; readonly carryBps: number } | null {
  if (!Number.isSafeInteger(baseCents) || baseCents < 0 ||
    !Number.isSafeInteger(bonusBps) || bonusBps < 0 ||
    !Number.isSafeInteger(carryBps) || carryBps < 0 || carryBps >= 10_000) return null

  const scaled = BigInt(baseCents) * BigInt(10_000 + bonusBps) + BigInt(carryBps)
  const whole = scaled / 10_000n
  if (whole > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return { cents: Number(whole), carryBps: Number(scaled % 10_000n) }
}

/** New Fame events only. Calculations never reprice already-awarded Fame. */
export function scaleNewFameMicros(
  state: Pick<CapitalState, 'prestige'>, baseFameMicros: number,
): number | null {
  if (!Number.isSafeInteger(baseFameMicros) || baseFameMicros < 0) return null
  const bonusBps = getTotalBonusBps(state, 'fame')
  const amount = BigInt(baseFameMicros) * BigInt(10_000 + bonusBps) / 10_000n
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null
}
