import { getLevel, upgradeLegacyExperienceCents } from '../game.ts'
import { exactMoneyCents } from '../money.ts'
import { COLLECTION_SLOTS, FAME_BOOST_IDS, MAX_FAME_BOOST_LEVEL, getPurchasedFameBoostCost, type FameBoostId } from './catalog.ts'
import type { CapitalState } from '../capital.ts'
import { getTotalBonusBps, scaleNewFameMicros, scaleRewardCentsAtRate } from './bonuses.ts'

// A million subunits per Fame preserve fractional rewards from later boosts.
export const FAME_MICROS = 1_000_000
/** 1 XP par nouveau dollar éligible ; seuls les seuils de niveau ont augmenté. */
export const BASE_XP_EARN_RATE_BPS = 10_000
export const XP_CURVE_VERSION = 2 as const
export type FameBoostLevels = Record<FameBoostId, number>
export interface PrestigeState {
  readonly experienceCents: number
  readonly xpCurveVersion: typeof XP_CURVE_VERSION
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
export function createInitialPrestigeState(lifetimeEarned: number, legacyCurve = false): PrestigeState {
  const cents = exactMoneyCents(lifetimeEarned)
  const rawCents = cents !== null && cents >= 0 ? cents : 0
  const experienceCents = legacyCurve ? (upgradeLegacyExperienceCents(rawCents) ?? rawCents) : rawCents
  const lastAwardedLevel = getLevel(experienceCents / 100)
  const levelFameMicros = levelsTotal(lastAwardedLevel) * FAME_MICROS
  return {
    experienceCents, xpCurveVersion: XP_CURVE_VERSION,
    experienceCarryBps: 0, clickCarryBps: 0, tradingCarryBps: 0, lastAwardedLevel,
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
  // Old v6 saves have no curve marker and are normalized once at load.
  // Their existing level, Fame and purchased boosts are kept intact.
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
  const isHistoricalCurve = saved.xpCurveVersion === undefined
  if (saved.xpCurveVersion !== undefined && saved.xpCurveVersion !== XP_CURVE_VERSION) return fallback
  const experienceCents = isHistoricalCurve
    ? upgradeLegacyExperienceCents(saved.experienceCents)
    : saved.experienceCents
  if (experienceCents === null || earnedCents === null ||
    saved.experienceCents < Math.floor(earnedCents / 4) ||
    saved.lastAwardedLevel !== getLevel(experienceCents / 100) ||
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

  // Chaque objet possédé doit avoir rapporté AU MOINS sa Fame de base.
  // Impossible de posséder un objet sans achat, ou d'inventer une Fame
  // collection si aucun objet n'a été acquis. Les boosts de Fame antérieurs
  // restent enregistrés et ne sont jamais recalculés.
  let collectionBaseMicros = 0
  for (const id of owned) {
    const slot = COLLECTION_SLOTS.find((item) => item.id === id)
    if (!slot) return fallback
    collectionBaseMicros += slot.fame * FAME_MICROS
  }
  if (!Number.isSafeInteger(collectionBaseMicros) ||
    saved.collectionFameMicros < collectionBaseMicros ||
    (owned.length === 0 && saved.collectionFameMicros !== 0)) return fallback

  return {
    experienceCents, xpCurveVersion: XP_CURVE_VERSION,
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
  const xpRateBps = BASE_XP_EARN_RATE_BPS * (1 + getTotalBonusBps(state, 'xp') / 10_000)
  const scaledXp = scaleRewardCentsAtRate(earnedCents, xpRateBps, previous.experienceCarryBps)
  if (!scaledXp) return null
  const experienceCents = previous.experienceCents + scaledXp.cents
  if (!Number.isSafeInteger(experienceCents)) return null
  const lastAwardedLevel = getLevel(experienceCents / 100)
  // Replaying levels already achieved in previous Prestige cycles earns NO Fame.
  // The run level still follows XP for the legacy Fame state validator.
  const highestAwarded = state.ascension.progress.highestFameAwardedLevel
  const newRecord = Math.max(highestAwarded, lastAwardedLevel)
  const baseFameMicros = (levelsTotal(newRecord) - levelsTotal(highestAwarded)) * FAME_MICROS
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
    ascension: newRecord === highestAwarded ? state.ascension : {
      ...state.ascension,
      progress: { ...state.ascension.progress, highestFameAwardedLevel: newRecord },
    },
  }
}
