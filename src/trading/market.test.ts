import assert from 'node:assert/strict'
import test from 'node:test'
import { ASSETS, createInitialQuotes } from './catalog.ts'
import {
  advanceMarketTick,
  getSparklineSamples,
  MARKET_HISTORY_MS,
  MARKET_MAX_SAMPLES,
  MARKET_TICK_MS,
} from './market.ts'
import { createInitialTradingState, restoreTradingState } from './state.ts'
import type { PriceSample, TradingState } from './types.ts'

const START = 1_800_000_000_000

function simulate(ticks: number, seed = 42): TradingState {
  let state = createInitialTradingState(START, seed)
  for (let i = 0; i < ticks; i++) state = advanceMarketTick(state)
  return state
}

test('tick de 5 s : 45 cotations initialisées, sans modifier état source ni portefeuille', () => {
  const original = createInitialTradingState(START, 42)
  original.positions.bitcoin = { quantity: 0.5, costBasis: 8_000 }
  const after = advanceMarketTick(original)
  assert.equal(after.lastTickAt, START + MARKET_TICK_MS)
  assert.equal(original.lastTickAt, START)
  assert.deepEqual(original.quotes, {})
  assert.equal(Object.keys(after.quotes).length, ASSETS.length)
  assert.equal(Object.keys(after.history).length, ASSETS.length)
  assert.equal(after.positions, original.positions)
  assert.notEqual(after.seed, original.seed)
  for (const a of ASSETS) {
    assert.equal(after.quotes[a.id]!.updatedAt, after.lastTickAt)
    assert.equal(after.history[a.id]!.at(-1)!.at, after.lastTickAt)
    assert.ok(after.history[a.id]!.length <= 2)
  }
})

test('une même graine et le même état produisent exactement les mêmes cours', () => {
  assert.deepEqual(simulate(65, 55), simulate(65, 55))
  assert.notDeepEqual(simulate(65, 55).quotes, simulate(65, 56).quotes)
})

test('market ticks are independent of the player\'s holdings', () => {
  const empty = createInitialTradingState(START, 678)
  const owned = createInitialTradingState(START, 678)
  owned.positions.nvideo = { quantity: 10_000_000, costBasis: 100_000 }
  owned.positions.bitcoin = { quantity: 100_000, costBasis: 100_000 }
  const first = advanceMarketTick(empty)
  const second = advanceMarketTick(owned)
  assert.deepEqual(second.quotes, first.quotes)
  assert.deepEqual(second.history, first.history)
  assert.equal(second.seed, first.seed)
})

test('le rechargement JSON en milieu de tendance reprend bit pour bit la même trajectoire', () => {
  let before = simulate(40, 12936)
  let resumed = restoreTradingState(JSON.parse(JSON.stringify(before)), START + 40 * MARKET_TICK_MS)
  for (let i = 0; i < 70; i++) {
    before = advanceMarketTick(before)
    resumed = advanceMarketTick(resumed)
  }
  assert.deepEqual(resumed, before)
})

test('les 45 actifs restent cotés positivement et les rendements actions entre 1 et 30 %', () => {
  const state = simulate(950, 981)
  for (const asset of ASSETS) {
    const quote = state.quotes[asset.id]!
    assert.ok(Number.isFinite(quote.price))
    assert.ok(quote.price > 0, `${asset.id}: non-positive quote`)
    if (asset.kind === 'stock') {
      assert.ok(quote.dividendYield !== null && quote.dividendYield >= 0.01 && quote.dividendYield <= 0.30)
    } else assert.equal(quote.dividendYield, null)
    assert.ok(['steady', 'bull', 'bear', 'frenzy'].includes(quote.regime!))
    assert.ok((quote.regimeTicksLeft ?? -1) >= 0)
    assert.ok((quote.shockTicksLeft ?? -1) >= 0)
  }
})

test('cours libres pour les trois catégories : le marché traverse les anciens planchers et plafonds', () => {
  for (const id of ['nvideo','bitcoin','turbo']) {
    const asset=ASSETS.find(a=>a.id===id)!
    for (const side of ['min','max'] as const) {
      const legacyEdge=asset.referencePrice*(side==='min'?(asset.kind==='stock'?.1:.05):(asset.kind==='stock'?6:5))
      const direction=side==='min'?-1:1
      const trading=createInitialTradingState(START,23)
      trading.quotes=createInitialQuotes(START)
      trading.quotes[id]={
        ...trading.quotes[id]!,price:legacyEdge,momentum:direction*.08,
        regime:side==='min'?'bear':'bull',regimeTicksLeft:20,
        shockDrift:direction*.2,shockTicksLeft:5,
      }
      const first=advanceMarketTick(trading)
      const quote=first.quotes[id]!
      assert.ok(direction<0?quote.price<legacyEdge:quote.price>legacyEdge,id+' '+side)
      assert.ok(Number.isFinite(quote.price) && quote.price>0)
      assert.equal('boundary' in quote,false)
      const second=advanceMarketTick(first)
      assert.notEqual(second.quotes[id]!.price,quote.price,'no fixed hold after crossing')
    }
  }
})

test('historique glissant : au plus 720 points par actif et jamais plus d’une heure', () => {
  const state = simulate(MARKET_MAX_SAMPLES + 50, 123)
  for (const asset of ASSETS) {
    const samples = state.history[asset.id]!
    assert.equal(samples.length, MARKET_MAX_SAMPLES)
    assert.ok(samples[0]!.at > state.lastTickAt - MARKET_HISTORY_MS)
    assert.equal(samples[samples.length - 1]!.at, state.lastTickAt)
    assert.ok(samples.every((p, i) => i === 0 || p.at - samples[i - 1]!.at === MARKET_TICK_MS))
  }
})

test('mini-graphe : 40 points maximum, extrêmes conservés dans leur ordre', () => {
  const data: PriceSample[] = Array.from({ length: 720 }, (_, i) => ({
    at: START + i * MARKET_TICK_MS,
    price: i === 200 ? 500 : i === 400 ? 0.02 : 100,
  }))
  const sparkline = getSparklineSamples(data, 40)
  assert.ok(sparkline.length <= 40)
  assert.equal(sparkline[0], data[0])
  assert.equal(sparkline.at(-1), data.at(-1))
  assert.ok(sparkline.includes(data[200]!))
  assert.ok(sparkline.includes(data[400]!))
  assert.ok(sparkline.every((p, i) => i === 0 || p.at > sparkline[i - 1]!.at))
  assert.equal(getSparklineSamples(data, 2).length, 2)
  assert.equal(getSparklineSamples([], 40).length, 0)
})

test('comportement chaotique différencié, présence de chocs sur 45 actifs', () => {
  let state = createInitialTradingState(START, 1345)
  let shocks = 0
  const changes: Record<string, number> = { stock: 0, crypto: 0, memecoin: 0 }
  for (let i = 0; i < 950; i++) {
    const last = state.quotes
    state = advanceMarketTick(state)
    for (const asset of ASSETS) {
      const quote = state.quotes[asset.id]!
      if ((quote.shockTicksLeft ?? 0) > 0 && (last[asset.id]?.shockTicksLeft ?? 0) === 0) shocks++
      if (last[asset.id]) {
        changes[asset.kind] += Math.abs(Math.log(quote.price / last[asset.id]!.price))
      }
    }
  }
  assert.ok(shocks > 0, 'le marché doit produire des chocs spéculatifs')
  assert.ok(changes.memecoin! / 10 > changes.crypto! / 15)
  assert.ok(changes.crypto! / 15 > changes.stock! / 20)
})

test('simulation de masse 45 actifs sans états incohérents ou historiques excessifs', () => {
  const start = performance.now()
  const state = simulate(1_200, 747)
  assert.equal(Object.keys(state.quotes).length, 45)
  assert.ok(Object.values(state.history).every((history) => history.length <= MARKET_MAX_SAMPLES))
  assert.ok(performance.now() - start < 12_000, '1200 ticks doivent rester raisonnables sur CI')
})


test('gravity corrects extreme quotes on all three markets without ownership or a price reset', () => {
  const ids = ['nvideo', 'bitcoin', 'popcat']
  for (const direction of [-1, 1]) {
    let state = createInitialTradingState(START, 4242)
    state.quotes = createInitialQuotes(START)
    for (const id of ids) {
      const asset = ASSETS.find(a => a.id === id)!
      state.quotes[id] = { ...state.quotes[id]!, price: asset.referencePrice * Math.exp(direction * 30) }
    }
    const original = structuredClone(state)
    for (let i = 0; i < 240; i++) state = advanceMarketTick(state, false)
    assert.deepEqual(state.positions, original.positions)
    for (const id of ids) {
      const asset = ASSETS.find(a => a.id === id)!
      const ratio = state.quotes[id]!.price / asset.referencePrice
      assert.ok(Number.isFinite(ratio) && ratio > 0)
      assert.ok(Math.abs(Math.log(ratio)) < 10, id + ': extreme quote should correct')
      assert.ok(Math.abs(state.quotes[id]!.fundamentalLog!) <= 1.6)
    }
    assert.deepEqual(restoreTradingState(JSON.parse(JSON.stringify(state)), state.lastTickAt), state)
  }
})


test('accelerated quote ticks share unchanged chart history and preserve prior snapshots',()=>{
  const first=advanceMarketTick(createInitialTradingState(START,42))
  const original=JSON.stringify(first.history)
  let state=first
  for(let i=1;i<5;i++){
    const next=advanceMarketTick(state,true,{realAt:first.lastTickAt+i*1000,speed:5})
    assert.equal(next.history,first.history)
    assert.notEqual(next.quotes,state.quotes)
    assert.equal(next.quotes.nvideo!.updatedAt,first.lastTickAt+i*1000)
    state=next
  }
  const sampled=advanceMarketTick(state,true,{realAt:first.lastTickAt+5000,speed:5})
  assert.notEqual(sampled.history,first.history)
  assert.equal(sampled.history.nvideo!.at(-1)!.at,first.lastTickAt+5000)
  assert.equal(JSON.stringify(first.history),original)
})
