import type { CapitalState } from './capital.ts'
import { exactMoneyCents } from './money.ts'

export type AchievementMetric = 'level' | 'clicks' | 'earnings' | 'enterprises' | 'collections' | 'prestiges'

export interface AchievementTier {
  readonly id: string
  readonly target: number
  readonly rewardCents: number
}
export interface AchievementGroup {
  readonly id: AchievementMetric
  readonly title: string
  readonly description: string
  readonly unit: string
  readonly tiers: readonly AchievementTier[]
}
export interface AchievementsState {
  readonly claimedIds: readonly string[]
}

function tiers(group: string, steps: readonly (readonly [number, number])[]): readonly AchievementTier[] {
  return steps.map(([target, dollars]) => ({
    id: group + '-' + target, target, rewardCents: dollars * 100,
  }))
}

/** Les montants sont des cadeaux en cash, pas des revenus éligibles à l'XP. */
export const ACHIEVEMENTS: readonly AchievementGroup[] = [
  { id: 'level', title: 'Investisseur chevronné', description: 'Meilleur niveau atteint, même après Prestige.',
    unit: 'niveau', tiers: tiers('level', [[5, 250], [10, 1_000], [25, 5_000], [50, 25_000], [100, 100_000]]) },
  { id: 'clicks', title: 'Clics en série', description: 'Clics effectués dans le cycle actuel.',
    unit: 'clics', tiers: tiers('clicks', [[100, 100], [1_000, 500], [10_000, 5_000], [100_000, 50_000]]) },
  { id: 'earnings', title: 'Empire financier', description: 'Revenus cumulés dans le cycle actuel, hors cadeaux.',
    unit: '$', tiers: tiers('earnings', [[1_000, 250], [10_000, 1_500], [100_000, 15_000], [1_000_000, 100_000], [100_000_000, 5_000_000]]) },
  { id: 'enterprises', title: 'Entrepreneur', description: 'Entreprises détenues dans le cycle actuel.',
    unit: 'entreprises', tiers: tiers('enterprises', [[1, 500], [5, 5_000], [10, 25_000], [20, 100_000]]) },
  { id: 'collections', title: 'Collectionneur', description: 'Objets de collection conservés entre les Prestiges.',
    unit: 'objets', tiers: tiers('collections', [[1, 1_500], [10, 15_000], [25, 150_000], [50, 500_000]]) },
  { id: 'prestiges', title: 'Légende du capital', description: 'Nombre total de cycles Prestige terminés.',
    unit: 'Prestiges', tiers: tiers('prestiges', [[1, 100_000], [3, 500_000], [5, 2_000_000], [10, 5_000_000]]) },
]
const IDS = new Set(ACHIEVEMENTS.flatMap(group => group.tiers.map(tier => tier.id)))

export function createInitialAchievementsState(): AchievementsState {
  return { claimedIds: [] }
}
export function restoreAchievementsState(raw: unknown): AchievementsState {
  if (raw === undefined) return createInitialAchievementsState() // anciennes v7
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return createInitialAchievementsState()
  const record = raw as Record<string, unknown>
  if (Object.keys(record).length !== 1 || !Array.isArray(record.claimedIds) ||
      record.claimedIds.length > IDS.size ||
      record.claimedIds.some(id => typeof id !== 'string' || !IDS.has(id)) ||
      new Set(record.claimedIds).size !== record.claimedIds.length) return createInitialAchievementsState()
  return { claimedIds: [...record.claimedIds] as string[] }
}

export function achievementProgress(state: CapitalState, metric: AchievementMetric): number {
  switch (metric) {
    case 'level': return Math.max(state.ascension.progress.highestFameAwardedLevel, state.prestige.lastAwardedLevel)
    case 'clicks': return state.stats.clickCount
    case 'earnings': return state.game.lifetimeEarned
    case 'enterprises': return Object.keys(state.enterprises.owned).length
    case 'collections': return state.prestige.ownedCollectionIds.length
    case 'prestiges': return state.ascension.progress.prestigeCount
  }
}

export interface AchievementOffer {
  readonly id: string
  readonly group: AchievementMetric
  readonly target: number
  readonly rewardCents: number
  readonly progress: number
  readonly claimed: boolean
  readonly claimable: boolean
}

export function getAchievementOffers(state: CapitalState): AchievementOffer[] {
  const claimed = new Set(state.achievements.claimedIds)
  return ACHIEVEMENTS.flatMap(group => group.tiers.map(tier => {
    const progress = achievementProgress(state, group.id)
    return {
      id: tier.id, group: group.id, target: tier.target, rewardCents: tier.rewardCents,
      progress, claimed: claimed.has(tier.id),
      claimable: progress >= tier.target && !claimed.has(tier.id),
    }
  }))
}
export function getClaimableAchievementCount(state: CapitalState): number {
  return getAchievementOffers(state).filter(offer => offer.claimable).length
}

export type AchievementClaimResult =
  | { readonly ok: true; readonly state: CapitalState; readonly rewardCents: number; readonly id: string }
  | { readonly ok: false; readonly state: CapitalState; readonly error: 'unknown' | 'locked' | 'claimed' | 'money-overflow' | 'storage-error' }

export function claimAchievement(state: CapitalState, id: string): AchievementClaimResult {
  const tier = ACHIEVEMENTS.flatMap(group => group.tiers).find(item => item.id === id)
  if (!tier) return { ok: false, state, error: 'unknown' }
  if (state.achievements.claimedIds.includes(id)) return { ok: false, state, error: 'claimed' }
  const group = ACHIEVEMENTS.find(item => item.tiers.includes(tier))!
  if (achievementProgress(state, group.id) < tier.target) return { ok: false, state, error: 'locked' }
  const balanceCents = exactMoneyCents(state.game.balance)
  if (balanceCents === null || !Number.isSafeInteger(balanceCents + tier.rewardCents)) {
    return { ok: false, state, error: 'money-overflow' }
  }
  return {
    ok: true, id, rewardCents: tier.rewardCents,
    state: {
      ...state,
      game: { ...state.game, balance: (balanceCents + tier.rewardCents) / 100 },
      achievements: { claimedIds: [...state.achievements.claimedIds, id] },
    },
  }
}
