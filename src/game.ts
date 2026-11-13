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

// Progression régulière : 50 niveaux, chaque palier augmente de 10 %.
// Le niveau dépend exclusivement des gains cumulés, jamais du solde.
const LEVEL_COUNT = 50
const FIRST_LEVEL_STEP = 35
const STEP_GROWTH = 1.10

export const LEVEL_THRESHOLDS: readonly number[] = (() => {
  const thresholds = [0]
  for (let level = 2; level <= LEVEL_COUNT; level++) {
    const increment = Math.round(FIRST_LEVEL_STEP * STEP_GROWTH ** (level - 2))
    thresholds.push(thresholds[thresholds.length - 1]! + increment)
  }
  return thresholds
})()

export const UPGRADES: readonly Upgrade[] = LEVEL_THRESHOLDS.slice(1).map((threshold, index) => {
  const level = index + 2
  const step = threshold - LEVEL_THRESHOLDS[index]!
  return {
    requiredLevel: level,
    price: Math.max(5, Math.round((step * 0.6) / 5) * 5),
    clickValue: level,
  }
})

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

export function getLevel(lifetimeEarned: number): number {
  const earned = Number.isFinite(lifetimeEarned) ? Math.max(0, lifetimeEarned) : 0
  let level = 1
  for (let index = 1; index < LEVEL_THRESHOLDS.length; index++) {
    if (earned < LEVEL_THRESHOLDS[index]) break
    level = index + 1
  }
  return level
}

export function getNextLevelThreshold(lifetimeEarned: number): number | null {
  return LEVEL_THRESHOLDS[getLevel(lifetimeEarned)] ?? null
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

export function purchaseUpgrade(state: GameState): GameState {
  const upgrade = getNextUpgrade(state)
  if (!upgrade || getLevel(state.lifetimeEarned) < upgrade.requiredLevel || state.balance < upgrade.price) {
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

export function restoreGame(raw: unknown, options: { allowNegativeBalance?: boolean } = {}): GameState {
  if (!raw || typeof raw !== 'object') return { ...INITIAL_GAME }
  const saved = raw as Partial<GameState>
  const validBalance = options.allowNegativeBalance ? isValidSignedBalance(saved.balance) : isValidMoney(saved.balance)
  if (typeof saved.balance !== 'number' || !validBalance || !isValidMoney(saved.lifetimeEarned) || !isValidInteger(saved.purchasedUpgrades)) {
    return { ...INITIAL_GAME }
  }
  if (saved.balance > saved.lifetimeEarned || saved.purchasedUpgrades > UPGRADES.length) {
    return { ...INITIAL_GAME }
  }
  const highestPurchasedLevel = saved.purchasedUpgrades === 0 ? 1 : UPGRADES[saved.purchasedUpgrades - 1]!.requiredLevel
  if (highestPurchasedLevel > getLevel(saved.lifetimeEarned)) return { ...INITIAL_GAME }
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
  })
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
  })
}
