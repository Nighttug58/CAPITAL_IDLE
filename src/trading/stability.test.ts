import assert from 'node:assert/strict'
import test from 'node:test'
import { ASSETS, createInitialQuotes } from './catalog.ts'
import { createCapitalState, restoreCapitalState } from '../capital.ts'
import { advanceMarketTick, MARKET_HISTORY_MS, MARKET_MAX_SAMPLES, MARKET_TICK_MS } from './market.ts'
import { catchUpCapital, MAX_CATCH_UP_SECONDS } from './clock.ts'
import { buyAsset, getMaximumBuyQuantity, getQuickQuantity, sellAsset, getPortfolio } from './trades.ts'
import { restoreTradingState } from './state.ts'
import { dividendCentsForSecond } from './dividends.ts'

const START = 1_800_000_000_000
const HOUR = 3_600_000
const DAY = HOUR * 24

test('trois simulations de 6 heures : 45 cours bornés, rendements et historique valide', () => {
  for (const seed of [1, 0xabc123, 0xdeadbeef]) {
    const state = createCapitalState(undefined, START)
    let trading = { ...state.trading, seed }
    let ups = 0, downs = 0
    const previous = new Map<string, number>()
    for (let tick = 0; tick < 6 * HOUR / MARKET_TICK_MS; tick++) {
      const at = trading.lastTickAt + MARKET_TICK_MS
      trading = advanceMarketTick(trading, at > START + 5 * HOUR)
      if (tick % 12 !== 0) continue
      for (const asset of ASSETS) {
        const quote = trading.quotes[asset.id]!
        assert.ok(quote && Number.isFinite(quote.price) && quote.price >= asset.minPrice && quote.price <= asset.maxPrice, asset.id)
        if (asset.kind === 'stock') assert.ok(quote.dividendYield !== null && quote.dividendYield >= .01 && quote.dividendYield <= .3)
        else assert.equal(quote.dividendYield, null)
        const prev = previous.get(asset.id)
        if (prev !== undefined) {
          if (quote.price > prev) ups++
          if (quote.price < prev) downs++
        }
        previous.set(asset.id, quote.price)
      }
    }
    assert.ok(ups > 300 && downs > 300)
    assert.ok(trading.news.length <= 64)
    assert.ok(trading.news.filter(e => e.endsAt <= trading.lastTickAt).length <= 10)
    assert.equal(Object.keys(trading.history).length, 45)
    for (const asset of ASSETS) {
      const samples = trading.history[asset.id]!
      assert.ok(samples.length <= MARKET_MAX_SAMPLES && samples.length > 100)
      assert.ok(samples.every(e => e.at > trading.lastTickAt - MARKET_HISTORY_MS))
      assert.ok(samples.every(e => e.price >= asset.minPrice && e.price <= asset.maxPrice))
      assert.ok(samples.every((e, i) => i === 0 || e.at > samples[i - 1]!.at))
    }
    assert.deepEqual(restoreTradingState(JSON.parse(JSON.stringify(trading)), trading.lastTickAt), trading)
  }
})

test('aucun gain gratuit pour un portefeuille vide pendant six heures', () => {
  let state = createCapitalState(undefined, START)
  state.trading.seed = 891
  for (let tick = 0; tick < 6 * HOUR / MARKET_TICK_MS; tick++)
    state = { ...state, trading: advanceMarketTick(state.trading, false) }
  assert.equal(dividendCentsForSecond(state.trading), 0)
  assert.equal(state.game.balance, 0)
  assert.equal(state.game.lifetimeEarned, 0)
  assert.equal(getPortfolio(state).netWorth, 0)
})

test('achat puis revente immédiate : les frais interdisent un profit automatique', () => {
  const capital = createCapitalState({ balance: 100_000, lifetimeEarned: 100_000, purchasedUpgrades: 0 }, START)
  for (const [id, quantity] of [['nvideo', 1], ['bitcoin', .01], ['pepe', 1_000_000]] as const) {
    const bought = buyAsset(capital, id, quantity)
    assert.ok(bought.ok, id)
    if (!bought.ok) continue
    const sold = sellAsset(bought.state, id, quantity)
    assert.ok(sold.ok, id)
    if (!sold.ok) continue
    assert.ok(sold.state.game.balance < capital.game.balance, id)
    assert.equal(sold.state.game.lifetimeEarned, capital.game.lifetimeEarned)
    assert.equal(sold.state.trading.positions[id], undefined)
    assert.ok(sold.state.trading.realizedNetProfit < 0)
  }
})

test('MAX des 45 actifs : quantité, frais, offre et solde validés par le moteur', () => {
  const capital = createCapitalState({ balance: 1_000_000, lifetimeEarned: 1_000_000, purchasedUpgrades: 0 }, START)
  capital.trading.quotes = createInitialQuotes(START)
  for (const asset of ASSETS) {
    const max = getMaximumBuyQuantity(capital, asset.id)
    assert.equal(getQuickQuantity(capital, asset.id, 'buy', 1), max)
    assert.ok(max >= 0 && max <= asset.totalSupply, asset.id)
    if (max <= 0) continue
    const result = buyAsset(capital, asset.id, max)
    assert.ok(result.ok, asset.id + ': MAX should be executable')
    if (!result.ok) continue
    assert.ok(result.state.game.balance >= 0)
    assert.ok(result.state.trading.positions[asset.id]!.quantity <= asset.totalSupply)
    assert.equal(getQuickQuantity(result.state, asset.id, 'sell', 1), result.state.trading.positions[asset.id]!.quantity)
  }
})

test('45 séries complètes : sauvegarde locale inférieure à 4 MiB', () => {
  let state = createCapitalState(undefined, START)
  state.trading.quotes = createInitialQuotes(START)
  const history = Object.fromEntries(ASSETS.map(asset => [
    asset.id,
    Array.from({ length: MARKET_MAX_SAMPLES }, (_, i) => ({
      at: START + i * MARKET_TICK_MS,
      price: asset.referencePrice * (1 + .06 * Math.sin(i / 19)),
      ...(asset.kind === 'stock' ? { dividendYield: asset.initialDividendYield! + .00001 * Math.sin(i / 29) } : {}),
    })),
  ]))
  state = { ...state, trading: { ...state.trading, history } }
  const json = JSON.stringify(state)
  assert.ok(Buffer.byteLength(json, 'utf8') < 4 * 1024 * 1024)
  assert.deepEqual(restoreCapitalState(JSON.parse(json), START + HOUR).trading.history, history)
})

test('historique v4 invalide ou trop long : restauration sûre', () => {
  const original = createCapitalState(undefined, START)
  const corrupt = structuredClone(original)
  corrupt.trading.history.nvideo = [{ at: START, price: 100, dividendYield: .99 }]
  assert.deepEqual(restoreCapitalState(corrupt, START).trading.history, {})
  const oversized = structuredClone(original)
  oversized.trading.history.nvideo = Array.from({ length: MARKET_MAX_SAMPLES + 1 }, (_, i) =>
    ({ at: START + i * MARKET_TICK_MS, price: 100 }))
  assert.deepEqual(restoreCapitalState(oversized, START).trading.history, {})
})

test('absence de 30 jours : batches bornés, sauvegarde et intérêts sans double crédit', () => {
  const state = createCapitalState({ balance: 2000, lifetimeEarned: 2000, purchasedUpgrades: 1 }, START)
  state.trading.seed = 91
  const owned = buyAsset(state, 'nvideo', 2)
  assert.ok(owned.ok)
  if (!owned.ok) return
  const now = START + 30 * DAY
  const first = catchUpCapital(owned.state, now)
  assert.equal(first.processedSeconds, MAX_CATCH_UP_SECONDS)
  assert.equal(first.pendingSeconds, 30 * 86400 - MAX_CATCH_UP_SECONDS)
  assert.ok(first.state.game.lifetimeEarned >= owned.state.game.lifetimeEarned)
  const restored = restoreCapitalState(JSON.parse(JSON.stringify(first.state)), now)
  const second = catchUpCapital(restored, now)
  assert.equal(second.processedSeconds, MAX_CATCH_UP_SECONDS)
  assert.equal(second.pendingSeconds, first.pendingSeconds - MAX_CATCH_UP_SECONDS)
  assert.ok(second.state.game.balance >= first.state.game.balance)
  assert.deepEqual(second.state.trading.positions, owned.state.trading.positions)
})
