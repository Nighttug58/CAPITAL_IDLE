import { getLevel } from '../game.ts'
import { exactMoneyCents } from '../money.ts'
import { COLLECTION_SLOTS, FAME_BOOST_IDS, MAX_FAME_BOOST_LEVEL, getPurchasedFameBoostCost, type FameBoostId } from './catalog.ts'
import type { CapitalState } from '../capital.ts'
import { getTotalBonusBps, scaleNewFameMicros, scaleRewardCents } from './bonuses.ts'

// A million subunits per Fame preserve fractional rewards from later boosts.
export const FAME_MICROS = 1_000_000
export type FameBoostLevels = Record<FameBoostId, number>
export interface PrestigeState {
  readonly experienceCents: number
  readonly experienceCarryBps: number // sub-cent XP remainder
  readonly clickCarryBps: number // sub-cent cash click remainder
  readonly tradingCarryBps: number // sub-cent positive trading bonus remainder
  readonly lastAwardedLevel: number
  readonly fameMicros: number
  readonly lifetimeFameMicros: number
  readonly levelFameMicros: number
  readonly collectionFameMicros: number
  readonly boosts: FameBoostLevels
  readonly ownedCollectionIds: readonly string[]
}

function zeroBoosts(): FameBoostLevels {
  return { click: 0, enterprise: 0, dividend: 0, xp: 0, trading: 0, fame: 0 }
}

function levelsTotal(level: number): number {
  return level * (level + 1) / 2
}

/** First creation and one-off v1–v5 migrations credit every achieved level once. */
export function createInitialPrestigeState(lifetimeEarned: number): PrestigeState {
  const cents = exactMoneyCents(lifetimeEarned)
  const experienceCents = cents !== null && cents >= 0 ? cents : 0
  const lastAwardedLevel = getLevel(experienceCents / 100)
  const levelFameMicros = levelsTotal(lastAwardedLevel) * FAME_MICROS
  return {
    experienceCents, experienceCarryBps: 0, clickCarryBps: 0, tradingCarryBps: 0, lastAwardedLevel,
    fameMicros: levelFameMicros,
    lifetimeFameMicros: levelFameMicros,
    levelFameMicros,
    collectionFameMicros: 0,
    boosts: zeroBoosts(),
    ownedCollectionIds: [],
  }
}

function nonNegativeSafe(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
const knownCollectionIds = new Set(COLLECTION_SLOTS.map(item => item.id))

/** Malformed current-save sections fall back locally; JSON imports reject this drift. */
export function restorePrestigeState(raw: unknown, lifetimeEarned: number): PrestigeState {
  const fallback = createInitialPrestigeState(lifetimeEarned)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback
  const saved = raw as Partial<PrestigeState>
  // Fields introduced after early v6 saves are optional and default to zero.
  const experienceCarryBps = saved.experienceCarryBps ?? 0
  const clickCarryBps = saved.clickCarryBps ?? 0
  const tradingCarryBps = saved.tradingCarryBps ?? 0
  const validCarry = (value: unknown): value is number =>
    nonNegativeSafe(value) && value < 10_000
  if (!nonNegativeSafe(saved.experienceCents) ||
    !validCarry(experienceCarryBps) ||
    !validCarry(clickCarryBps) ||
    !validCarry(tradingCarryBps) ||
    !nonNegativeSafe(saved.lastAwardedLevel) ||
    !nonNegativeSafe(saved.fameMicros) ||
    !nonNegativeSafe(saved.lifetimeFameMicros) ||
    !nonNegativeSafe(saved.levelFameMicros) ||
    !nonNegativeSafe(saved.collectionFameMicros) ||
    !saved.boosts || typeof saved.boosts !== 'object' || Array.isArray(saved.boosts) ||
    !Array.isArray(saved.ownedCollectionIds)) return fallback

  const earnedCents = exactMoneyCents(lifetimeEarned)
  if (earnedCents === null || saved.experienceCents < earnedCents ||
    saved.lastAwardedLevel !== getLevel(saved.experienceCents / 100) ||
    saved.levelFameMicros < levelsTotal(saved.lastAwardedLevel) * FAME_MICROS ||
    saved.lifetimeFameMicros !== saved.levelFameMicros + saved.collectionFameMicros ||
    saved.fameMicros > saved.lifetimeFameMicros) return fallback

  const rawBoosts = saved.boosts as unknown as Record<string, unknown>
  if (Object.keys(rawBoosts).length !== FAME_BOOST_IDS.length ||
    !FAME_BOOST_IDS.every(key => nonNegativeSafe(rawBoosts[key]) && (rawBoosts[key] as number) <= MAX_FAME_BOOST_LEVEL)) return fallback
  // The only Fame sink is the Shop. Its exact price is derivable from the
  // six purchased levels: reject forged balances or free boost tiers on import.
  const spentFame = getPurchasedFameBoostCost(saved.boosts)
  if (spentFame === null ||
    saved.lifetimeFameMicros - saved.fameMicros !== spentFame * FAME_MICROS) return fallback

  const owned = saved.ownedCollectionIds
  if (owned.length > knownCollectionIds.size ||
    !owned.every(value => typeof value === 'string' && knownCollectionIds.has(value)) ||
    new Set(owned).size !== owned.length) return fallback

  return {
    experienceCents: saved.experienceCents,
    experienceCarryBps, clickCarryBps, tradingCarryBps,
    lastAwardedLevel: saved.lastAwardedLevel,
    fameMicros: saved.fameMicros,
    lifetimeFameMicros: saved.lifetimeFameMicros,
    levelFameMicros: saved.levelFameMicros,
    collectionFameMicros: saved.collectionFameMicros,
    boosts: { ...saved.boosts },
    ownedCollectionIds: [...owned],
  }
}

/** Apply only on a real income/Xp-credit event; spending and tax never call this. */
export function creditExperience(state: CapitalState, earnedCents: number): CapitalState | null {
  if (!nonNegativeSafe(earnedCents)) return null
  if (earnedCents === 0) return state

  const previous = state.prestige
  const scaledXp = scaleRewardCents(earnedCents, getTotalBonusBps(state, 'xp'), previous.experienceCarryBps)
  if (!scaledXp) return null
  const experienceCents = previous.experienceCents + scaledXp.cents
  if (!Number.isSafeInteger(experienceCents)) return null
  const lastAwardedLevel = getLevel(experienceCents / 100)
  const baseFameMicros = (levelsTotal(lastAwardedLevel) - levelsTotal(previous.lastAwardedLevel)) * FAME_MICROS
  if (!Number.isSafeInteger(baseFameMicros)) return null
  const awardedMicros = scaleNewFameMicros(state, baseFameMicros)
  if (awardedMicros === null) return null
  const fameMicros = previous.fameMicros + awardedMicros
  const lifetimeFameMicros = previous.lifetimeFameMicros + awardedMicros
  const levelFameMicros = previous.levelFameMicros + awardedMicros
  if (![fameMicros, lifetimeFameMicros, levelFameMicros].every(Number.isSafeInteger)) return null

  return {
    ...state,
    prestige: {
      ...previous, experienceCents, experienceCarryBps: scaledXp.carryBps,
      lastAwardedLevel, fameMicros, lifetimeFameMicros, levelFameMicros,
    },
  }
}
