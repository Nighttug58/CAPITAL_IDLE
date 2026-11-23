/**
 * CAPITAL_IDLE — Fame / Collection (catalogue immuable, passe 1).
 * Aucune transaction ni état de joueur ici : ce sont des règles d'équilibrage.
 * 1 % = 100 basis points (bps), 1 $ = 100 centimes.
 */

export const MAX_FAME_BOOST_LEVEL = 20 as const
export const FAME_BOOST_BPS_PER_LEVEL = 500 as const // +5 points de pourcentage

export const FAME_BOOST_IDS = Object.freeze([
  'click', 'enterprise', 'dividend', 'xp', 'trading', 'fame',
] as const)
export type FameBoostId = typeof FAME_BOOST_IDS[number]

export interface FameBoostDefinition {
  readonly id: FameBoostId
  readonly label: string
  readonly description: string
  readonly costs: readonly number[] // Index 0 = achat du palier 1.
  readonly totalCost: number
}

function buildCosts(first: number, increment: number): readonly number[] {
  return Object.freeze(Array.from({ length: MAX_FAME_BOOST_LEVEL }, (_, index) => first + increment * index))
}

const STANDARD_COSTS = buildCosts(52, 15)
const NOTORIETY_COSTS = buildCosts(70, 20)

const boostRows: readonly { id: FameBoostId; label: string; description: string; costs: readonly number[] }[] = [
  { id: 'click', label: 'Puissance de clic', description: 'Augmente les revenus par clic.', costs: STANDARD_COSTS },
  { id: 'enterprise', label: 'Empire industriel', description: 'Augmente les revenus des entreprises.', costs: STANDARD_COSTS },
  { id: 'dividend', label: 'Dividendes', description: 'Augmente les dividendes reçus.', costs: STANDARD_COSTS },
  { id: 'xp', label: 'Expérience', description: 'Augmente les gains d’expérience.', costs: STANDARD_COSTS },
  { id: 'trading', label: 'Trading', description: 'Augmente uniquement les profits positifs nets réalisés.', costs: STANDARD_COSTS },
  { id: 'fame', label: 'Notoriété', description: 'Augmente les nouvelles récompenses de Fame.', costs: NOTORIETY_COSTS },
]

export const FAME_BOOSTS: readonly FameBoostDefinition[] = Object.freeze(boostRows.map((item) => Object.freeze({
  ...item,
  totalCost: item.costs.reduce((sum, cost) => sum + cost, 0),
})))
const boostsById = new Map<FameBoostId, FameBoostDefinition>(FAME_BOOSTS.map((boost) => [boost.id, boost]))

export function getFameBoost(id: string): FameBoostDefinition | undefined {
  return boostsById.get(id as FameBoostId)
}

/** Prix du PROCHAIN palier pour un niveau actuellement possédé (0..19). */
export function getNextFameBoostCost(id: string, currentLevel: number): number | null {
  const boost = getFameBoost(id)
  if (!boost || !Number.isSafeInteger(currentLevel) || currentLevel < 0 || currentLevel >= MAX_FAME_BOOST_LEVEL) return null
  return boost.costs[currentLevel] ?? null
}

export const TOTAL_FAME_SHOP_COST = FAME_BOOSTS.reduce((sum, boost) => sum + boost.totalCost, 0)

/**
 * Fame Shop V2 tariff (pass 5): first rank costs 5× the original; the
 * additional quadratic term increases the premium at higher ranks. The
 * 120-rank shop costs exactly 167 710 Fame. Historic V7/V8 purchases retain
 * the original tariff and are never recharged when the game is migrated.
 */
export const FAME_SHOP_TARIFF_VERSION = 2 as const
export const V2_FAME_BOOSTS: readonly FameBoostDefinition[] = Object.freeze(FAME_BOOSTS.map(boost => {
  const costs = Object.freeze(boost.costs.map((original, index) => original * 5 + 3 * index * index))
  return Object.freeze({ ...boost, costs, totalCost: costs.reduce((sum, cost) => sum + cost, 0) })
}))
export const TOTAL_V2_FAME_SHOP_COST = V2_FAME_BOOSTS.reduce((sum, boost) => sum + boost.totalCost, 0)
/** Current V9 classic tariff, no legacy rank witness. */
export function getV9PurchasedFameCost(levels:unknown):bigint|null {
  if(!levels||typeof levels!=='object'||Array.isArray(levels))return null
  const ranks=levels as Record<string,unknown>
  if(Object.keys(ranks).length!==V2_FAME_BOOSTS.length)return null
  let total=0n
  for(const row of V2_FAME_BOOSTS){
    if(!Object.hasOwn(ranks,row.id))return null
    const level=ranks[row.id]
    if(typeof level!=='number'||!Number.isSafeInteger(level)||level<0||level>MAX_FAME_BOOST_LEVEL)return null
    for(let i=0;i<level;i++)total+=BigInt(row.costs[i]!)
  }
  return total
}
const v2ById = new Map<FameBoostId, FameBoostDefinition>(V2_FAME_BOOSTS.map(boost => [boost.id, boost]))

export function getV2NextFameBoostCost(id: string, level: number): number | null {
  const boost = v2ById.get(id as FameBoostId)
  if (!boost || !Number.isSafeInteger(level) || level < 0 || level >= MAX_FAME_BOOST_LEVEL) return null
  return boost.costs[level] ?? null
}

/**
 * Anti-forgery ledger: each historically purchased rank is priced at its
 * original cost; all subsequent ranks are priced at V2. legacyLevels are
 * frozen on initial migration, and cannot grow during normal game actions.
 */
export function getVersionedPurchasedFameCost(
  levels: Readonly<Record<FameBoostId, number>>,
  legacyLevels: Readonly<Record<FameBoostId, number>>,
): number | null {
  if (!levels || !legacyLevels || typeof levels !== 'object' || typeof legacyLevels !== 'object' ||
      Array.isArray(levels) || Array.isArray(legacyLevels) ||
      Object.keys(levels).length !== FAME_BOOST_IDS.length ||
      Object.keys(legacyLevels).length !== FAME_BOOST_IDS.length) return null
  let total = 0
  for (const boost of FAME_BOOSTS) {
    const current = levels[boost.id]
    const preserved = legacyLevels[boost.id]
    const v2 = v2ById.get(boost.id)!
    if (!Number.isSafeInteger(current) || !Number.isSafeInteger(preserved) ||
        preserved < 0 || current < preserved || current > MAX_FAME_BOOST_LEVEL) return null
    for (let i = 0; i < current; i++) total += i < preserved ? boost.costs[i]! : v2.costs[i]!
  }
  return total
}

/**
 * Total Fame already spent on the six boost trees. Derive the ledger from the
 * immutable price catalog rather than storing a second spend counter.
 * Any invalid, unknown or out-of-range level makes the ledger invalid.
 */
export function getPurchasedFameBoostCost(
  levels: Readonly<Record<FameBoostId, number>>,
): number | null {
  if (!levels || typeof levels !== 'object' || Array.isArray(levels) ||
    Object.keys(levels).length !== FAME_BOOST_IDS.length) return null

  let spent = 0
  for (const boost of FAME_BOOSTS) {
    const level = levels[boost.id]
    if (!Number.isSafeInteger(level) || level < 0 || level > MAX_FAME_BOOST_LEVEL) return null
    for (let index = 0; index < level; index++) spent += boost.costs[index]!
  }
  return spent
}

export const COLLECTION_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'watches', label: 'Montres' }),
  Object.freeze({ id: 'autos', label: 'Autos' }),
  Object.freeze({ id: 'paintings', label: 'Peintures' }),
  Object.freeze({ id: 'antiquities', label: 'Antiquités' }),
  Object.freeze({ id: 'jewelry', label: 'Joaillerie' }),
] as const)
export type CollectionCategoryId = typeof COLLECTION_CATEGORIES[number]['id']

export interface CollectionRankReward {
  readonly rank: number
  readonly fame: number // Fame de base gagnée une seule fois à l'achat
  readonly bonusBps: number // Bonus attribué à UNE statistique, choisie passe 5
}

const fameByRank = [10, 25, 50, 100, 180, 300, 500, 750, 950, 1175] as const
const bonusBpsByRank = [10, 20, 30, 50, 80, 120, 180, 250, 350, 500] as const

export const COLLECTION_RANK_REWARDS: readonly CollectionRankReward[] = Object.freeze(
  fameByRank.map((fame, i) => Object.freeze({ rank: i + 1, fame, bonusBps: bonusBpsByRank[i]! })),
)

/**
 * 50 prix en dollars fictifs, calibrés sur l'économie actuelle :
 * - première tranche : 1 500 à 15 000 $, accessible avant le Kiosque (75 k$) ;
 * - tranches intermédiaires : commerces et services (75 k$ à 35 M$) ;
 * - tranches 8 à 10 : industrie (80 M$ à 500 M$), avec au plus 450 M$ ;
 * - à 500 M$ d'entreprise / 30 h de remboursement brut, 450 M$ représentent
 *   27 heures de revenu brut au niveau 1, sans autres entreprises ni boosts.
 * Le catalogue n'affirme pas que ces prix sont des cotations réelles.
 */
export const COLLECTION_PRICES_DOLLARS: Readonly<Record<CollectionCategoryId, readonly number[]>> = Object.freeze({
  watches: Object.freeze([2_500, 12_000, 70_000, 230_000, 900_000, 4_000_000, 16_000_000, 45_000_000, 80_000_000, 120_000_000]),
  autos: Object.freeze([15_000, 60_000, 180_000, 600_000, 2_500_000, 9_000_000, 32_000_000, 95_000_000, 190_000_000, 300_000_000]),
  paintings: Object.freeze([1_500, 10_000, 90_000, 450_000, 2_200_000, 12_000_000, 50_000_000, 130_000_000, 240_000_000, 450_000_000]),
  antiquities: Object.freeze([4_000, 18_000, 105_000, 500_000, 2_000_000, 11_000_000, 40_000_000, 105_000_000, 200_000_000, 350_000_000]),
  jewelry: Object.freeze([3_000, 14_000, 85_000, 400_000, 1_800_000, 8_000_000, 28_000_000, 85_000_000, 150_000_000, 250_000_000]),
})

/** One permanent boost target per luxury item; all share the Fame Shop engine. */
export const COLLECTION_BONUS_TARGETS: Readonly<Record<CollectionCategoryId, readonly FameBoostId[]>> = Object.freeze({
  watches: Object.freeze(['dividend', 'fame', 'trading', 'click', 'dividend', 'xp', 'enterprise', 'fame', 'trading', 'fame'] as const),
  autos: Object.freeze(['click', 'trading', 'enterprise', 'xp', 'click', 'trading', 'enterprise', 'fame', 'click', 'trading'] as const),
  paintings: Object.freeze(['xp', 'fame', 'dividend', 'xp', 'fame', 'dividend', 'enterprise', 'fame', 'dividend', 'xp'] as const),
  antiquities: Object.freeze(['fame', 'xp', 'trading', 'fame', 'xp', 'dividend', 'click', 'fame', 'enterprise', 'fame'] as const),
  jewelry: Object.freeze(['fame', 'dividend', 'trading', 'enterprise', 'fame', 'click', 'dividend', 'fame', 'trading', 'enterprise'] as const),
})

export interface CollectionPriceSlot {
  readonly id: string // Identifiant stable, conservé quand les fiches seront enrichies passe 5.
  readonly category: CollectionCategoryId
  readonly rank: number
  readonly priceCents: number
  readonly fame: number
  readonly bonusBps: number
  readonly boostId: FameBoostId
}

export const COLLECTION_SLOTS: readonly CollectionPriceSlot[] = Object.freeze(
  COLLECTION_CATEGORIES.flatMap(({ id: category }) =>
    COLLECTION_RANK_REWARDS.map((reward, index) => Object.freeze({
      id: `${category}-${String(reward.rank).padStart(2, '0')}`,
      category,
      rank: reward.rank,
      priceCents: COLLECTION_PRICES_DOLLARS[category][index]! * 100,
      fame: reward.fame,
      bonusBps: reward.bonusBps,
      boostId: COLLECTION_BONUS_TARGETS[category][index]!,
    })),
  ),
)

const slotsById = new Map<string, CollectionPriceSlot>(COLLECTION_SLOTS.map((slot) => [slot.id, slot]))
// A versioned acquisition ID keeps the original price, Fame and bonus of each receipt.
export const currentCollectionId = (id: string) => id.replace(/^v2:/, '')
export const CURRENT_COLLECTION_SLOTS = Object.freeze(COLLECTION_SLOTS.flatMap(slot => {
  const current = { ...slot, id: 'v2:' + slot.id, priceCents: slot.priceCents * 2,
    fame: slot.fame * 3, rank: slot.rank * 2 - 1 }
  const nextPrice = COLLECTION_PRICES_DOLLARS[slot.category][slot.rank]
  const extra = { ...current, id: 'v2:' + slot.category + '-extra-' + slot.rank,
    rank: current.rank + 1, priceCents: nextPrice === undefined ? current.priceCents * 10
      : (current.priceCents + nextPrice * 200) / 2,
    fame: slot.rank === 10 ? current.fame * 3
      : Math.round((current.fame + COLLECTION_RANK_REWARDS[slot.rank]!.fame * 3) / 2) }
  return [Object.freeze(current), Object.freeze(extra)]
}))
for (const slot of CURRENT_COLLECTION_SLOTS) slotsById.set(slot.id, slot)

export function getCollectionSlot(id: string): CollectionPriceSlot | undefined {
  return slotsById.get(id)
}

export const COLLECTION_BASE_FAME = COLLECTION_SLOTS.reduce((sum, slot) => sum + slot.fame, 0)
export const LEVEL_100_BASE_FAME = (100 * 101) / 2
export const TOTAL_BASE_FAME_TO_LEVEL_100 = LEVEL_100_BASE_FAME + COLLECTION_BASE_FAME
