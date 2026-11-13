import type { CapitalState } from '../capital.ts'
import { accrueProfitTax } from '../economy/fiscal.ts'
import { ASSETS, getAsset, getAvailableSupply } from './catalog.ts'
import type { AssetDefinition, AssetKind, Position } from './types.ts'

// Le stockage reste exprimé en dollars (compatibilité v1-v4), avec des montants
// réglés au centime. Tous les transferts d'argent passent par des entiers cents.
const CENTS = 100
const MAX_CENTS = Number.MAX_SAFE_INTEGER

export type TradeSide = 'buy' | 'sell'
export type TradeError = 'unknown-asset' | 'invalid-quantity' | 'invalid-price' |
  'insufficient-funds' | 'insufficient-supply' | 'insufficient-holdings' |
  'amount-too-small' | 'money-overflow'
export type TradeFraction = 0.25 | 0.5 | 1

export interface TradeReceipt {
  readonly assetId: string
  readonly side: TradeSide
  readonly quantity: number
  readonly price: number
  readonly gross: number
  readonly fee: number
  readonly cashChange: number
  readonly netRealizedProfit: number
  readonly levelEarnings: number
  readonly taxAccrued: number // dette future, jamais retenue immédiatement
}

export type TradeResult =
  | { readonly ok: true; readonly state: CapitalState; readonly receipt: TradeReceipt }
  | { readonly ok: false; readonly state: CapitalState; readonly error: TradeError }

export interface PortfolioPosition {
  readonly asset: AssetDefinition
  readonly quantity: number
  readonly costBasis: number
  readonly averageCost: number
  readonly currentPrice: number
  readonly marketValue: number
  readonly estimatedSaleProceeds: number
  readonly unrealizedNetProfit: number
  // Information indicative uniquement : versement effectivement activé en passe 7.
  readonly annualDividendEstimate: number
}

export interface PortfolioOverview {
  readonly cash: number
  readonly marketValue: number
  readonly netWorth: number
  readonly unrealizedNetProfit: number
  readonly realizedNetProfit: number
  readonly positions: readonly PortfolioPosition[]
}

export function feeRate(kind: AssetKind): number {
  return kind === 'stock' ? 0.005 : kind === 'crypto' ? 0.01 : 0.015
}

function asCents(value: number): number | null {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_CENTS / CENTS) return null
  const cents = Math.round(value * CENTS)
  return Number.isSafeInteger(cents) && Math.abs(value * CENTS - cents) < 0.0001 ? cents : null
}

function toMoney(cents: number): number {
  return cents / CENTS
}

function validQuote(asset: AssetDefinition, state: CapitalState): number | null {
  const current = state.trading.quotes[asset.id]
  const price = current?.price ?? asset.referencePrice
  return Number.isFinite(price) && price >= asset.minPrice && price <= asset.maxPrice ? price : null
}

function floorWithPrecision(value: number, decimals: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  const multiplier = 10 ** decimals
  return Math.floor(value * multiplier + 1e-8) / multiplier
}

function isQuantity(value: number, asset: AssetDefinition): boolean {
  if (!Number.isFinite(value) || value <= 0 || value > asset.totalSupply) return false
  // Tolère la représentation binaire normale de 0.1 / 0.00000001.
  const scaled = value * 10 ** asset.quantityDecimals
  return Math.abs(scaled - Math.round(scaled)) < 0.0001
}

function buyMoney(asset: AssetDefinition, price: number, quantity: number): {
  grossCents: number; feeCents: number; totalCents: number
} | null {
  const gross = price * quantity * CENTS
  if (!Number.isFinite(gross) || gross <= 0 || gross > MAX_CENTS / 2) return null
  // Favorise la caisse : toute fraction de centime est payée par l'acheteur.
  const grossCents = Math.ceil(gross - 1e-8)
  const feeCents = Math.max(1, Math.ceil(gross * feeRate(asset.kind) - 1e-8))
  if (!Number.isSafeInteger(grossCents + feeCents)) return null
  return { grossCents, feeCents, totalCents: grossCents + feeCents }
}

function sellMoney(asset: AssetDefinition, price: number, quantity: number): {
  grossCents: number; feeCents: number; proceedsCents: number
} | null {
  const gross = price * quantity * CENTS
  if (!Number.isFinite(gross) || gross <= 0 || gross > MAX_CENTS / 2) return null
  // La vente ne crée jamais artificiellement un centime inexistant.
  const grossCents = Math.floor(gross + 1e-8)
  const feeCents = Math.max(1, Math.ceil(gross * feeRate(asset.kind) - 1e-8))
  if (grossCents <= feeCents) return null
  return { grossCents, feeCents, proceedsCents: grossCents - feeCents }
}

function reject(state: CapitalState, error: TradeError): TradeResult {
  return { ok: false, state, error }
}

// Recherche exacte (à la précision négociable) de la quantité maximale
// finançable, avec commissions et arrondis inclus. Les quantités très grandes
// réduisent la précision au maximum encore représentable sans perte d'entier.
export function getMaximumBuyQuantity(state: CapitalState, assetId: string): number {
  const asset = getAsset(assetId)
  if (!asset) return 0
  const price = validQuote(asset, state)
  const wallet = asCents(state.game.balance)
  if (price === null || wallet === null || wallet <= 0) return 0
  const owned = state.trading.positions[asset.id]?.quantity ?? 0
  if (!Number.isFinite(owned) || owned < 0 || owned > asset.totalSupply) return 0
  const available = getAvailableSupply(asset, owned)
  if (available <= 0) return 0

  const upper = Math.min(available, wallet / (CENTS * price))
  if (!Number.isFinite(upper) || upper <= 0) return 0

  let multiplier = 10 ** asset.quantityDecimals
  while (multiplier > 1 && upper * multiplier > Number.MAX_SAFE_INTEGER) multiplier /= 10
  let low = 0
  let high = Math.floor(upper * multiplier + 1e-8)
  // Entiers représentables : au plus 53 décisions (recherche dichotomique).
  while (low < high) {
    const middle = low + Math.ceil((high - low) / 2)
    const quantity = middle / multiplier
    const order = buyMoney(asset, price, quantity)
    if (order && order.totalCents <= wallet) low = middle
    else high = middle - 1
  }
  return low / multiplier
}

export function getQuickQuantity(
  state: CapitalState,
  assetId: string,
  side: TradeSide,
  fraction: TradeFraction,
): number {
  const asset = getAsset(assetId)
  if (!asset || ![0.25, 0.5, 1].includes(fraction)) return 0
  const max = side === 'buy'
    ? getMaximumBuyQuantity(state, assetId)
    : (state.trading.positions[assetId]?.quantity ?? 0)
  if (!Number.isFinite(max) || max <= 0) return 0
  return fraction === 1 ? max : floorWithPrecision(max * fraction, asset.quantityDecimals)
}

export function buyAsset(state: CapitalState, assetId: string, quantity: number): TradeResult {
  const asset = getAsset(assetId)
  if (!asset) return reject(state, 'unknown-asset')
  if (!isQuantity(quantity, asset)) return reject(state, 'invalid-quantity')

  const price = validQuote(asset, state)
  if (price === null) return reject(state, 'invalid-price')
  const owned = state.trading.positions[asset.id]?.quantity ?? 0
  if (!Number.isFinite(owned) || owned < 0 || owned > asset.totalSupply) return reject(state, 'invalid-quantity')
  if (quantity > getAvailableSupply(asset, owned) + 1e-9) return reject(state, 'insufficient-supply')
  // Éviter les achats de poussière qui seraient invendables sans aucun produit
  // de vente après arrondi et commissions, même sans mouvement de marché.
  if (!sellMoney(asset, price, quantity)) return reject(state, 'amount-too-small')
  const order = buyMoney(asset, price, quantity)
  if (!order) return reject(state, 'money-overflow')

  const cash = asCents(state.game.balance)
  if (cash === null) return reject(state, 'money-overflow')
  if (cash < order.totalCents) return reject(state, 'insufficient-funds')

  const previous = state.trading.positions[asset.id]
  const oldBasis = asCents(previous?.costBasis ?? 0)
  if (oldBasis === null || !Number.isSafeInteger(oldBasis + order.totalCents)) return reject(state, 'money-overflow')
  const totalQuantity = owned + quantity
  if (!Number.isFinite(totalQuantity) || totalQuantity > asset.totalSupply + 1e-9) return reject(state, 'insufficient-supply')
  const nextPosition: Position = {
    quantity: Math.min(totalQuantity, asset.totalSupply),
    costBasis: toMoney(oldBasis + order.totalCents),
  }
  const nextState: CapitalState = {
    ...state,
    game: { ...state.game, balance: toMoney(cash - order.totalCents) },
    trading: {
      ...state.trading,
      positions: { ...state.trading.positions, [asset.id]: nextPosition },
    },
  }
  return {
    ok: true, state: nextState,
    receipt: {
      assetId, side: 'buy', quantity, price,
      gross: toMoney(order.grossCents),
      fee: toMoney(order.feeCents),
      cashChange: -toMoney(order.totalCents),
      netRealizedProfit: 0, levelEarnings: 0, taxAccrued: 0,
    },
  }
}

export function sellAsset(state: CapitalState, assetId: string, quantity: number): TradeResult {
  const asset = getAsset(assetId)
  if (!asset) return reject(state, 'unknown-asset')
  if (!isQuantity(quantity, asset)) return reject(state, 'invalid-quantity')
  const position = state.trading.positions[assetId]
  if (!position || quantity > position.quantity + 1e-9) return reject(state, 'insufficient-holdings')

  const price = validQuote(asset, state)
  if (price === null) return reject(state, 'invalid-price')
  const order = sellMoney(asset, price, quantity)
  if (!order) return reject(state, 'amount-too-small')

  const cash = asCents(state.game.balance)
  const earned = asCents(state.game.lifetimeEarned)
  const basis = asCents(position.costBasis)
  const realized = asCents(state.trading.realizedNetProfit)
  const credited = asCents(state.trading.creditedTradingProfit)
  if ([cash, earned, basis, realized, credited].some((value) => value === null)) return reject(state, 'money-overflow')
  const cashCents = cash!
  const earnedCents = earned!
  const basisCents = basis!
  const realizedCents = realized!
  const creditedCents = credited!

  // La dernière vente récupère TOUS les centimes du coût d'acquisition.
  // Une vente partielle répartit le coût moyen à l'arrondi le plus proche.
  const all = quantity >= position.quantity - 1e-9
  const soldBasis = all ? basisCents : Math.round(basisCents * (quantity / position.quantity))
  const profit = order.proceedsCents - soldBasis
  const newRealized = realizedCents + profit
  const newCredited = Math.max(creditedCents, newRealized, 0)
  // Haut historique du bénéfice net cumulatif : une perte suivie d'un simple
  // retour à l'équilibre ne crédite PAS de nouveau le niveau.
  const levelEarnings = newCredited - creditedCents
  if (![newRealized, newCredited, cashCents + order.proceedsCents, earnedCents + levelEarnings].every(Number.isSafeInteger)) {
    return reject(state, 'money-overflow')
  }

  const positions = { ...state.trading.positions }
  if (all) delete positions[asset.id]
  else {
    positions[asset.id] = {
      quantity: floorWithPrecision(position.quantity - quantity, asset.quantityDecimals),
      costBasis: toMoney(basisCents - soldBasis),
    }
  }

  const nextState: CapitalState = {
    ...state,
    game: {
      ...state.game,
      balance: toMoney(cashCents + order.proceedsCents),
      lifetimeEarned: toMoney(earnedCents + levelEarnings),
    },
    trading: {
      ...state.trading,
      positions,
      realizedNetProfit: toMoney(newRealized),
      creditedTradingProfit: toMoney(newCredited),
    },
  }
  // Le prix de revient vendu inclut déjà les frais d'achat ; le produit
  // de vente est déjà net de ses frais. Ne pas imposer le capital récupéré.
  // La taxe est une dette et ne modifie ni le cash de vente ni les niveaux.
  const taxable = accrueProfitTax(nextState, asset.kind === 'stock' ? 'stocks' : asset.kind === 'memecoin' ? 'memecoins' : 'crypto', Math.max(0, profit))
  if (!taxable) return reject(state, 'money-overflow')
  const taxAccrued = taxable.fiscal.taxesDueCents - state.fiscal.taxesDueCents
  return {
    ok: true, state: taxable,
    receipt: {
      assetId, side: 'sell', quantity, price,
      gross: toMoney(order.grossCents), fee: toMoney(order.feeCents),
      cashChange: toMoney(order.proceedsCents),
      netRealizedProfit: toMoney(profit), levelEarnings: toMoney(levelEarnings),
      taxAccrued: toMoney(taxAccrued),
    },
  }
}

// Vue globale sans mutation ; la vente hypothétique tient compte de sa commission.
export function getPortfolio(state: CapitalState): PortfolioOverview {
  const positions: PortfolioPosition[] = []
  let marketValue = 0
  let unrealizedNetProfitCents = 0

  for (const asset of ASSETS) {
    const position = state.trading.positions[asset.id]
    if (!position || position.quantity <= 0) continue
    const price = validQuote(asset, state) ?? asset.referencePrice
    const estimatedSale = sellMoney(asset, price, position.quantity)
    const currentValue = price * position.quantity
    const pnlCents = (estimatedSale?.proceedsCents ?? 0) - (asCents(position.costBasis) ?? 0)
    const dividendYield = state.trading.quotes[asset.id]?.dividendYield ?? asset.initialDividendYield

    positions.push({
      asset,
      quantity: position.quantity,
      costBasis: position.costBasis,
      averageCost: position.costBasis / position.quantity,
      currentPrice: price,
      marketValue: currentValue,
      estimatedSaleProceeds: estimatedSale ? toMoney(estimatedSale.proceedsCents) : 0,
      unrealizedNetProfit: toMoney(pnlCents),
      annualDividendEstimate: asset.kind === 'stock' && dividendYield !== null
        ? position.quantity * asset.referencePrice * dividendYield
        : 0,
    })
    marketValue += currentValue
    unrealizedNetProfitCents += pnlCents
  }
  return {
    cash: state.game.balance,
    marketValue,
    netWorth: state.game.balance + marketValue,
    unrealizedNetProfit: toMoney(unrealizedNetProfitCents),
    realizedNetProfit: state.trading.realizedNetProfit,
    positions,
  }
}
