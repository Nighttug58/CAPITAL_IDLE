/**
 * Collections V3: all rewards are derived from canonical ownership, never
 * stored in the save or awarded a second time on load/Prestige.
 * Cached by the immutable ownership array, not re-scanned on income ticks.
 */
import {
  COLLECTION_CATEGORIES, CURRENT_COLLECTION_SLOTS, currentCollectionId,
  getCollectionSlot, FAME_BOOST_IDS,
  type CollectionCategoryId, type FameBoostId,
} from './catalog.ts'

export const COLLECTION_SET_REWARDS: Readonly<Record<CollectionCategoryId, {
  readonly boostId: FameBoostId; readonly bonusBps: number
}>> = Object.freeze({
  watches: { boostId: 'dividend', bonusBps: 5_000 },
  autos: { boostId: 'click', bonusBps: 5_000 },
  paintings: { boostId: 'xp', bonusBps: 5_000 },
  antiquities: { boostId: 'fame', bonusBps: 5_000 },
  jewelry: { boostId: 'trading', bonusBps: 5_000 },
})

export const COLLECTION_MUSEUM_INCOME_BPS = 10_000
export const COLLECTION_MUSEUM_PP_BPS = 2_500

export const COLLECTION_RARITIES = Object.freeze([
  { id: 'common', label: 'Commun', from: 1, to: 3, bonusBps: 100 },
  { id: 'uncommon', label: 'Peu commun', from: 4, to: 7, bonusBps: 300 },
  { id: 'rare', label: 'Rare', from: 8, to: 11, bonusBps: 700 },
  { id: 'epic', label: 'Épique', from: 12, to: 15, bonusBps: 1_500 },
  { id: 'legendary', label: 'Légendaire', from: 16, to: 18, bonusBps: 3_000 },
  { id: 'mythic', label: 'Mythique', from: 19, to: 20, bonusBps: 5_000 },
] as const)

export type CollectionRarity = typeof COLLECTION_RARITIES[number]

/** A legacy watch-02 and a v2:watch-02 share the current rank-3 rarity. */
export function collectionRarity(id: string): CollectionRarity | null {
  const current = getCollectionSlot('v2:' + currentCollectionId(id))
  if (!current) return null
  return COLLECTION_RARITIES.find(tier =>
    current.rank >= tier.from && current.rank <= tier.to) ?? null
}

type BonusMap = Readonly<Record<FameBoostId, number>>
type CategoryMap = Readonly<Record<CollectionCategoryId, number>>
export interface CollectionV3Snapshot {
  readonly owned: number
  readonly categories: CategoryMap
  readonly originalBps: BonusMap
  readonly rarityBps: BonusMap
  readonly setBps: BonusMap
  readonly museumComplete: boolean
  readonly museumIncomeBps: number
  readonly museumPpBps: number
}
const cached = new WeakMap<readonly string[], CollectionV3Snapshot>()
const emptyBonuses = (): Record<FameBoostId, number> =>
  Object.fromEntries(FAME_BOOST_IDS.map(id => [id, 0])) as Record<FameBoostId, number>
const emptyCategories = (): Record<CollectionCategoryId, number> =>
  Object.fromEntries(COLLECTION_CATEGORIES.map(({ id }) => [id, 0])) as Record<CollectionCategoryId, number>

/** O(number of acquisitions) once per ownership array; O(1) thereafter. */
export function collectionV3Snapshot(ids: readonly string[]): CollectionV3Snapshot {
  const previous = cached.get(ids)
  if (previous) return previous
  const categories = emptyCategories()
  const originalBps = emptyBonuses()
  const rarityBps = emptyBonuses()
  const setBps = emptyBonuses()
  const seen = new Set<string>()
  for (const id of ids) {
    const owned = getCollectionSlot(id)
    const key = currentCollectionId(id)
    const rarity = collectionRarity(key)
    if (!owned || !rarity || seen.has(key)) continue
    seen.add(key)
    categories[owned.category]++
    originalBps[owned.boostId] += owned.bonusBps
    rarityBps[owned.boostId] += rarity.bonusBps
  }
  for (const { id } of COLLECTION_CATEGORIES) {
    if (categories[id] === 20) {
      const reward = COLLECTION_SET_REWARDS[id]
      setBps[reward.boostId] += reward.bonusBps
    }
  }
  const museumComplete = seen.size === CURRENT_COLLECTION_SLOTS.length
  const snapshot: CollectionV3Snapshot = {
    owned: seen.size, categories, originalBps, rarityBps, setBps,
    museumComplete,
    museumIncomeBps: museumComplete ? COLLECTION_MUSEUM_INCOME_BPS : 0,
    museumPpBps: museumComplete ? COLLECTION_MUSEUM_PP_BPS : 0,
  }
  cached.set(ids, snapshot)
  return snapshot
}

export function collectionV3BonusBps(snapshot: CollectionV3Snapshot, id: FameBoostId): number {
  return snapshot.originalBps[id] + snapshot.rarityBps[id] + snapshot.setBps[id] +
    ((id === 'click' || id === 'enterprise' || id === 'dividend' || id === 'trading')
      ? snapshot.museumIncomeBps : 0)
}
