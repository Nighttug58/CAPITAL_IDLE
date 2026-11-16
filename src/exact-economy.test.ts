import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createExactEconomyLedger, creditExactIncome, accrueExactEnterpriseIncome,
  spendExactCash, settleExactTaxes, recordExactTradeProfit,
  creditExactFame, spendExactFame, creditExactPrestigePoints, spendExactPrestigePoints,
} from './exact-economy.ts'

test('very large click cash, XP and stats remain exact', () => {
  const huge = 10n ** 150n + 1234n
  const state = creditExactIncome(createExactEconomyLedger(), 'clicks', huge)
  assert.equal(state.balanceCents, huge)
  assert.equal(state.lifetimeEarnedCents, huge)
  assert.equal(state.experienceCents, huge)
  assert.equal(state.earnedBySourceCents.clicks, huge)
  const spent = spendExactCash(state, 10n ** 140n)!
  assert.equal(spent.balanceCents, huge - 10n ** 140n)
  assert.equal(spent.experienceCents, huge)
  assert.equal(spendExactCash(state, huge + 1n), null)
})

test('enterprise income accumulates subcent and tax exactly after long offline interval', () => {
  const rate = 10n ** 120n
  const state = createExactEconomyLedger()
  const first = accrueExactEnterpriseIncome(state, rate, 1_234_567n, 0n, 0n)
  const second = accrueExactEnterpriseIncome(first.state, rate, 8_765_433n,
    first.carry.remainderNanodollars, first.carry.taxRemainderBps)
  assert.equal(second.state.balanceCents, rate)
  assert.equal(second.state.experienceCents, rate)
  assert.equal(second.state.taxesDueCents, rate * 15n / 100n)
  assert.equal(second.state.dueBySourceCents.enterprises, rate * 15n / 100n)
  assert.equal(second.carry.remainderNanodollars, 0n)
  const taxed = settleExactTaxes(second.state)
  assert.equal(taxed.balanceCents, rate * 85n / 100n)
  assert.equal(taxed.taxesDueCents, 0n)
  assert.equal(taxed.taxesPaidCents, rate * 15n / 100n)
})

test('cash can become negative through tax settlement, but no borrowing for purchases', () => {
  const start = createExactEconomyLedger()
  const earned = creditExactIncome(start, 'clicks', 3n)
  const taxable = recordExactTradeProfit(earned, 'stocks', 100n)
  assert.equal(taxable.balanceCents, 3n)
  assert.equal(taxable.taxesDueCents, 15n)
  const after = settleExactTaxes(taxable)
  assert.equal(after.balanceCents, -12n)
  assert.equal(spendExactCash(after, 1n), null)
  assert.equal(after.experienceCents, 103n)
})

test('prestige and fame points stay exact above 1e100; purchases never mint currency', () => {
  const huge = 10n ** 101n
  const original = createExactEconomyLedger()
  const fame = creditExactFame(original, huge)
  assert.equal(spendExactFame(fame, huge - 2n)!.fameMicros, 2n)
  assert.equal(spendExactFame(fame, huge + 1n), null)
  const prestige = creditExactPrestigePoints(fame, huge)
  assert.equal(prestige.prestigeLifetimePoints, huge)
  assert.equal(spendExactPrestigePoints(prestige, huge - 1n)!.prestigeAvailablePoints, 1n)
  assert.equal(spendExactPrestigePoints(prestige, huge + 1n), null)
})
