import assert from 'node:assert/strict'
import test from 'node:test'
import { catchUpMarket, MAX_CATCH_UP_TICKS } from './clock.ts'
import { MARKET_HISTORY_MS, MARKET_MAX_SAMPLES, MARKET_TICK_MS, advanceMarketTick } from './market.ts'
import { createMarketRuntime } from './runtime.ts'
import { createInitialTradingState, restoreTradingState } from './state.ts'
import type { TradingState } from './types.ts'

const START = 1_800_000_000_000
const HOUR = 60 * 60_000
const DAY = 24 * HOUR

function fullReplay(initial: TradingState, ticks: number): TradingState {
  let state = initial
  for (let index = 0; index < ticks; index++) state = advanceMarketTick(state)
  return state
}

function slicedReplay(initial: TradingState, now: number): { state: TradingState; calls: number } {
  let state = initial
  let calls = 0
  while (true) {
    const result = catchUpMarket(state, now)
    assert.ok(result.processedTicks <= MAX_CATCH_UP_TICKS)
    state = result.state
    calls++
    if (result.pendingTicks === 0) break
    assert.ok(calls < 1_000, 'rattrapage borné mais terminable')
  }
  return { state, calls }
}

test('temps normal : aucun double tick lors de plusieurs appels ou rechargements', () => {
  const initial = createInitialTradingState(START, 10)
  const first = catchUpMarket(initial, START + MARKET_TICK_MS)
  assert.equal(first.processedTicks, 1)
  assert.equal(catchUpMarket(first.state, START + MARKET_TICK_MS).processedTicks, 0)
  assert.strictEqual(catchUpMarket(first.state, START + MARKET_TICK_MS).state, first.state)
  const roundTrip = restoreTradingState(JSON.parse(JSON.stringify(first.state)), START + MARKET_TICK_MS)
  assert.deepEqual(catchUpMarket(roundTrip, START + MARKET_TICK_MS), {
    state: roundTrip, processedTicks: 0, pendingTicks: 0,
  })
  assert.equal(catchUpMarket(first.state, START + MARKET_TICK_MS + 4_999).processedTicks, 0)
  assert.equal(catchUpMarket(first.state, START + MARKET_TICK_MS + 5_000).processedTicks, 1)
})

test('rattrapage d une heure : identique à la simulation séquentielle', () => {
  const initial = createInitialTradingState(START, 578)
  const now = START + HOUR
  const actual = slicedReplay(initial, now)
  const expected = fullReplay(initial, HOUR / MARKET_TICK_MS)
  assert.deepEqual(actual.state, expected)
  assert.ok(actual.calls > 1)
})

test('24 h hors ligne : cours, PRNG et historique final égaux au rejeu intégral', () => {
  const initial = createInitialTradingState(START, 42)
  const actual = slicedReplay(initial, START + DAY)
  const expected = fullReplay(initial, DAY / MARKET_TICK_MS)
  assert.equal(actual.state.lastTickAt, START + DAY)
  assert.deepEqual(actual.state.quotes, expected.quotes)
  assert.equal(actual.state.seed, expected.seed)
  assert.deepEqual(actual.state.history, expected.history)
  for (const series of Object.values(actual.state.history)) {
    assert.ok(series.length <= MARKET_MAX_SAMPLES)
    assert.ok(series.every((point) => point.at > START + DAY - MARKET_HISTORY_MS))
  }
})

test('très longue absence : aucune suppression de ticks, travail borné à chaque appel', () => {
  const initial = createInitialTradingState(START, 131)
  const month = START + 30 * DAY
  const result = catchUpMarket(initial, month)
  assert.equal(result.processedTicks, MAX_CATCH_UP_TICKS)
  assert.equal(result.pendingTicks, 30 * DAY / MARKET_TICK_MS - MAX_CATCH_UP_TICKS)
  assert.equal(result.state.lastTickAt, START + MAX_CATCH_UP_TICKS * MARKET_TICK_MS)
  const next = catchUpMarket(result.state, month)
  assert.equal(next.pendingTicks, result.pendingTicks - MAX_CATCH_UP_TICKS)
  assert.notEqual(next.state.seed, result.state.seed)
})

test('décalages et horloges invalides : jamais de marche arrière ni de tick infini', () => {
  const initial = createInitialTradingState(START, 13)
  for (const now of [START - DAY, -5, Number.POSITIVE_INFINITY, Number.NaN, Number.MAX_SAFE_INTEGER + 5]) {
    const result = catchUpMarket(initial, now)
    assert.equal(result.processedTicks, 0)
    assert.strictEqual(result.state, initial)
  }
  const small = catchUpMarket(initial, START + 2 * MARKET_TICK_MS, 0)
  assert.equal(small.pendingTicks, 2)
  assert.equal(small.processedTicks, 0)
})

test('sauvegarde au milieu du rattrapage : reprises successives sans divergence', () => {
  const initial = createInitialTradingState(START, 2026)
  const now = START + 3 * HOUR
  const half = catchUpMarket(initial, now)
  const persisted = restoreTradingState(JSON.parse(JSON.stringify(half.state)), now)
  assert.deepEqual(slicedReplay(persisted, now).state, slicedReplay(initial, now).state)
})

test('scheduler : un timer unique, pause et reprise après onglet masqué', () => {
  let current = START
  let state = createInitialTradingState(START, 48)
  let nextHandle = 0
  let saved = 0
  const scheduled = new Map<number, { fn: () => void; delay: number }>()
  const runtime = createMarketRuntime({
    getState: () => state,
    setState: (next) => { state = next },
    persist: () => { saved++ },
    now: () => current,
    schedule: (fn, delay) => {
      const handle = ++nextHandle
      scheduled.set(handle, { fn, delay })
      return handle
    },
    cancel: (handle) => { scheduled.delete(handle) },
  })
  runtime.start()
  runtime.start()
  assert.equal(scheduled.size, 1)
  current += 2 * MARKET_TICK_MS
  runtime.wake()
  assert.equal(scheduled.size, 1)
  assert.equal(state.lastTickAt, current)
  assert.equal(saved, 1)

  runtime.pause()
  runtime.pause()
  assert.equal(scheduled.size, 0)
  current += 10 * MARKET_TICK_MS
  runtime.resume()
  assert.equal(state.lastTickAt, current)
  assert.equal(scheduled.size, 1)
  assert.equal(saved, 2)

  runtime.stop()
  runtime.stop()
  assert.equal(scheduled.size, 0)
})

test('scheduler : longues absences découpées avec un délai pour respirer', () => {
  let now = START + 3 * HOUR
  let state = createInitialTradingState(START, 50)
  let scheduled: { fn: () => void; delay: number } | null = null
  let saves = 0
  const runtime = createMarketRuntime({
    getState: () => state,
    setState: (next) => { state = next },
    persist: () => { saves++ },
    now: () => now,
    schedule: (fn, delay) => {
      scheduled = { fn, delay }
      return 1
    },
    cancel: () => { scheduled = null },
  })
  runtime.start()
  assert.equal(state.lastTickAt, START + MAX_CATCH_UP_TICKS * MARKET_TICK_MS)
  assert.equal(scheduled?.delay, 16)
  for (let count = 0; count < 100 && state.lastTickAt < now; count++) {
    const next = scheduled
    assert.ok(next)
    next.fn()
  }
  assert.equal(state.lastTickAt, now)
  assert.ok(saves > 0)
  runtime.stop()
})
