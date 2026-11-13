import type { CapitalState } from '../capital.ts'
import {
  FAME_BOOST_BPS_PER_LEVEL,
  FAME_BOOSTS,
  MAX_FAME_BOOST_LEVEL,
  getFameBoost,
  getNextFameBoostCost,
  getPurchasedFameBoostCost,
  type FameBoostId,
} from './catalog.ts'
import { FAME_MICROS } from './state.ts'

export type FameShopError =
  | 'unknown-boost'
  | 'invalid-state'
  | 'stale-level'
  | 'max-level'
  | 'insufficient-fame'

export interface FameShopOffer {
  readonly boostId: FameBoostId
  readonly currentLevel: number
  readonly maxLevel: typeof MAX_FAME_BOOST_LEVEL
  readonly currentBonusBps: number
  readonly nextBonusBps: number | null
  readonly nextCostFame: number | null
  readonly canAfford: boolean
}

export interface FameUpgradeReceipt {
  readonly boostId: FameBoostId
  readonly previousLevel: number
  readonly newLevel: number
  readonly costFame: number
  readonly costMicros: number
  readonly previousBonusBps: number
  readonly newBonusBps: number
  readonly remainingFameMicros: number
}

export type FameShopPurchase =
  | { readonly ok: true; readonly state: CapitalState; readonly receipt: FameUpgradeReceipt }
  | { readonly ok: false; readonly state: CapitalState; readonly error: FameShopError }

function reject(state: CapitalState, error: FameShopError): FameShopPurchase {
  return { ok: false, state, error }
}

/**
 * All spendable Fame comes from level-ups or one-time collection purchases.
 * There is no refundable boost, passive Fame, or other Fame sink.
 *
 * Boost spend is derived from the catalog: a save may not claim a boost level
 * without the corresponding currency debit. Fame fractions remain untouched.
 */
export function hasValidFameShopLedger(state: CapitalState): boolean {
  const prestige = state?.prestige
  if (!prestige) return false
  const spentFame = getPurchasedFameBoostCost(prestige.boosts)
  if (spentFame === null ||
    !Number.isSafeInteger(prestige.fameMicros) || prestige.fameMicros < 0 ||
    !Number.isSafeInteger(prestige.lifetimeFameMicros) ||
    prestige.lifetimeFameMicros < prestige.fameMicros) return false

  return prestige.lifetimeFameMicros - prestige.fameMicros === spentFame * FAME_MICROS
}

/** Read-only, derived offer for the future Shop modal; never caches stale prices. */
export function getFameShopOffer(state: CapitalState, id: string): FameShopOffer | null {
  const boost = getFameBoost(id)
  if (!boost || !state?.prestige) return null
  const currentLevel = state.prestige.boosts[boost.id]
  if (!Number.isSafeInteger(currentLevel) ||
    currentLevel < 0 || currentLevel > MAX_FAME_BOOST_LEVEL) return null

  const nextCostFame = getNextFameBoostCost(boost.id, currentLevel)
  return {
    boostId: boost.id,
    currentLevel,
    maxLevel: MAX_FAME_BOOST_LEVEL,
    currentBonusBps: currentLevel * FAME_BOOST_BPS_PER_LEVEL,
    nextBonusBps: nextCostFame === null ? null : (currentLevel + 1) * FAME_BOOST_BPS_PER_LEVEL,
    nextCostFame,
    canAfford: nextCostFame !== null && hasValidFameShopLedger(state) &&
      state.prestige.fameMicros >= nextCostFame * FAME_MICROS,
  }
}

export function getFameShopOffers(state: CapitalState): readonly FameShopOffer[] {
  return FAME_BOOSTS.map((boost) => getFameShopOffer(state, boost.id)!)
}

/**
 * Atomic domain command. The expected current level is mandatory so that
 * two requests for the SAME displayed tier cannot both charge the player.
 * A second request with the old level rejects instead of buying the next tier.
 *
 * No cash, tax, XP, market, or lifetime-Fame value is ever changed here.
 */
export function buyFameUpgrade(
  state: CapitalState, id: string, expectedCurrentLevel: number,
): FameShopPurchase {
  const boost = getFameBoost(id)
  if (!boost) return reject(state, 'unknown-boost')
  if (!hasValidFameShopLedger(state)) return reject(state, 'invalid-state')

  const currentLevel = state.prestige.boosts[boost.id]
  if (!Number.isSafeInteger(expectedCurrentLevel) ||
    expectedCurrentLevel !== currentLevel) return reject(state, 'stale-level')

  const nextCostFame = getNextFameBoostCost(boost.id, currentLevel)
  if (nextCostFame === null) return reject(state, 'max-level')
  const costMicros = nextCostFame * FAME_MICROS
  if (state.prestige.fameMicros < costMicros) return reject(state, 'insufficient-fame')

  const newLevel = currentLevel + 1
  const nextState: CapitalState = {
    ...state,
    prestige: {
      ...state.prestige,
      fameMicros: state.prestige.fameMicros - costMicros,
      boosts: { ...state.prestige.boosts, [boost.id]: newLevel },
    },
  }

  return {
    ok: true,
    state: nextState,
    receipt: {
      boostId: boost.id,
      previousLevel: currentLevel,
      newLevel,
      costFame: nextCostFame,
      costMicros,
      previousBonusBps: currentLevel * FAME_BOOST_BPS_PER_LEVEL,
      newBonusBps: newLevel * FAME_BOOST_BPS_PER_LEVEL,
      remainingFameMicros: nextState.prestige.fameMicros,
    },
  }
}
