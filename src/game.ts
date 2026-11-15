import { exactMoneyCents } from './money.ts'

export interface GameState {
  balance: number
  lifetimeEarned: number
  purchasedUpgrades: number
}

export interface Upgrade {
  readonly requiredLevel: number
  readonly price: number
  readonly clickValue: number
}

// Progression : 1 XP gagné par dollar éligible, mais les seuils sont
// désormais 4x plus exigeants. Les anciennes XP sont converties une seule fois
// pour préserver le niveau acquis dans les sauvegardes historiques.
const LEVEL_COUNT = 50
const FIRST_LEVEL_STEP = 35
const STEP_GROWTH = 1.10
export const LEVEL_THRESHOLD_FACTOR = 4
/** New tiered growth. Existing level 1–50 thresholds remain byte-for-byte identical. */
export const LEVEL_GROWTH_BANDS = [
  { through: 50, growth: 1.10 },
  { through: 100, growth: 1.05 },
  { through: 200, growth: 1.02 },
  { through: Number.POSITIVE_INFINITY, growth: 1.01 },
] as const

/** n is the level being ENTERED: 51 uses 5%, 101 uses 2%, 201 uses 1%. */
function nextLevelIncrement(nextLevel: number, legacy = false): number {
  if (!Number.isSafeInteger(nextLevel) || nextLevel < 2) return Number.POSITIVE_INFINITY
  const product = legacy ? STEP_GROWTH ** (nextLevel - 2)
    : STEP_GROWTH ** Math.min(nextLevel - 2, 48) *
      1.05 ** Math.max(0, Math.min(nextLevel - 50, 50)) *
      1.02 ** Math.max(0, Math.min(nextLevel - 100, 100)) *
      1.01 ** Math.max(0, nextLevel - 200)
  const increment = LEVEL_THRESHOLD_FACTOR * Math.round(FIRST_LEVEL_STEP * product)
  return Number.isSafeInteger(increment) && increment > 0 ? increment : Number.POSITIVE_INFINITY
}

export const LEVEL_THRESHOLDS: readonly number[] = (() => {
  const thresholds = [0]
  for (let level = 2; level <= LEVEL_COUNT; level++) {
    const increment = nextLevelIncrement(level)
    thresholds.push(thresholds[thresholds.length - 1]! + increment)
  }
  return thresholds
})()

/**
 * Clicker pricing:
 * - Level 1 starts at $1/click. Each bought tier adds +$1 up to
 *   click level 50, +$2 for click levels 51-100, ... +$20 for 951-1000.
 *   Level 1000 therefore pays $10,500 per click, before Fame bonuses.
 * - The first tier costs $375, then successive PRICE INCREASES grow by
 *   just +0.05% per tier: round(750 * 1.0005 ** (tierIndex - 1)).
 *   This adds a gentle exponential bend to the previously linear +$750
 *   schedule, NOT an explosive 50% compound increase per purchase.
 * - First 49 player-level gates keep their rank (levels 2–50).
 * - Beyond click level 50, each player level unlocks 20 click tiers.
 * - Existing purchased tiers and wallet values are never repriced retroactively.
 */
export const MAX_CLICK_LEVEL = 1000
/** The next click tier pays 1 more Gold per 50-level band of its resulting level. */
export const CLICK_INCOME_TIER_SIZE = 50

export function getClickUpgradeIncrement(nextClickLevel: number): number {
  if (!Number.isSafeInteger(nextClickLevel) ||
      nextClickLevel < 2 || nextClickLevel > MAX_CLICK_LEVEL) return 0
  return Math.ceil(nextClickLevel / CLICK_INCOME_TIER_SIZE)
}
export const ORIGINAL_FIRST_CLICK_UPGRADE_PRICE = 250
export const ORIGINAL_CLICK_UPGRADE_PRICE_STEP = 500
export const CLICK_PRICE_PREMIUM_BPS = 15_000
export const FIRST_CLICK_UPGRADE_PRICE = ORIGINAL_FIRST_CLICK_UPGRADE_PRICE * CLICK_PRICE_PREMIUM_BPS / 10_000
export const CLICK_UPGRADE_PRICE_STEP = ORIGINAL_CLICK_UPGRADE_PRICE_STEP * CLICK_PRICE_PREMIUM_BPS / 10_000
/** Increase the PRICE INCREMENT by 0.05% at each step, not the full price. */
export const CLICK_PRICE_INCREMENT_GROWTH = 0.0005
export const EXTENDED_CLICK_TIERS_PER_PLAYER_LEVEL = 20

export const UPGRADES: readonly Upgrade[] = Object.freeze((() => {
  const upgrades: Upgrade[] = []
  let price = FIRST_CLICK_UPGRADE_PRICE
  let clickValue = 1
  for (let index = 0; index < MAX_CLICK_LEVEL - 1; index++) {
    if (index > 0) {
      const increment = Math.round(
        CLICK_UPGRADE_PRICE_STEP * (1 + CLICK_PRICE_INCREMENT_GROWTH) ** (index - 1),
      )
      price += increment
    }
    const nextClickLevel = index + 2
    clickValue += getClickUpgradeIncrement(nextClickLevel)
    upgrades.push(Object.freeze({
      requiredLevel: nextClickLevel <= 50
        ? nextClickLevel
        : 50 + Math.ceil((nextClickLevel - 50) / EXTENDED_CLICK_TIERS_PER_PLAYER_LEVEL),
      price,
      clickValue,
    }))
  }
  return upgrades
})())

export const INITIAL_GAME: Readonly<GameState> = {
  balance: 0,
  lifetimeEarned: 0,
  purchasedUpgrades: 0,
}

const isValidInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

// Les transactions apportent des centimes ; le clicker historique garde ses
// montants entiers. Les anciens gros entiers restent valides après migration.
const isValidMoney = (value: unknown): value is number => {
  if (isValidInteger(value)) return true
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
      value > Number.MAX_SAFE_INTEGER / 100) return false
  return exactMoneyCents(value) !== null
}

/**
 * Tiered leveling XP threshold. 1–50: +10%; 51–100: +5%;
 * 101–200: +2%; 201+: +1%. XP remains 1 per eligible dollar,
 * with the independently purchased Fame boosts applied to awards.
 */
function levelThreshold(level: number, legacy: boolean): number {
  if (!Number.isSafeInteger(level) || level < 1) return 0
  if (level <= LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[level - 1]!
  let threshold = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]!
  for (let nextLevel = LEVEL_THRESHOLDS.length + 1; nextLevel <= level; nextLevel++) {
    const increment = nextLevelIncrement(nextLevel, legacy)
    if (!Number.isSafeInteger(threshold + increment)) return Number.POSITIVE_INFINITY
    threshold += increment
  }
  return threshold
}

export function getLevelStartThreshold(level: number): number {
  return levelThreshold(level, false)
}

/** Exact historical curve, ONLY for deterministic migration of old saves. */
export function getLegacyLevelStartThreshold(level: number): number {
  return levelThreshold(level, true)
}

function levelFromExperience(experiencePoints: number, legacy: boolean): number {
  const earned = Number.isFinite(experiencePoints) ? Math.max(0, experiencePoints) : 0
  let level = 1
  for (let index = 1; index < LEVEL_THRESHOLDS.length; index++) {
    if (earned < LEVEL_THRESHOLDS[index]!) return level
    level = index + 1
  }
  let threshold = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]!
  for (let nextLevel = LEVEL_THRESHOLDS.length + 1; nextLevel < Number.MAX_SAFE_INTEGER; nextLevel++) {
    const increment = nextLevelIncrement(nextLevel, legacy)
    if (!Number.isSafeInteger(threshold + increment)) break
    const nextThreshold = threshold + increment
    if (earned < nextThreshold) break
    threshold = nextThreshold
    level = nextLevel
  }
  return level
}

export function getLevel(experiencePoints: number): number {
  return levelFromExperience(experiencePoints, false)
}
export function getLegacyLevel(experiencePoints: number): number {
  return levelFromExperience(experiencePoints, true)
}

/**
 * Position in the old XP curve -> same level and fraction in the new one.
 * Always use integer cents, clamp to the level boundary, never grant Fame.
 */
export function migrateExperienceCentsToTieredCurve(legacyCents: number): number | null {
  if (!Number.isSafeInteger(legacyCents) || legacyCents < 0) return null
  const level = getLegacyLevel(legacyCents / 100)
  const oldStart = getLegacyLevelStartThreshold(level) * 100
  const oldNext = getLegacyLevelStartThreshold(level + 1) * 100
  const newStart = getLevelStartThreshold(level) * 100
  const newNext = getLevelStartThreshold(level + 1) * 100
  if (![oldStart, oldNext, newStart, newNext].every(Number.isSafeInteger) ||
      oldNext <= oldStart || newNext <= newStart) return null
  const fraction = Math.min(1, Math.max(0, (legacyCents - oldStart) / (oldNext - oldStart)))
  const result = Math.max(newStart, Math.min(newNext - 1,
    newStart + Math.round((newNext - newStart) * fraction)))
  return Number.isSafeInteger(result) && getLevel(result / 100) === level ? result : null
}

/** Convert historical XP to the new 4x threshold scale once on migration. */
export function upgradeLegacyExperienceCents(experienceCents: number): number | null {
  if (!Number.isSafeInteger(experienceCents) || experienceCents < 0) return null
  const converted = experienceCents * LEVEL_THRESHOLD_FACTOR
  return Number.isSafeInteger(converted) ? converted : null
}

export function getNextLevelThreshold(experiencePoints: number): number | null {
  const threshold = getLevelStartThreshold(getLevel(experiencePoints) + 1)
  return Number.isSafeInteger(threshold) ? threshold : null
}

export function getClickValue(purchasedUpgrades: number): number {
  return purchasedUpgrades === 0 ? 1 : (UPGRADES[purchasedUpgrades - 1]?.clickValue ?? 1)
}

export function getNextUpgrade(state: GameState): Upgrade | null {
  return UPGRADES[state.purchasedUpgrades] ?? null
}

export function earnClick(state: GameState): GameState {
  const reward = getClickValue(state.purchasedUpgrades)
  const actualReward = Math.min(reward, Number.MAX_SAFE_INTEGER - state.lifetimeEarned, Number.MAX_SAFE_INTEGER - state.balance)
  if (actualReward <= 0) return state
  return {
    ...state,
    balance: state.balance + actualReward,
    lifetimeEarned: state.lifetimeEarned + actualReward,
  }
}

export function purchaseUpgrade(state: GameState, experiencePoints = state.lifetimeEarned): GameState {
  const upgrade = getNextUpgrade(state)
  if (!upgrade || getLevel(experiencePoints) < upgrade.requiredLevel || state.balance < upgrade.price) {
    return state
  }
  return {
    ...state,
    balance: state.balance - upgrade.price,
    purchasedUpgrades: state.purchasedUpgrades + 1,
  }
}

// Ne charge jamais un état incohérent ou des valeurs non sûres.
// Les anciennes sauvegardes exigent un cash positif. Seul le schéma v5
// pourra autoriser un découvert consécutif à un prélèvement fiscal.
function isValidSignedBalance(value: unknown): value is number {
  if (isValidMoney(value)) return true
  if (typeof value !== 'number' || !Number.isFinite(value) || value >= 0 ||
      value < -Number.MAX_SAFE_INTEGER / 100) return false
  return exactMoneyCents(value) !== null
}

export function restoreGame(raw: unknown, options: {
  allowNegativeBalance?: boolean
  experiencePoints?: number
  /** Bonus ponctuels en cash, sans XP ni revenus : droits justifiés par les Achievements réclamés. */
  giftAllowanceCents?: number
} = {}): GameState {
  if (!raw || typeof raw !== 'object') return { ...INITIAL_GAME }
  const saved = raw as Partial<GameState>
  const validBalance = options.allowNegativeBalance ? isValidSignedBalance(saved.balance) : isValidMoney(saved.balance)
  if (typeof saved.balance !== 'number' || !validBalance || !isValidMoney(saved.lifetimeEarned) || !isValidInteger(saved.purchasedUpgrades)) {
    return { ...INITIAL_GAME }
  }
  const allowance = options.giftAllowanceCents ?? 0
  const balanceCents = exactMoneyCents(saved.balance)
  const earnedCents = exactMoneyCents(saved.lifetimeEarned)
  if (!Number.isSafeInteger(allowance) || allowance < 0 ||
      balanceCents === null || earnedCents === null ||
      balanceCents > earnedCents + allowance || saved.purchasedUpgrades > UPGRADES.length) {
    return { ...INITIAL_GAME }
  }
  const highestPurchasedLevel = saved.purchasedUpgrades === 0 ? 1 : UPGRADES[saved.purchasedUpgrades - 1]!.requiredLevel
  if (highestPurchasedLevel > getLevel(options.experiencePoints ?? saved.lifetimeEarned)) return { ...INITIAL_GAME }
  return {
    balance: saved.balance,
    lifetimeEarned: saved.lifetimeEarned,
    purchasedUpgrades: saved.purchasedUpgrades,
  }
}

// Les anciennes sauvegardes v1 avaient seulement 6 niveaux et des boosts de
// 1 / 2 / 5 / 10 / 25 / 50 $ par clic. Préserver au moins ce revenu après migration.
const LEGACY_THRESHOLDS = [0, 100, 500, 2_000, 10_000, 50_000] as const
const LEGACY_CLICK_VALUES = [1, 2, 5, 10, 25, 50] as const

export function migrateLegacyGame(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object') return { ...INITIAL_GAME }
  const previous = raw as Partial<GameState>
  if (!isValidInteger(previous.balance) || !isValidInteger(previous.lifetimeEarned) || !isValidInteger(previous.purchasedUpgrades)) {
    return { ...INITIAL_GAME }
  }
  if (previous.balance > previous.lifetimeEarned || previous.purchasedUpgrades >= LEGACY_CLICK_VALUES.length) {
    return { ...INITIAL_GAME }
  }
  if (previous.purchasedUpgrades > 0 && previous.lifetimeEarned < LEGACY_THRESHOLDS[previous.purchasedUpgrades]!) {
    return { ...INITIAL_GAME }
  }

  const oldClickValue = LEGACY_CLICK_VALUES[previous.purchasedUpgrades]!
  const purchasedUpgrades = oldClickValue === 1 ? 0 : UPGRADES.findIndex((upgrade) => upgrade.clickValue >= oldClickValue) + 1
  return restoreGame({
    balance: previous.balance,
    lifetimeEarned: previous.lifetimeEarned,
    purchasedUpgrades,
  }, { experiencePoints: previous.lifetimeEarned * LEVEL_THRESHOLD_FACTOR })
}

// Ancien équilibrage v2 : 30 niveaux, +1$/clic jusqu'au niveau 10, puis +2$/clic.
// On conserve le revenu déjà acquis en le convertissant en achats successifs de +1$.
const V2_THRESHOLDS: readonly number[] = (() => {
  const thresholds = [0]
  for (let level = 2; level <= 30; level++) {
    const increment = Math.round(35 * 1.21 ** (level - 2))
    thresholds.push(thresholds[thresholds.length - 1]! + increment)
  }
  return thresholds
})()

export function migrateV2Game(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object') return { ...INITIAL_GAME }
  const previous = raw as Partial<GameState>
  if (!isValidInteger(previous.balance) || !isValidInteger(previous.lifetimeEarned) || !isValidInteger(previous.purchasedUpgrades)) {
    return { ...INITIAL_GAME }
  }
  if (previous.balance > previous.lifetimeEarned || previous.purchasedUpgrades > 29) {
    return { ...INITIAL_GAME }
  }
  if (previous.lifetimeEarned < V2_THRESHOLDS[previous.purchasedUpgrades]!) {
    return { ...INITIAL_GAME }
  }

  const oldClickValue = previous.purchasedUpgrades <= 9
    ? previous.purchasedUpgrades + 1
    : 10 + 2 * (previous.purchasedUpgrades - 9)
  return restoreGame({
    balance: previous.balance,
    lifetimeEarned: previous.lifetimeEarned,
    purchasedUpgrades: oldClickValue - 1,
  }, { experiencePoints: previous.lifetimeEarned * LEVEL_THRESHOLD_FACTOR })
}
