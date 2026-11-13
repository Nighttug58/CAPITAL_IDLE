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

// Le niveau dépend UNIQUEMENT du total gagné depuis le début de la partie.
// Chaque niveau après le premier déverrouille une amélioration payante.
export const LEVEL_THRESHOLDS = [0, 100, 500, 2_000, 10_000, 50_000] as const

export const UPGRADES: readonly Upgrade[] = [
  { requiredLevel: 2, price: 50, clickValue: 2 },
  { requiredLevel: 3, price: 250, clickValue: 5 },
  { requiredLevel: 4, price: 1_000, clickValue: 10 },
  { requiredLevel: 5, price: 5_000, clickValue: 25 },
  { requiredLevel: 6, price: 25_000, clickValue: 50 },
]

export const INITIAL_GAME: Readonly<GameState> = {
  balance: 0,
  lifetimeEarned: 0,
  purchasedUpgrades: 0,
}

const isValidInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

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
export function restoreGame(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object') return { ...INITIAL_GAME }
  const saved = raw as Partial<GameState>
  if (!isValidInteger(saved.balance) || !isValidInteger(saved.lifetimeEarned) || !isValidInteger(saved.purchasedUpgrades)) {
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
