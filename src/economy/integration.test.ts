import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState } from '../capital.ts'
import { earnCapitalClick } from './stats-ledger.ts'
import { getCapitalStatsOverview } from './stats-overview.ts'
import { advanceFiscalEconomy, payFiscalBalanceNow } from './clock.ts'
import { accrueProfitTax } from './fiscal.ts'
import { buyEnterprise, upgradeEnterprise } from './enterprises.ts'
import { FISCAL_PERIOD_MS } from './state.ts'
import { buyAsset, sellAsset } from '../trading/trades.ts'
import { advanceCapitalSecond } from '../trading/dividends.ts'
import { createSaveExport, prepareSaveImport } from '../save-transfer.ts'
import type { CapitalState } from '../capital.ts'

const T0 = 1_800_000_000_000
const DAY = 86_400_000
function starting(cash = 10_000): CapitalState {
  return createCapitalState({ balance: cash, lifetimeEarned: cash, purchasedUpgrades: 0 }, T0)
}
function price(state: CapitalState, id: string, value: number): CapitalState {
  return {
    ...state,
    trading: {
      ...state.trading,
      quotes: { ...state.trading.quotes,
        [id]: { price: value, momentum: 0, dividendYield: id === 'nvideo' ? 0.05 : null, updatedAt: T0 } },
    },
  }
}

test('chaîne financière : clic, achat entreprise, revenus, taxes, puis patrimoine sans double comptage', () => {
  const base = starting(200)
  const clicked = earnCapitalClick(base)
  assert.equal(clicked.game.balance, 201)
  assert.equal(clicked.stats.clickCount, 1)
  assert.equal(clicked.stats.earnedBySource.clicks, 1)
  const purchased = buyEnterprise(clicked, 'kiosque', T0)
  assert.ok(purchased.ok)
  assert.equal(purchased.state.game.balance, 51)
  assert.equal(purchased.state.game.lifetimeEarned, 201)
  const offline = advanceFiscalEconomy(purchased.state, T0 + 10 * DAY)
  const gross = offline.stats.earnedBySource.enterprises
  assert.ok(gross > 0)
  assert.equal(offline.game.lifetimeEarned, 201 + gross)
  assert.equal(offline.fiscal.periodStartedAt, T0 + 9 * DAY)
  assert.ok(offline.fiscal.taxesPaidCents > 0)
  assert.ok(offline.fiscal.taxesDueCents > 0)
  const summary = getCapitalStatsOverview(offline)
  assert.equal(summary.enterpriseCount, 1)
  assert.equal(summary.enterpriseBookValue, 150)
  assert.equal(summary.cash, offline.game.balance)
  assert.ok(Math.abs(summary.netWorth - (summary.cash + 150 - summary.taxesDue)) < 1e-8)
  assert.ok(Math.abs(summary.sources.find(s => s.id === 'clicks')!.gains - 1) < 1e-8)
  assert.ok(Math.abs(summary.sources.find(s => s.id === 'enterprises')!.gains - gross) < 1e-8)
})

test('dette fiscale > liquidités : achats bloqués puis résorption grâce aux revenus fixes', () => {
  const initial = buyEnterprise(starting(200), 'kiosque', T0)
  assert.ok(initial.ok)
  const taxed = accrueProfitTax(initial.state, 'stocks', 500_000)
  assert.ok(taxed)
  const deadline = advanceFiscalEconomy(taxed, T0 + FISCAL_PERIOD_MS)
  assert.ok(deadline.game.balance < 0, 'l impôt doit réellement autoriser le découvert')
  assert.equal(deadline.fiscal.taxesDueCents, 0)
  assert.equal(deadline.fiscal.paidBySourceCents.stocks, 75_000)
  assert.equal(deadline.game.lifetimeEarned > initial.state.game.lifetimeEarned, true)
  const blocked = upgradeEnterprise(deadline, 'kiosque', T0 + FISCAL_PERIOD_MS)
  assert.equal(blocked.ok, false)
  if (!blocked.ok) assert.equal(blocked.error, 'insufficient-funds')
  assert.equal(buyAsset(deadline, 'nvideo', 1).ok, false)
  const recovered = advanceFiscalEconomy(deadline, T0 + 365 * DAY)
  assert.ok(recovered.game.balance > 0)
  assert.ok(recovered.fiscal.taxesPaidCents > deadline.fiscal.taxesPaidCents)
  assert.ok(recovered.game.lifetimeEarned > deadline.game.lifetimeEarned)
})

test('vente à la frontière 72h : les taxes dues avant sont prélevées, après restent dues', () => {
  let state = starting(1000)
  state = price(state, 'nvideo', 100)
  const purchased = buyAsset(state, 'nvideo', 2)
  assert.ok(purchased.ok)
  state = advanceFiscalEconomy(purchased.state, T0 + FISCAL_PERIOD_MS - 1)
  const beforeDeadline = sellAsset(price(state, 'nvideo', 120), 'nvideo', 1)
  assert.ok(beforeDeadline.ok)
  assert.ok(beforeDeadline.state.fiscal.taxesDueCents > 0)
  const paid = advanceFiscalEconomy(beforeDeadline.state, T0 + FISCAL_PERIOD_MS)
  assert.equal(paid.fiscal.taxesDueCents, 0)
  assert.equal(paid.fiscal.paidBySourceCents.stocks, beforeDeadline.state.fiscal.taxesDueCents)
  assert.equal(paid.fiscal.periodStartedAt, T0 + FISCAL_PERIOD_MS)
  const nextSale = sellAsset(price(paid, 'nvideo', 125), 'nvideo', 1)
  assert.ok(nextSale.ok)
  assert.ok(nextSale.state.fiscal.taxesDueCents > 0)
  assert.equal(nextSale.state.fiscal.taxesPaidCents, paid.fiscal.taxesPaidCents)
  const settled = advanceFiscalEconomy(nextSale.state, T0 + 2 * FISCAL_PERIOD_MS)
  assert.equal(settled.fiscal.taxesDueCents, 0)
  assert.ok(settled.fiscal.taxesPaidCents > paid.fiscal.taxesPaidCents)
})

test('dividende passé juste à échéance : dette fiscale collectée avant fin du replay', () => {
  const state = starting(50)
  state.fiscal.periodStartedAt = T0
  state.fiscal.taxesDueCents = 900
  state.fiscal.dueBySourceCents.stocks = 900
  state.trading.dividendLastPaidAt = T0 + FISCAL_PERIOD_MS - 1000
  state.trading.lastTickAt = T0 + FISCAL_PERIOD_MS - 1000
  state.enterprises.lastAccruedAt = T0 + FISCAL_PERIOD_MS - 1000
  const result = advanceCapitalSecond(state)
  assert.equal(result.fiscal.periodStartedAt, T0 + FISCAL_PERIOD_MS)
  assert.equal(result.fiscal.taxesPaidCents, 900)
  assert.equal(result.fiscal.taxesDueCents, 0)
  assert.equal(result.game.balance, 41)
  assert.strictEqual(advanceFiscalEconomy(result, T0 + FISCAL_PERIOD_MS), result)
})

test('export puis import après absence : horloges, portefeuille, taxes, XP conservés', () => {
  const base = buyEnterprise(starting(10_000), 'kiosque', T0)
  assert.ok(base.ok)
  const due = accrueProfitTax(base.state, 'crypto', 100_000)
  assert.ok(due)
  const saved = restoreCapitalState(JSON.parse(JSON.stringify(due)), T0)
  const backup = createSaveExport(saved, T0 + 10_000)
  const restored = prepareSaveImport(backup, T0 + 90 * DAY)
  assert.ok(restored.ok)
  assert.deepEqual(restored.preview.state, saved)
  const at = T0 + 90 * DAY
  const caught = advanceFiscalEconomy(restored.preview.state, at)
  const once = advanceFiscalEconomy(saved, at)
  assert.deepEqual(caught, once)
  assert.strictEqual(advanceFiscalEconomy(caught, at), caught)
  const early = payFiscalBalanceNow(caught, at + DAY)
  assert.ok(early.ok)
  assert.equal(early.state.fiscal.periodStartedAt, at + DAY)
  assert.equal(early.state.fiscal.taxesDueCents, 0)
  assert.equal(early.state.game.lifetimeEarned, advanceFiscalEconomy(caught, at + DAY).game.lifetimeEarned)
})
