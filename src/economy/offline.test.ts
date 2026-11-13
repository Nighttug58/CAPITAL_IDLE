import assert from 'node:assert/strict'
import test from 'node:test'
import { performance } from 'node:perf_hooks'
import { createCapitalState, restoreCapitalState } from '../capital.ts'
import { createMarketRuntime } from '../trading/runtime.ts'
import { catchUpCapital, MAX_CATCH_UP_SECONDS } from '../trading/clock.ts'
import { advanceCapitalSecond } from '../trading/dividends.ts'
import { buyEnterprise, upgradeEnterprise } from './enterprises.ts'
import { accrueProfitTax } from './fiscal.ts'
import { advanceFiscalEconomy, payFiscalBalanceNow } from './clock.ts'
import { FISCAL_PERIOD_MS } from './state.ts'
import type { CapitalState } from '../capital.ts'

const T0 = 1_800_000_000_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

function initial(owned = true): CapitalState {
  const state = createCapitalState({
    balance: 1_000_000, lifetimeEarned: 1_000_000, purchasedUpgrades: 1,
  }, T0)
  if (!owned) return state
  const bought = buyEnterprise(state, 'kiosque', T0)
  assert.ok(bought.ok)
  return bought.state
}

function bySteps(state: CapitalState, until: number, stepMs: number): CapitalState {
  let current = state
  for (let at = T0 + stepMs; at < until; at += stepMs) {
    current = advanceFiscalEconomy(current, at)
  }
  return advanceFiscalEconomy(current, until)
}

function assertSameEconomy(actual: CapitalState, expected: CapitalState): void {
  assert.deepEqual(actual.game, expected.game)
  assert.deepEqual(actual.fiscal, expected.fiscal)
  assert.deepEqual(actual.enterprises, expected.enterprises)
  assert.deepEqual(actual.stats, expected.stats)
}

test('1h, 72h pile et 73h : mêmes gains et taxes que les versements horaires', () => {
  for (const duration of [HOUR, FISCAL_PERIOD_MS - 1, FISCAL_PERIOD_MS, FISCAL_PERIOD_MS + HOUR]) {
    const state = initial()
    const actual = advanceFiscalEconomy(state, T0 + duration)
    const expected = bySteps(state, T0 + duration, HOUR)
    assertSameEconomy(actual, expected)
    assert.equal(actual.fiscal.periodStartedAt, duration >= FISCAL_PERIOD_MS ? T0 + FISCAL_PERIOD_MS : T0)
    const rerun = advanceFiscalEconomy(actual, T0 + duration)
    assert.strictEqual(rerun, actual, 'même horodatage ne crédite rien de plus')
  }
})

test('10 jours, 90 jours, 365 jours : équivalent exact au rythme quotidien', () => {
  for (const days of [10, 90, 365]) {
    const start = initial()
    const at = T0 + days * DAY
    const oneCall = advanceFiscalEconomy(start, at)
    const daily = bySteps(start, at, DAY)
    assertSameEconomy(oneCall, daily)
    assert.equal(oneCall.fiscal.periodStartedAt, T0 + Math.floor(days / 3) * FISCAL_PERIOD_MS)
    assert.equal(oneCall.enterprises.lastAccruedAt, at)
    assert.ok(oneCall.fiscal.taxesPaidCents > 0)
    if (days % 3 > 0) assert.ok(oneCall.fiscal.taxesDueCents > 0)
  }
})

test('4 ans, 1000 ans : aucune boucle par seconde ou par période (temps borné)', () => {
  const state = initial()
  for (const years of [4, 1000]) {
    const now = T0 + years * 365 * DAY
    const started = performance.now()
    const next = advanceFiscalEconomy(state, now)
    const elapsed = performance.now() - started
    assert.ok(elapsed < 1500, `Rattrapage de ${years} ans trop lent : ${elapsed.toFixed(1)} ms`)
    assert.equal(next.enterprises.lastAccruedAt, now)
    assert.equal(next.fiscal.periodStartedAt, T0 + Math.floor((now - T0) / FISCAL_PERIOD_MS) * FISCAL_PERIOD_MS)
    assert.ok(next.game.balance > state.game.balance)
    assert.ok(next.fiscal.taxesPaidCents > 0)
    assert.ok(next.fiscal.taxesDueCents >= 0)
    // Les nouveaux montants doivent survivre à une restauration JSON.
    const restored = restoreCapitalState(JSON.parse(JSON.stringify(next)), now)
    assert.deepEqual(restored.game, next.game)
    assert.deepEqual(restored.stats, next.stats)
    assert.deepEqual(restored.fiscal, next.fiscal)
    assert.deepEqual(restored.enterprises, next.enterprises)
  }
})

test('taxes de ventes déjà dues + entreprise sur 10 jours : mêmes montants et échéances', () => {
  const begin = initial()
  const withTradingDebt = accrueProfitTax(begin, 'stocks', 10_000)
  assert.ok(withTradingDebt)
  const state = accrueProfitTax(withTradingDebt, 'crypto', 60_000)
  assert.ok(state)
  const at = T0 + 10 * DAY
  const batched = advanceFiscalEconomy(state, at)
  const daily = bySteps(state, at, DAY)
  assertSameEconomy(batched, daily)
  assert.equal(batched.fiscal.paidBySourceCents.stocks, 1500)
  assert.equal(batched.fiscal.paidBySourceCents.crypto, 9000)
  assert.equal(batched.fiscal.dueBySourceCents.stocks, 0)
  assert.equal(batched.fiscal.dueBySourceCents.crypto, 0)
  assert.ok(batched.fiscal.dueBySourceCents.enterprises > 0)
})

test('vente juste avant et juste après échéance : paiement uniquement de la bonne période', () => {
  const start = initial(false)
  const before = advanceFiscalEconomy(start, T0 + FISCAL_PERIOD_MS - 1)
  const tradingDue = accrueProfitTax(before, 'stocks', 10_000)
  assert.ok(tradingDue)
  assert.equal(tradingDue.fiscal.taxesDueCents, 1500)
  const after = advanceFiscalEconomy(tradingDue, T0 + FISCAL_PERIOD_MS)
  assert.equal(after.fiscal.taxesDueCents, 0)
  assert.equal(after.fiscal.taxesPaidCents, 1500)
  assert.equal(after.fiscal.periodStartedAt, T0 + FISCAL_PERIOD_MS)

  const nextTrade = accrueProfitTax(after, 'memecoins', 20_000)
  assert.ok(nextTrade)
  assert.equal(nextTrade.fiscal.taxesDueCents, 3000)
  assert.equal(nextTrade.fiscal.taxesPaidCents, 1500)
  const secondDeadline = advanceFiscalEconomy(nextTrade, T0 + 2 * FISCAL_PERIOD_MS)
  assert.equal(secondDeadline.fiscal.taxesPaidCents, 4500)
  assert.equal(secondDeadline.fiscal.paidBySourceCents.stocks, 1500)
  assert.equal(secondDeadline.fiscal.paidBySourceCents.memecoins, 3000)
})

test('paiement anticipé : date d échéance recalculée même après une absence', () => {
  const start = initial()
  const at = T0 + 36 * HOUR
  const early = payFiscalBalanceNow(start, at)
  assert.ok(early.ok)
  assert.ok(early.amountCents > 0)
  assert.equal(early.state.fiscal.periodStartedAt, at)
  const next = advanceFiscalEconomy(early.state, at + FISCAL_PERIOD_MS - 1)
  assert.equal(next.fiscal.periodStartedAt, at)
  const atDeadline = advanceFiscalEconomy(next, at + FISCAL_PERIOD_MS)
  assert.equal(atDeadline.fiscal.periodStartedAt, at + FISCAL_PERIOD_MS)
  assert.equal(atDeadline.fiscal.taxesDueCents, 0)
  assert.equal(atDeadline.game.lifetimeEarned > start.game.lifetimeEarned, true)
  assert.equal(early.state.fiscal.taxesPaidCents > 0, true)
  const reload = restoreCapitalState(JSON.parse(JSON.stringify(early.state)), at)
  assertSameEconomy(advanceFiscalEconomy(reload, at + FISCAL_PERIOD_MS), advanceFiscalEconomy(early.state, at + FISCAL_PERIOD_MS))
})

test('achat/amélioration entre deux échéances : ancien rendement puis nouveau', () => {
  const begin = initial()
  const hour = T0 + HOUR
  const before = advanceFiscalEconomy(begin, hour)
  const upgraded = upgradeEnterprise(before, 'kiosque', hour)
  assert.ok(upgraded.ok)
  const now = T0 + 90 * DAY
  const batched = advanceFiscalEconomy(upgraded.state, now)
  const daily = bySteps(upgraded.state, now, DAY)
  assertSameEconomy(batched, daily)
  assert.equal(batched.enterprises.owned.kiosque?.level, 2)
  assert.ok(batched.game.lifetimeEarned > begin.game.lifetimeEarned)
})

test('sans entreprise : accélération de centaines d années même avec dette fiscale existante', () => {
  const base = initial(false)
  const start = accrueProfitTax(base, 'stocks', 10_000)
  assert.ok(start)
  const at = T0 + 1000 * 365 * DAY
  const begun = performance.now()
  const result = advanceFiscalEconomy(start, at)
  const elapsed = performance.now() - begun
  assert.ok(elapsed < 1500, `Fiscalité seule trop lente : ${elapsed.toFixed(1)} ms`)
  assert.equal(result.fiscal.taxesPaidCents, 1500)
  assert.equal(result.fiscal.taxesDueCents, 0)
  assert.equal(result.game.balance, base.game.balance - 15)
  assert.equal(result.fiscal.periodStartedAt, T0 + Math.floor((at - T0) / FISCAL_PERIOD_MS) * FISCAL_PERIOD_MS)
})

test('reprise, rechargement et horloge reculée : aucun crédit ni impôt en double', () => {
  const initialState = initial()
  const at = T0 + 90 * DAY
  const paid = advanceFiscalEconomy(initialState, at)
  const reloaded = restoreCapitalState(JSON.parse(JSON.stringify(paid)), at)
  assert.deepEqual(reloaded, paid)
  assert.strictEqual(advanceFiscalEconomy(reloaded, at), reloaded)
  assert.strictEqual(advanceFiscalEconomy(reloaded, at - 1), reloaded)
  assert.strictEqual(advanceFiscalEconomy(reloaded, Number.NaN), reloaded)
  assert.strictEqual(advanceFiscalEconomy(reloaded, Number.POSITIVE_INFINITY), reloaded)
  assert.strictEqual(advanceFiscalEconomy(reloaded, -1), reloaded)
  const resumed = advanceFiscalEconomy(reloaded, at + HOUR)
  const direct = advanceFiscalEconomy(initialState, at + HOUR)
  assertSameEconomy(resumed, direct)
})

test('ancien état ayant déjà crédité au-delà de l échéance : ne jamais recréditer', () => {
  const state = initial()
  const prefunded = advanceFiscalEconomy(state, T0 + 90 * HOUR)
  const corruptedClock = {
    ...prefunded,
    fiscal: { ...prefunded.fiscal, periodStartedAt: T0 },
  }
  const after = advanceFiscalEconomy(corruptedClock, T0 + 91 * HOUR)
  assert.equal(after.enterprises.lastAccruedAt, T0 + 91 * HOUR)
  assert.equal(after.fiscal.periodStartedAt, T0 + FISCAL_PERIOD_MS)
  const expectedAdditional = advanceFiscalEconomy(prefunded, T0 + 91 * HOUR)
  assert.equal(after.game.lifetimeEarned, expectedAdditional.game.lifetimeEarned)
})

test('runtime + replay Trading : un seul timer et aucune seconde de revenu en double', () => {
  let now = T0 + 10 * DAY
  let state = initial()
  let scheduled: { callback: () => void; delay: number } | null = null
  let writes = 0
  const runtime = createMarketRuntime({
    getState: () => state,
    setState: (next) => { state = next },
    persist: () => { writes++ },
    now: () => now,
    schedule: (callback, delay) => {
      scheduled = { callback, delay }
      return 1
    },
    cancel: () => { scheduled = null },
  })

  runtime.start()
  const once = state
  assert.equal(once.enterprises.lastAccruedAt, now)
  assert.equal(once.fiscal.periodStartedAt, T0 + 9 * DAY)
  assert.ok(once.fiscal.taxesPaidCents > 0)
  assert.equal(once.trading.dividendLastPaidAt, T0 + MAX_CATCH_UP_SECONDS * 1000)
  assert.ok(writes > 0, 'le premier batch est sauvegardé une fois')
  runtime.wake()
  assert.equal(state.game.balance, once.game.balance)
  assert.equal(state.fiscal.taxesPaidCents, once.fiscal.taxesPaidCents)
  assert.equal(state.enterprises.lastAccruedAt, once.enterprises.lastAccruedAt)
  const saved = restoreCapitalState(JSON.parse(JSON.stringify(state)), now)
  assert.deepEqual(saved.fiscal, state.fiscal)
  assert.equal(scheduled?.delay, 16)
  runtime.pause()
  assert.ok(writes > 0)
  now += HOUR
  runtime.resume()
  assert.equal(state.enterprises.lastAccruedAt, now)
  assert.equal(state.fiscal.periodStartedAt, T0 + 9 * DAY)
  runtime.stop()
})

test('replay direct Trading pendant 1h : même résultat comptable que rattrapage agrégé', () => {
  const state = initial()
  const elapsed = 60 * HOUR
  const batched = advanceFiscalEconomy(state, T0 + elapsed)
  let streamed = state
  let index = 0
  for (index = 0; index < 15 && streamed.trading.dividendLastPaidAt < T0 + elapsed; index++) {
    const progress = catchUpCapital(streamed, T0 + elapsed)
    assert.ok(progress.processedSeconds > 0)
    streamed = progress.state
  }
  // Le replay est borné, mais toutes ses secondes doivent utiliser le même
  // compteur fiscal ; on ne simule pas 60 heures de marché dans ce test.
  const projected = advanceFiscalEconomy(streamed, T0 + elapsed)
  assertSameEconomy(projected, batched)
  assert.ok(streamed.trading.dividendLastPaidAt > state.trading.dividendLastPaidAt)
  assert.equal(advanceCapitalSecond(batched).fiscal.taxesDueCents, batched.fiscal.taxesDueCents)
})
