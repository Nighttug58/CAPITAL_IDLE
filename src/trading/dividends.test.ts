import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState } from '../capital.ts'
import { getLevel } from '../game.ts'
import { catchUpCapital, MAX_CATCH_UP_SECONDS } from './clock.ts'
import { getAsset } from './catalog.ts'
import { advanceCapitalSecond, dividendCentsForSecond, GAME_YEAR_SECONDS } from './dividends.ts'
import { MARKET_TICK_MS, advanceMarketTick } from './market.ts'
import { buyAsset, sellAsset, getPortfolio } from './trades.ts'
import { advanceDividendYield, MIN_DIVIDEND_YIELD, MAX_DIVIDEND_YIELD, MAX_YIELD_STEP } from './yield.ts'
import type { CapitalState } from '../capital.ts'
import type { MarketNews } from './types.ts'

const START = 1_800_000_000_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

function funded(balance = 500_000): CapitalState {
  const capital = createCapitalState({ balance, lifetimeEarned: balance, purchasedUpgrades: 0 }, START)
  capital.trading.seed = 5310
  return capital
}

function stockOwned(state: CapitalState, id = 'nvideo', quantity = 1000): CapitalState {
  const result = buyAsset(state, id, quantity)
  assert.equal(result.ok, true, result.ok ? '' : result.error)
  return result.state
}

function replay(state: CapitalState, seconds: number): CapitalState {
  let current = state
  for (let i = 0; i < seconds; i++) current = advanceCapitalSecond(current)
  return current
}

function catchup(state: CapitalState, now: number): CapitalState {
  let current = state
  let previous = -1
  while (current.trading.dividendLastPaidAt < now) {
    const batch = catchUpCapital(current, now)
    assert.ok(batch.processedSeconds > 0 && batch.processedSeconds <= MAX_CATCH_UP_SECONDS)
    assert.ok(current.trading.dividendLastPaidAt > previous)
    previous = current.trading.dividendLastPaidAt
    current = batch.state
  }
  return current
}

function news(templateId: string, impact: number): MarketNews {
  return {
    id: 'news-simulated', templateId, impact,
    phase: 'active',
    startedAt: START - 120_000,
    endsAt: START + 1_200_000,
    affectedAssetIds: ['nvideo'],
  }
}

test('un dividende est décompté seconde après seconde, puis intégré aux niveaux', () => {
  const initial = stockOwned(funded())
  const value = dividendCentsForSecond(initial.trading)
  assert.ok(value > 1)
  const first = advanceCapitalSecond(initial)
  assert.equal(first.trading.dividendLastPaidAt, START + 1000)
  assert.equal(first.trading.lastTickAt, START, 'marché toujours à un tick de 5 s')
  assert.equal(Math.round((first.game.balance - initial.game.balance) * 100), Math.floor(value))
  assert.equal(first.game.lifetimeEarned - initial.game.lifetimeEarned, first.game.balance - initial.game.balance)
  const fifth = replay(initial, 5)
  assert.equal(fifth.trading.lastTickAt, START + MARKET_TICK_MS)
  assert.equal(fifth.trading.dividendLastPaidAt, START + MARKET_TICK_MS)
  assert.ok(fifth.game.balance > first.game.balance)
  assert.equal(getLevel(fifth.game.lifetimeEarned), getLevel(initial.game.lifetimeEarned))
  assert.ok(fifth.trading.dividendCarry >= 0 && fifth.trading.dividendCarry < 1)
})

test('fraction de centime préservée : paiement ultérieur sans arrondir à la hausse', () => {
  let initial = funded(100)
  // Une centaine de millièmes d'action suffit pour un crédit très lent.
  initial.trading.positions.nvideo = { quantity: 0.001, costBasis: 0.17 }
  let state = initial
  for (let i = 0; i < 100; i++) state = advanceCapitalSecond(state)
  assert.equal(state.game.balance, 100)
  assert.ok(state.trading.dividendCarry > 0 && state.trading.dividendCarry < 1)
  const saved = restoreCapitalState(JSON.parse(JSON.stringify(state)), START + 100_000)
  assert.deepEqual(saved, state)
  assert.strictEqual(catchUpCapital(saved, state.trading.dividendLastPaidAt).state, saved)
})

test('revenu fondé sur le prix de référence, pas sur le cours simulé', () => {
  const base = stockOwned(funded())
  const asset = getAsset('nvideo')!
  const low = { ...base, trading: { ...base.trading, quotes: {
    nvideo: { price: asset.minPrice, dividendYield: 0.12, momentum: 0, updatedAt: START },
  } } }
  const high = { ...base, trading: { ...base.trading, quotes: {
    nvideo: { price: asset.maxPrice, dividendYield: 0.12, momentum: 0, updatedAt: START },
  } } }
  assert.equal(dividendCentsForSecond(low.trading), dividendCentsForSecond(high.trading))
  assert.equal(dividendCentsForSecond(low.trading), 1000 * asset.referencePrice * 0.12 * 100 / GAME_YEAR_SECONDS)
})

test('20 actions seulement : aucun revenu pour Bitcoin, PEPE ou un portefeuille vide', () => {
  const empty = funded()
  assert.equal(dividendCentsForSecond(empty.trading), 0)
  assert.equal(replay(empty, 15).game.balance, empty.game.balance)
  const cryptocurrencies = funded()
  cryptocurrencies.trading.positions.bitcoin = { quantity: 1, costBasis: 20_000 }
  cryptocurrencies.trading.positions.pepe = { quantity: 1000000, costBasis: 20 }
  assert.equal(dividendCentsForSecond(cryptocurrencies.trading), 0)
  assert.equal(replay(cryptocurrencies, 10).game.balance, cryptocurrencies.game.balance)
})

test('taux annuels toujours bornés à 1–30 %, avec variations douces', () => {
  for (const target of [MIN_DIVIDEND_YIELD, MAX_DIVIDEND_YIELD]) {
    const stock = getAsset('nvideo')!
    const initial = { price: stock.referencePrice, momentum: 0, dividendYield: target, updatedAt: START, dividendMomentum: 0 }
    const up = advanceDividendYield(stock, initial, 1.25, () => 1)
    const down = advanceDividendYield(stock, initial, -1.25, () => 0)
    assert.ok(up.dividendYield! >= MIN_DIVIDEND_YIELD && up.dividendYield! <= MAX_DIVIDEND_YIELD)
    assert.ok(down.dividendYield! >= MIN_DIVIDEND_YIELD && down.dividendYield! <= MAX_DIVIDEND_YIELD)
    assert.ok(Math.abs(up.dividendYield! - target) <= MAX_YIELD_STEP)
    assert.ok(Math.abs(down.dividendYield! - target) <= MAX_YIELD_STEP)
  }
  const crypto = getAsset('bitcoin')!
  assert.deepEqual(advanceDividendYield(crypto, { price: 100, momentum: 0, dividendYield: null, updatedAt: START }, 1, () => 0.1), { dividendYield: null })
})

test('News favorables/défavorables infléchissent le dividende sur plusieurs minutes', () => {
  const initial = funded()
  const quiet = { ...initial, trading: { ...initial.trading, nextNewsAt: START + DAY } }
  const positive = { ...quiet, trading: { ...quiet.trading, news: [news('cash-surplus', 1)] } }
  const negative = { ...quiet, trading: { ...quiet.trading, news: [news('earnings-miss', -1)] } }
  let q=quiet.trading, p=positive.trading, n=negative.trading
  for (let i=0; i<100; i++) {
    q=advanceMarketTick(q);p=advanceMarketTick(p);n=advanceMarketTick(n)
    assert.ok(Math.abs(p.quotes.nvideo!.dividendYield! - (i ? positive.trading.quotes.nvideo?.dividendYield ?? getAsset('nvideo')!.initialDividendYield! : getAsset('nvideo')!.initialDividendYield!)) < 0.04)
  }
  assert.ok(p.quotes.nvideo!.dividendYield! > q.quotes.nvideo!.dividendYield!)
  assert.ok(q.quotes.nvideo!.dividendYield! > n.quotes.nvideo!.dividendYield!)
})

test('fin de News : le taux continue sans revenir immédiatement à sa valeur initiale', () => {
  let state = funded().trading
  state.nextNewsAt = START + DAY
  state.news = [news('cash-surplus', 1)]
  const asset = getAsset('nvideo')!
  for (let i=0;i<150;i++) state = advanceMarketTick(state)
  const before = state.quotes.nvideo!.dividendYield!
  assert.ok(before > asset.initialDividendYield!)
  while (state.lastTickAt < START + 1_200_000 + MARKET_TICK_MS) state=advanceMarketTick(state)
  const after = state.quotes.nvideo!.dividendYield!
  assert.ok(Math.abs(after - before) < 0.05)
  assert.ok(after > asset.initialDividendYield!)
})

test('vente et clic : le dividende utilise seulement les titres encore détenus', () => {
  let state = stockOwned(funded())
  state = replay(state, 10)
  const before = state.game.lifetimeEarned
  const sale = sellAsset(state, 'nvideo', 500)
  assert.equal(sale.ok,true)
  if (!sale.ok) return
  const nextYield = dividendCentsForSecond(sale.state.trading)
  assert.ok(nextYield > 0)
  assert.ok(nextYield < dividendCentsForSecond(state.trading))
  const second = advanceCapitalSecond(sale.state)
  assert.ok(second.game.lifetimeEarned >= before)
  const all = sellAsset(second, 'nvideo', 500)
  assert.equal(all.ok,true)
  if (!all.ok) return
  assert.equal(dividendCentsForSecond(all.state.trading),0)
  const final = replay(all.state,5)
  assert.equal(final.game.lifetimeEarned, all.state.game.lifetimeEarned)
})

test('24h sans application : solde, niveau, courbes et News identiques en rejeu complet ou découpé', () => {
  const initial = stockOwned(funded(1_000_000), 'nvideo', 1000)
  const direct = replay(initial, GAME_YEAR_SECONDS)
  const resumed = catchup(initial, START + DAY)
  assert.deepEqual(resumed, direct)
  assert.ok(resumed.game.balance > initial.game.balance)
  assert.ok(resumed.game.lifetimeEarned > initial.game.lifetimeEarned)
  assert.ok(resumed.trading.dividendCarry >= 0 && resumed.trading.dividendCarry < 1)
  assert.equal(resumed.trading.dividendPendingCents,0)
})

test('reload en milieu de rattrapage : aucun dividende ou News compté deux fois', () => {
  const initial = stockOwned(funded(1_000_000))
  const at = START + 2 * HOUR
  const first = catchUpCapital(initial, at)
  const checkpoint = restoreCapitalState(JSON.parse(JSON.stringify(first.state)), at)
  const resumed = catchup(checkpoint, at)
  const expected = catchup(initial, at)
  assert.deepEqual(resumed, expected)
  assert.strictEqual(catchUpCapital(resumed, at).state, resumed)
  assert.equal(catchUpCapital(resumed, at).processedSeconds, 0)
})

test('horloge invalidée, rattrapage par tranches et absence de temps négatif', () => {
  const initial=funded()
  const invalid = [START-1,Number.NaN,-1,Number.POSITIVE_INFINITY]
  for(const timestamp of invalid) assert.strictEqual(catchUpCapital(initial,timestamp).state,initial)
  const at = START + 4 * HOUR
  const first=catchUpCapital(initial,at)
  assert.equal(first.processedSeconds,MAX_CATCH_UP_SECONDS)
  assert.equal(first.pendingSeconds,4*3600-MAX_CATCH_UP_SECONDS)
  assert.equal(catchUpCapital(initial,at,0).processedSeconds,0)
  const follow=catchUpCapital(first.state,at)
  assert.equal(follow.pendingSeconds,first.pendingSeconds-MAX_CATCH_UP_SECONDS)
})

test('migrations v4 sans horloge dividend : aucun revenu rétroactif avant la mise à niveau', () => {
  const initial=funded()
  const old = JSON.parse(JSON.stringify(initial)) as Record<string, any>
  delete old.trading.dividendLastPaidAt
  delete old.trading.dividendPendingCents
  const restored=restoreCapitalState(old,START + HOUR)
  assert.equal(restored.trading.dividendLastPaidAt, restored.trading.lastTickAt)
  assert.equal(restored.trading.dividendPendingCents,0)
  const first=advanceCapitalSecond(restored)
  assert.equal(first.trading.dividendLastPaidAt,START+1000)
})

test('les dividendes peuvent créditer le niveau 2 indépendamment du cours', () => {
  const initial=createCapitalState({balance:35,lifetimeEarned:34,purchasedUpgrades:0},START)
  // Ce cas ne doit pas être sauvegardé tel quel, il illustre le passage
  // du seuil de 35 $ grâce aux versements, sans commande d'achat.
  initial.trading.positions.nvideo={quantity:1000,costBasis:100}
  assert.equal(getLevel(initial.game.lifetimeEarned),1)
  const first=replay(initial,30)
  assert.ok(first.game.lifetimeEarned>=35)
  assert.equal(getLevel(first.game.lifetimeEarned),2)
})
