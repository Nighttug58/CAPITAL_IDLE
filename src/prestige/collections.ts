import type { CapitalState } from '../capital.ts'
import { exactMoneyCents } from '../money.ts'
import { COLLECTION_CATEGORIES, type CollectionCategoryId, type FameBoostId } from './catalog.ts'
import {
  COLLECTION_ITEMS, getCollectionBookValueCents, getCollectionItem,
  getCollectionItemsByCategory, type CollectionItem,
} from './collections-catalog.ts'
import { hasValidFameShopLedger } from './shop.ts'
import { scaleNewFameMicros } from './bonuses.ts'
import { FAME_MICROS } from './state.ts'

export type CollectionPurchaseError =
  | 'unknown-item'
  | 'already-owned'
  | 'insufficient-funds'
  | 'invalid-state'
  | 'money-overflow'

export interface CollectionOffer {
  readonly item: CollectionItem
  readonly owned: boolean
  readonly canAfford: boolean
  readonly awardedFameMicros: number | null
}

export interface CollectionReceipt {
  readonly itemId: string
  readonly category: CollectionCategoryId
  readonly priceCents: number
  readonly baseFame: number
  readonly awardedFameMicros: number
  readonly boostId: FameBoostId
  readonly bonusBps: number
  readonly remainingCashCents: number
  readonly availableFameMicros: number
  readonly ownedCount: number
}

export type CollectionPurchase =
  | { readonly ok: true; readonly state: CapitalState; readonly receipt: CollectionReceipt }
  | { readonly ok: false; readonly state: CapitalState; readonly error: CollectionPurchaseError }

function reject(state: CapitalState, error: CollectionPurchaseError): CollectionPurchase {
  return { ok: false, state, error }
}

function hasValidCollectionState(state: CapitalState): boolean {
  if (!hasValidFameShopLedger(state)) return false
  const owned = state.prestige.ownedCollectionIds
  if (!Array.isArray(owned) || owned.length > COLLECTION_ITEMS.length ||
    new Set(owned).size !== owned.length || getCollectionBookValueCents(owned) === null) return false

  // Each owned item is a unique source of at least its base Fame. Notoriety
  // can increase this historical total, but never decrease or recalculate it.
  let earnedBaseMicros = 0
  for (const id of owned) earnedBaseMicros += getCollectionItem(id)!.fame * FAME_MICROS
  return Number.isSafeInteger(earnedBaseMicros) &&
    Number.isSafeInteger(state.prestige.collectionFameMicros) &&
    state.prestige.collectionFameMicros >= earnedBaseMicros &&
    (owned.length !== 0 || state.prestige.collectionFameMicros === 0)
}

/** Offre calculée à partir de l'état courant (sans mutation ni débit). */
export function getCollectionOffer(state: CapitalState, id: string): CollectionOffer | null {
  const item = getCollectionItem(id)
  if (!item) return null
  const owned = state.prestige.ownedCollectionIds.includes(id)
  const cashCents = exactMoneyCents(state.game.balance)
  const awardedFameMicros = scaleNewFameMicros(state, item.fame * FAME_MICROS)
  return {
    item, owned, awardedFameMicros,
    canAfford: !owned && hasValidCollectionState(state) &&
      cashCents !== null && cashCents >= item.priceCents && awardedFameMicros !== null,
  }
}

export function getCollectionOffersByCategory(
  state: CapitalState, category: string,
): readonly CollectionOffer[] {
  return getCollectionItemsByCategory(category).map((item) => getCollectionOffer(state, item.id)!)
}

export interface CollectionProgress {
  readonly category: CollectionCategoryId
  readonly owned: number
  readonly total: number
  readonly earnedBaseFame: number
  readonly totalBaseFame: number
  readonly bookValueCents: number
}

export function getCollectionProgress(state: CapitalState): readonly CollectionProgress[] {
  const owned = new Set(state.prestige.ownedCollectionIds)
  return COLLECTION_CATEGORIES.map(({ id: category }) => {
    const items = getCollectionItemsByCategory(category)
    const mine = items.filter((item) => owned.has(item.id))
    return {
      category, owned: mine.length, total: items.length,
      earnedBaseFame: mine.reduce((sum, item) => sum + item.fame, 0),
      totalBaseFame: items.reduce((sum, item) => sum + item.fame, 0),
      bookValueCents: mine.reduce((sum, item) => sum + item.priceCents, 0),
    }
  })
}

/**
 * Un achat unique en cash, puis attribution Fame selon Notoriété AVANT
 * l'acquisition. Le bonus permanent de l'objet ne multiplie donc pas sa
 * propre récompense si l'objet améliore précisément Notoriété.
 *
 * Aucun crédit d'XP, aucune recette financière, aucune taxe, aucun tick ni
 * marché: les transactions restent atomiques et les valeurs anciennes intactes.
 */
export function buyCollectionItem(state: CapitalState, id: string): CollectionPurchase {
  const item = getCollectionItem(id)
  if (!item) return reject(state, 'unknown-item')
  if (!hasValidCollectionState(state)) return reject(state, 'invalid-state')
  if (state.prestige.ownedCollectionIds.includes(id)) return reject(state, 'already-owned')

  const cashCents = exactMoneyCents(state.game.balance)
  if (cashCents === null) return reject(state, 'money-overflow')
  if (cashCents < item.priceCents) return reject(state, 'insufficient-funds')

  const awardedFameMicros = scaleNewFameMicros(state, item.fame * FAME_MICROS)
  if (awardedFameMicros === null) return reject(state, 'money-overflow')
  const fameMicros = state.prestige.fameMicros + awardedFameMicros
  const lifetimeFameMicros = state.prestige.lifetimeFameMicros + awardedFameMicros
  const collectionFameMicros = state.prestige.collectionFameMicros + awardedFameMicros
  if (![fameMicros, lifetimeFameMicros, collectionFameMicros].every(Number.isSafeInteger)) {
    return reject(state, 'money-overflow')
  }
  const cashLeft = cashCents - item.priceCents
  const nextState: CapitalState = {
    ...state,
    game: { ...state.game, balance: cashLeft / 100 },
    prestige: {
      ...state.prestige,
      fameMicros, lifetimeFameMicros, collectionFameMicros,
      ownedCollectionIds: [...state.prestige.ownedCollectionIds, id],
    },
  }

  return {
    ok: true, state: nextState,
    receipt: {
      itemId: id, category: item.category,
      priceCents: item.priceCents, baseFame: item.fame, awardedFameMicros,
      boostId: item.boostId, bonusBps: item.bonusBps,
      remainingCashCents: cashLeft,
      availableFameMicros: fameMicros,
      ownedCount: nextState.prestige.ownedCollectionIds.length,
    },
  }
}
