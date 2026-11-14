import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState } from '../capital.ts'
import { advanceCapitalSecond } from '../trading/dividends.ts'
import { catchUpCapital } from '../trading/clock.ts'
import { getLevel, getLevelStartThreshold } from '../game.ts'
import {
  ENTERPRISES, getEnterpriseIncomeMicrosPerSecond,
  getEnterpriseUpgradeCostCents,
} from './catalog.ts'
import {
  advanceEnterpriseIncome, buyEnterprise, upgradeEnterprise,
  getTotalEnterpriseIncomeMicrosPerSecond,
} from './enterprises.ts'

const START = 1_800_000_000_000
function funded(amount = 10_000_000) {
  return createCapitalState({ balance: amount, lifetimeEarned: amount, purchasedUpgrades: 0 }, START)
}
function purchased(id = 'kiosque', amount = 10_000_000) {
  const result = buyEnterprise(funded(amount), id, START)
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error(result.error)
  return result.state
}

test('achat : niveau et fonds vérifiés, achat unique, cash commun débité et aucun XP d achat', () => {
  const locked = createCapitalState({ balance: 1_000, lifetimeEarned: 0, purchasedUpgrades: 0 }, START)
  assert.deepEqual(buyEnterprise(locked, 'kiosque', START), { ok: false, state: locked, error: 'level-locked' })
  const poor = createCapitalState({ balance: 1, lifetimeEarned: getLevelStartThreshold(3), purchasedUpgrades: 0 }, START)
  assert.equal(getLevel(poor.prestige.experienceCents / 100) >= 3, true)
  assert.deepEqual(buyEnterprise(poor, 'kiosque', START), { ok: false, state: poor, error: 'insufficient-funds' })
  const initial = funded()
  const receipt = buyEnterprise(initial, 'kiosque', START)
  assert.ok(receipt.ok)
  if (!receipt.ok) return
  assert.equal(receipt.receipt.level, 1)
  assert.equal(receipt.receipt.costCents, ENTERPRISES[0]!.purchaseCostCents)
  assert.equal(receipt.state.game.balance, initial.game.balance - 75_000)
  assert.equal(receipt.state.game.lifetimeEarned, initial.game.lifetimeEarned)
  assert.deepEqual(receipt.state.enterprises.owned.kiosque, { level: 1, investedCents: 7_500_000 })
  assert.equal(Object.keys(receipt.state.enterprises.owned).length, 1)
  assert.deepEqual(buyEnterprise(receipt.state, 'kiosque', START), { ok: false, state: receipt.state, error: 'already-owned' })
  assert.deepEqual(buyEnterprise(initial, 'unknown-business', START), { ok: false, state: initial, error: 'unknown-enterprise' })
  assert.deepEqual(upgradeEnterprise(initial, 'kiosque', START), { ok: false, state: initial, error: 'not-owned' })
})

test('deux entreprises uniques : somme des taux, sans second portefeuille', () => {
  const first = purchased()
  const second = buyEnterprise(first, 'cafe', START)
  assert.ok(second.ok)
  if (!second.ok) return
  const combined = (getEnterpriseIncomeMicrosPerSecond('kiosque', 1) ?? 0) +
    (getEnterpriseIncomeMicrosPerSecond('cafe', 1) ?? 0)
  assert.equal(getTotalEnterpriseIncomeMicrosPerSecond(second.state), combined)
  assert.equal('balance' in second.state.enterprises, false)
  assert.equal('cash' in second.state.enterprises, false)
  assert.equal(second.state.game.balance, 10_000_000 - 75_000 - 180_000)
  assert.equal(second.state.stats.earnedBySource.enterprises, 0)
})

test('améliorations : +1 niveau, 19 paiements, bonus 5/10/15/20 et interdiction niveau 21', () => {
  let state = purchased('kiosque', 10_000_000)
  for (let current = 1; current < 20; current++) {
    const oldIncome = getTotalEnterpriseIncomeMicrosPerSecond(state)
    const oldCash = state.game.balance
    const cost = getEnterpriseUpgradeCostCents('kiosque', current)
    assert.ok(cost !== null)
    const result = upgradeEnterprise(state, 'kiosque', START)
    assert.ok(result.ok, `failed to upgrade ${current}`)
    if (!result.ok) return
    state = result.state
    assert.equal(state.enterprises.owned.kiosque!.level, current + 1)
    assert.equal(Math.round((oldCash - state.game.balance) * 100), cost)
    assert.equal(state.game.lifetimeEarned, 10_000_000)
    assert.ok(getTotalEnterpriseIncomeMicrosPerSecond(state) > oldIncome)
    assert.equal(result.receipt.incomeMicrosPerSecond, getTotalEnterpriseIncomeMicrosPerSecond(state))
  }
  assert.equal(state.enterprises.owned.kiosque!.level, 20)
  assert.deepEqual(upgradeEnterprise(state, 'kiosque', START), { ok: false, state, error: 'max-level' })
  assert.equal(getEnterpriseUpgradeCostCents('kiosque', 20), null)
})

test('revenus réguliers : les fractions de centime restent exactes malgré les nouveaux montants', () => {
  const original = purchased()
  const micros = getEnterpriseIncomeMicrosPerSecond('kiosque', 1)!
  // 1 µ$ par seconde = 1 nanodollar par milliseconde ; 1 centime = 10^7 nanodollars.
  const expected = (seconds: number) => {
    const nano = BigInt(micros) * BigInt(seconds * 1000)
    return {
      cents: Number(nano / 10_000_000n),
      carry: Number(nano % 10_000_000n) / 10_000_000,
    }
  }
  const second = advanceEnterpriseIncome(original, START + 1000)
  assert.equal(second.game.balance, original.game.balance + expected(1).cents / 100)
  assert.equal(second.game.lifetimeEarned, original.game.lifetimeEarned + expected(1).cents / 100)
  assert.equal(second.stats.earnedBySource.enterprises, expected(1).cents / 100)
  assert.equal(second.enterprises.revenueCarryCents, expected(1).carry)
  const afterTwo = advanceEnterpriseIncome(second, START + 2000)
  assert.equal(afterTwo.game.balance, original.game.balance + expected(2).cents / 100)
  assert.equal(afterTwo.stats.earnedBySource.enterprises, expected(2).cents / 100)
  assert.equal(afterTwo.enterprises.revenueCarryCents, expected(2).carry)
  assert.strictEqual(advanceEnterpriseIncome(afterTwo, START + 2000), afterTwo)
  assert.strictEqual(advanceEnterpriseIncome(afterTwo, START + 1000), afterTwo)
})

test('une modification de niveau crédite l ancien rendement jusqu à la transaction', () => {
  const first = purchased()
  const at = START + 1500
  const paidOld = advanceEnterpriseIncome(first, at)
  const upgraded = upgradeEnterprise(first, 'kiosque', at)
  assert.ok(upgraded.ok)
  if (!upgraded.ok) return
  assert.equal(upgraded.state.game.balance, paidOld.game.balance - (getEnterpriseUpgradeCostCents('kiosque', 1)! / 100))
  assert.equal(upgraded.state.enterprises.revenueCarryCents, paidOld.enterprises.revenueCarryCents)
  assert.equal(upgraded.state.enterprises.lastAccruedAt, at)
  const newRate = getEnterpriseIncomeMicrosPerSecond('kiosque', 2)!
  const later = advanceEnterpriseIncome(upgraded.state, at + 1000)
  const nanodollars = BigInt(Math.round(paidOld.enterprises.revenueCarryCents * 10_000_000)) +
    BigInt(newRate) * 1000n
  const cents = Number(nanodollars / 10_000_000n)
  assert.equal(later.stats.earnedBySource.enterprises, paidOld.stats.earnedBySource.enterprises + cents / 100)
})

test('revenus fixes et moteur marché : avance par second, jamais de double crédit', () => {
  const original = purchased()
  const first = advanceCapitalSecond(original)
  assert.equal(first.trading.dividendLastPaidAt, START + 1000)
  assert.equal(first.enterprises.lastAccruedAt, START + 1000)
  const ahead = advanceEnterpriseIncome(original, START + 9000)
  let afterReplay = ahead
  for (let second = 0; second < 9; second++) afterReplay = advanceCapitalSecond(afterReplay)
  assert.equal(afterReplay.enterprises.lastAccruedAt, START + 9000)
  assert.equal(afterReplay.game.balance, ahead.game.balance)
  assert.equal(afterReplay.game.lifetimeEarned, ahead.game.lifetimeEarned)
  assert.equal(afterReplay.stats.earnedBySource.enterprises, ahead.stats.earnedBySource.enterprises)
  const restored = restoreCapitalState(JSON.parse(JSON.stringify(afterReplay)), START + 9000)
  assert.deepEqual(advanceEnterpriseIncome(restored, START + 9000), restored)
  const batch = catchUpCapital(ahead, START + 9000)
  assert.equal(batch.state.enterprises.lastAccruedAt, START + 9000)
  assert.equal(batch.state.game.balance, ahead.game.balance)
})

test('rattrapage fixe sans plafond temporel : une année en un seul calcul, aucune boucle', () => {
  const original = purchased()
  const seconds = 365 * 24 * 3600
  const future = START + seconds * 1000
  const paid = advanceEnterpriseIncome(original, future)
  const nanodollars = BigInt(getEnterpriseIncomeMicrosPerSecond('kiosque', 1)!) * BigInt(future - START)
  const expectedCents = Number(nanodollars / 10_000_000n)
  assert.equal(paid.game.balance, original.game.balance + expectedCents / 100)
  assert.equal(paid.stats.earnedBySource.enterprises, expectedCents / 100)
  assert.equal(paid.enterprises.lastAccruedAt, future)
  assert.ok(paid.enterprises.revenueCarryCents < 1)
  assert.equal(advanceEnterpriseIncome(paid, future).game.balance, paid.game.balance)
})

test('invalidités : horloges, soldes négatifs, max et dépassements refusés', () => {
  const initial = funded()
  assert.deepEqual(buyEnterprise(initial, 'kiosque', START - 1000), { ok: false, state: initial, error: 'invalid-clock' })
  assert.deepEqual(buyEnterprise(initial, 'kiosque', Number.NaN), { ok: false, state: initial, error: 'invalid-clock' })
  const negative = { ...initial, game: { ...initial.game, balance: -10 } }
  const order = buyEnterprise(negative, 'kiosque', START)
  assert.equal(order.ok, false)
  if (!order.ok) assert.equal(order.error, 'insufficient-funds')
  const owned = purchased()
  const invalid = upgradeEnterprise(owned, 'kiosque', START - 1)
  assert.equal(invalid.ok, false)
  if (!invalid.ok) assert.equal(invalid.error, 'invalid-clock')
  assert.strictEqual(advanceEnterpriseIncome(owned, Number.POSITIVE_INFINITY), owned)
  const huge = { ...owned, game: { ...owned.game, balance: Number.MAX_SAFE_INTEGER } }
  assert.strictEqual(advanceEnterpriseIncome(huge, START + 1_000_000), huge)
})

test('achats sans fonds : l état et les entreprises précédentes ne sont pas modifiés', () => {
  const state = purchased('kiosque', 95_000)
  const originalHolding = state.enterprises.owned.kiosque
  const noMoney = upgradeEnterprise(state, 'kiosque', START)
  assert.equal(noMoney.ok, true, 'first upgrade costs 15 000 $ and is affordable with a 20 000 $ balance')
  const depleted = { ...state, game: { ...state.game, balance: 0 } }
  const blocked = upgradeEnterprise(depleted, 'kiosque', START)
  assert.equal(blocked.ok, false)
  assert.strictEqual(state.enterprises.owned.kiosque, originalHolding)
  assert.equal(depleted.game.balance, 0)
})

test('compatibilité v5 : aucune rétrofacturation des entreprises acquises aux anciens prix', () => {
  const legacy = funded()
  // Kiosque acquis avant rééquilibrage : 150 $ + 30 $ + 35,40 $.
  legacy.enterprises.owned.kiosque = { level: 3, investedCents: 21_540 }
  const restored = restoreCapitalState(JSON.parse(JSON.stringify(legacy)), START)
  assert.deepEqual(restored.enterprises.owned.kiosque, { level: 3, investedCents: 21_540 })
  const income = getTotalEnterpriseIncomeMicrosPerSecond(restored)
  assert.equal(income, getEnterpriseIncomeMicrosPerSecond('kiosque', 3))
  const next = upgradeEnterprise(restored, 'kiosque', START)
  assert.ok(next.ok)
  assert.equal(next.receipt.costCents, getEnterpriseUpgradeCostCents('kiosque', 3))
  assert.equal(next.state.enterprises.owned.kiosque?.investedCents, 21_540 + next.receipt.costCents)
  assert.equal(next.state.enterprises.owned.kiosque?.level, 4)
})
