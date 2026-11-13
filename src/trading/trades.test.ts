import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState } from '../capital.ts'
import { earnClick, getLevel, restoreGame } from '../game.ts'
import { getAsset } from './catalog.ts'
import {
  buyAsset, feeRate, getMaximumBuyQuantity, getPortfolio, getQuickQuantity, sellAsset,
} from './trades.ts'
import type { CapitalState } from '../capital.ts'

const NOW = 1_800_000_000_000

function funded(amount = 1000): CapitalState {
  return createCapitalState({ balance: amount, lifetimeEarned: amount, purchasedUpgrades: 0 }, NOW)
}

function quoted(state: CapitalState, id: string, price: number): CapitalState {
  const asset = getAsset(id)!
  return {
    ...state,
    trading: {
      ...state.trading,
      quotes: {
        ...state.trading.quotes,
        [id]: { price, momentum: 0, dividendYield: asset.initialDividendYield, updatedAt: NOW },
      },
    },
  }
}

function buy(state: CapitalState, id: string, quantity: number): CapitalState {
  const result = buyAsset(state, id, quantity)
  assert.equal(result.ok, true, `achat ${id}: ${!result.ok ? result.error : 'OK'}`)
  return result.state
}

function sell(state: CapitalState, id: string, quantity: number): CapitalState {
  const result = sellAsset(state, id, quantity)
  assert.equal(result.ok, true, `vente ${id}: ${!result.ok ? result.error : 'OK'}`)
  return result.state
}

test('frais propres aux trois catégories sur achats et ventes', () => {
  assert.equal(feeRate('stock'), 0.005)
  assert.equal(feeRate('crypto'), 0.01)
  assert.equal(feeRate('memecoin'), 0.015)
  for (const [id, amount] of [['nvideo', 1], ['bitcoin', 0.01], ['shiba-inu', 1_000_000]] as const) {
    const start = funded(10000)
    const bought = buyAsset(start, id, amount)
    assert.equal(bought.ok, true)
    if (!bought.ok) continue
    assert.ok(bought.receipt.fee > 0)
    assert.ok(Math.abs(bought.receipt.cashChange + bought.receipt.gross + bought.receipt.fee) < 1e-8)
    const sold = sellAsset(bought.state, id, amount)
    assert.equal(sold.ok, true)
    if (!sold.ok) continue
    assert.ok(sold.receipt.fee > 0)
    assert.ok(sold.receipt.netRealizedProfit < 0, id)
    assert.equal(sold.state.game.lifetimeEarned, 10000)
    assert.equal(sold.state.trading.creditedTradingProfit, 0)
    assert.ok(sold.state.game.balance < start.game.balance)
  }
})

test('action fractionnaire : coût moyen inclut frais, vente à bénéfice net fait monter le niveau', () => {
  const original = quoted(funded(1000), 'nvideo', 200)
  const order = buyAsset(original, 'nvideo', 1.25)
  assert.equal(order.ok, true)
  if (!order.ok) return
  assert.equal(order.receipt.gross, 250)
  assert.equal(order.receipt.fee, 1.25)
  assert.equal(order.state.game.balance, 748.75)
  assert.equal(order.state.trading.positions.nvideo?.costBasis, 251.25)
  assert.equal(order.state.trading.positions.nvideo?.quantity, 1.25)
  assert.equal(original.game.balance, 1000, 'état précédent immuable')
  assert.deepEqual(original.trading.positions, {})

  const raised = quoted(order.state, 'nvideo', 220)
  const result = sellAsset(raised, 'nvideo', 1.25)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.receipt.gross, 275)
  assert.equal(result.receipt.fee, 1.38)
  assert.equal(result.receipt.cashChange, 273.62)
  assert.equal(result.receipt.netRealizedProfit, 22.37)
  assert.equal(result.receipt.levelEarnings, 22.37)
  assert.equal(result.state.game.balance, 1022.37)
  assert.equal(result.state.game.lifetimeEarned, 1022.37)
  assert.equal(result.state.trading.creditedTradingProfit, 22.37)
  assert.equal(result.state.trading.positions.nvideo, undefined)
})

test('vente partielle : coût réparti et solde des centimes conservé', () => {
  let state = quoted(funded(), 'nvideo', 100)
  state = buy(state, 'nvideo', 4)
  assert.equal(state.trading.positions.nvideo?.costBasis, 402)
  state = quoted(state, 'nvideo', 120)
  const sale = sellAsset(state, 'nvideo', 1)
  assert.equal(sale.ok, true)
  if (!sale.ok) return
  assert.equal(sale.receipt.netRealizedProfit, 18.90)
  assert.deepEqual(sale.state.trading.positions.nvideo, { quantity: 3, costBasis: 301.5 })
  assert.equal(sale.state.trading.realizedNetProfit, 18.9)
  const final = sellAsset(sale.state, 'nvideo', 3)
  assert.equal(final.ok, true)
  if (!final.ok) return
  assert.equal(final.state.trading.positions.nvideo, undefined)
  assert.equal(final.receipt.netRealizedProfit, 56.7)
  assert.equal(final.state.trading.realizedNetProfit, 75.6)
  assert.equal(final.state.game.lifetimeEarned, 1075.6)
})

test('vente à perte et récupération : aucun doublon de progression par revente', () => {
  let state = quoted(funded(1000), 'nvideo', 100)
  state = buy(state, 'nvideo', 4)
  state = quoted(state, 'nvideo', 120)
  state = sell(state, 'nvideo', 1)
  assert.equal(state.game.lifetimeEarned, 1018.9)

  state = quoted(state, 'nvideo', 80)
  const loss = sellAsset(state, 'nvideo', 3)
  assert.equal(loss.ok, true)
  if (!loss.ok) return
  assert.equal(loss.receipt.netRealizedProfit, -62.7)
  assert.equal(loss.receipt.levelEarnings, 0)
  assert.equal(loss.state.trading.realizedNetProfit, -43.8)
  assert.equal(loss.state.trading.creditedTradingProfit, 18.9)
  assert.equal(loss.state.game.lifetimeEarned, 1018.9)
  assert.equal(loss.state.trading.positions.nvideo, undefined)

  state = buy(loss.state, 'nvideo', 2)
  state = quoted(state, 'nvideo', 100)
  const recover = sellAsset(state, 'nvideo', 2)
  assert.equal(recover.ok, true)
  if (!recover.ok) return
  assert.equal(recover.receipt.netRealizedProfit, 38.2)
  assert.equal(recover.receipt.levelEarnings, 0, 'rattraper des pertes ne doit pas compter pour deux niveaux')
  assert.equal(recover.state.trading.realizedNetProfit, -5.6)
  assert.equal(recover.state.game.lifetimeEarned, 1018.9)

  state = quoted(recover.state, 'nvideo', 100)
  state = buy(state, 'nvideo', 1)
  state = quoted(state, 'nvideo', 140)
  const newRecord = sellAsset(state, 'nvideo', 1)
  assert.equal(newRecord.ok, true)
  if (!newRecord.ok) return
  assert.equal(newRecord.receipt.netRealizedProfit, 38.8)
  assert.equal(newRecord.receipt.levelEarnings, 14.3)
  assert.equal(newRecord.state.trading.creditedTradingProfit, 33.2)
  assert.equal(newRecord.state.game.lifetimeEarned, 1033.2)
})

test('MAX achetable avec frais et précision ; 25 % et 50 % ne dépassent jamais le maximum', () => {
  for (const id of ['bitcoin', 'nvideo', 'shiba-inu', 'dogecoin'] as const) {
    const state = funded(100)
    const asset = getAsset(id)!
    const max = getMaximumBuyQuantity(state, id)
    assert.ok(max > 0, id)
    const maxTrade = buyAsset(state, id, max)
    assert.equal(maxTrade.ok, true, id)
    if (!maxTrade.ok) continue
    assert.ok(maxTrade.state.game.balance >= 0)
    assert.ok(maxTrade.state.game.balance < state.game.balance)
    const next = max + 1 / (10 ** asset.quantityDecimals)
    const more = buyAsset(state, id, next)
    assert.equal(more.ok, false, `${id} : MAX doit être maximal à l'unité négociable`)
    assert.equal(getQuickQuantity(state, id, 'buy', 1), max)
    const quarter = getQuickQuantity(state, id, 'buy', 0.25)
    const half = getQuickQuantity(state, id, 'buy', 0.5)
    assert.ok(quarter > 0 && quarter <= half && half <= max)
    assert.equal(buyAsset(state, id, quarter).ok, true)
    assert.equal(buyAsset(state, id, half).ok, true)
  }
})

test('quantité totale en circulation achetable et entièrement restituée à la vente', () => {
  const id = 'bitcoin'
  const stock = getAsset(id)!.totalSupply
  const start = funded(3_000_000_000_000)
  assert.equal(getMaximumBuyQuantity(start, id), stock)
  const purchase = buyAsset(start, id, stock)
  assert.equal(purchase.ok, true)
  if (!purchase.ok) return
  assert.equal(purchase.state.trading.positions.bitcoin?.quantity, stock)
  assert.equal(getMaximumBuyQuantity(purchase.state, id), 0)
  assert.equal(buyAsset(purchase.state, id, 0.00000001).ok, false)
  assert.equal(getQuickQuantity(purchase.state, id, 'sell', 1), stock)
  const sale = sellAsset(purchase.state, id, stock)
  assert.equal(sale.ok, true)
  if (!sale.ok) return
  assert.equal(sale.state.trading.positions.bitcoin, undefined)
  assert.equal(getMaximumBuyQuantity(sale.state, id), stock)
  assert.ok(sale.state.game.balance < start.game.balance)
})

test('portfolio : valeur, P&L latent net de vente, bénéfice réalisé, dividende estimé', () => {
  let state = funded(1000)
  state = quoted(state, 'nvideo', 100)
  state = buy(state, 'nvideo', 2)
  state = quoted(state, 'nvideo', 120)
  const overview = getPortfolio(state)
  assert.equal(overview.positions.length, 1)
  assert.equal(overview.cash, 799)
  assert.equal(overview.marketValue, 240)
  assert.equal(overview.netWorth, 1039)
  assert.equal(overview.unrealizedNetProfit, 37.8)
  assert.equal(overview.positions[0]?.averageCost, 100.5)
  assert.equal(overview.positions[0]?.unrealizedNetProfit, 37.8)
  assert.ok(overview.positions[0]!.annualDividendEstimate > 0)
  assert.equal(overview.realizedNetProfit, 0)
  assert.equal(getPortfolio(funded()).marketValue, 0)
})

test('validation : erreurs de fonds, quantité, stock, cours et actif sans mutation', () => {
  const start = funded(10)
  assert.equal(buyAsset(start, 'missing', 1).ok, false)
  assert.equal(sellAsset(start, 'missing', 1).ok, false)
  assert.equal(buyAsset(start, 'nvideo', 1).ok, false)
  assert.equal(buyAsset(start, 'nvideo', 0).ok, false)
  assert.equal(buyAsset(start, 'nvideo', Number.NaN).ok, false)
  assert.equal(buyAsset(start, 'nvideo', Number.POSITIVE_INFINITY).ok, false)
  assert.equal(buyAsset(start, 'nvideo', 1.00001).ok, false)
  assert.equal(sellAsset(start, 'nvideo', 1).ok, false)
  const invalidPrice = quoted(start, 'nvideo', Number.NaN)
  assert.equal(buyAsset(invalidPrice, 'nvideo', 1).ok, false)
  assert.equal(sellAsset(invalidPrice, 'nvideo', 1).ok, false)
  const lowAmount = buyAsset(start, 'shiba-inu', 1)
  assert.equal(lowAmount.ok, false, 'interdit les micro-achats invendables dès la seconde suivante')
  assert.deepEqual(start.trading.positions, {})
  assert.equal(start.game.balance, 10)
})

test('sauvegarde au centime : le clic, le niveau et les positions restent valides', () => {
  let state = funded(1000)
  state = quoted(state, 'nvideo', 200)
  state = buy(state, 'nvideo', 1.25)
  state = quoted(state, 'nvideo', 220)
  state = sell(state, 'nvideo', 1.25)
  const restored = restoreCapitalState(JSON.parse(JSON.stringify(state)), NOW)
  assert.deepEqual(restored, state)
  assert.deepEqual(restoreGame(state.game), state.game)
  const afterClick = earnClick(restored.game)
  assert.equal(afterClick.balance, 1023.37)
  assert.equal(afterClick.lifetimeEarned, 1023.37)
  assert.equal(getLevel(afterClick.lifetimeEarned), getLevel(state.game.lifetimeEarned))
  assert.deepEqual(restoreGame(afterClick), afterClick)
})

test('aller-retour d une multitude de petits lots au même prix ne crée aucun niveau', () => {
  let state = funded(1000)
  state = quoted(state, 'shiba-inu', getAsset('shiba-inu')!.referencePrice)
  for (let i = 0; i < 100; i++) {
    const bought = buyAsset(state, 'shiba-inu', 10_000)
    assert.equal(bought.ok, true)
    if (!bought.ok) break
    state = bought.state
    const sold = sellAsset(state, 'shiba-inu', 10_000)
    assert.equal(sold.ok, true)
    if (!sold.ok) break
    state = sold.state
  }
  assert.ok(state.game.balance < 1000)
  assert.equal(state.game.lifetimeEarned, 1000)
  assert.equal(state.trading.creditedTradingProfit, 0)
  assert.equal(state.trading.positions['shiba-inu'], undefined)
})
