import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState } from '../capital.ts'
import { getLevel } from '../game.ts'
import { buyAsset, sellAsset } from '../trading/trades.ts'
import { getAsset } from '../trading/catalog.ts'
import { buyEnterprise, advanceEnterpriseIncome } from './enterprises.ts'
import { advanceFiscalEconomy, payFiscalBalanceNow } from './clock.ts'
import { accrueProfitTax, FISCAL_TAX_BPS, collectTaxesAtDeadline, payTaxesEarly } from './fiscal.ts'
import { FISCAL_PERIOD_MS, FISCAL_TAX_RATE } from './state.ts'
import type { CapitalState } from '../capital.ts'

const T0 = 1_800_000_000_000
const DAY = 24 * 3600 * 1000
function funded(amount = 1000): CapitalState {
  return createCapitalState({ balance: amount, lifetimeEarned: amount, purchasedUpgrades: 0 }, T0)
}
function quoted(state: CapitalState, assetId: string, price: number): CapitalState {
  const asset = getAsset(assetId)!
  return {
    ...state, trading: {
      ...state.trading, quotes: {
        ...state.trading.quotes,
        [assetId]: { price, momentum: 0, dividendYield: asset.initialDividendYield, updatedAt: T0 },
      },
    },
  }
}
function tax(state: CapitalState, cents: number, source: 'enterprises' | 'stocks' | 'crypto' | 'memecoins') {
  const result = accrueProfitTax(state, source, cents)
  assert.ok(result)
  return result
}
function purchasedKiosk(): CapitalState {
  const purchase = buyEnterprise(funded(100_000), 'kiosque', T0)
  assert.ok(purchase.ok)
  return purchase.state
}

test('taux unique centralisé provisoire, 72h REELLES et taxe seulement sur bénéfice', () => {
  assert.equal(FISCAL_TAX_RATE, 0.15)
  assert.equal(FISCAL_TAX_BPS, 1500)
  assert.equal(FISCAL_PERIOD_MS, 72 * 3600 * 1000)
  const state = funded()
  assert.strictEqual(accrueProfitTax(state, 'stocks', 0), state)
  assert.equal(tax(state, 10_000, 'stocks').fiscal.taxesDueCents, 1500)
  assert.equal(state.fiscal.taxesDueCents, 0)
  assert.equal(state.game.balance, 1000)
  assert.equal(accrueProfitTax(state, 'stocks', -1), null)
})

test('vente action : plus-value nette des deux frais seulement, aucun prélèvement immédiat', () => {
  let state = quoted(funded(), 'nvideo', 200)
  const buy = buyAsset(state, 'nvideo', 1.25)
  assert.ok(buy.ok)
  state = quoted(buy.state, 'nvideo', 220)
  const sold = sellAsset(state, 'nvideo', 1.25)
  assert.ok(sold.ok)
  assert.equal(sold.receipt.netRealizedProfit, 22.37)
  assert.equal(sold.receipt.taxAccrued, 3.36)
  assert.equal(sold.state.fiscal.taxesDueCents, 336)
  assert.equal(sold.state.fiscal.dueBySourceCents.stocks, 336)
  assert.equal(sold.state.game.balance, 1022.37)
  assert.equal(sold.state.game.lifetimeEarned, 1022.37)
  assert.equal(sold.state.fiscal.taxesPaidCents, 0)
})

test('vente partielle à coût moyen : profits par vente indépendants des pertes', () => {
  let state = quoted(funded(), 'nvideo', 100)
  const buy = buyAsset(state, 'nvideo', 4)
  assert.ok(buy.ok)
  state = quoted(buy.state, 'nvideo', 120)
  const partial = sellAsset(state, 'nvideo', 1)
  assert.ok(partial.ok)
  assert.equal(partial.receipt.netRealizedProfit, 18.9)
  assert.equal(partial.receipt.taxAccrued, 2.84)
  assert.equal(partial.state.fiscal.taxesDueCents, 284)
  assert.deepEqual(partial.state.trading.positions.nvideo, { quantity: 3, costBasis: 301.5 })
  const final = sellAsset(partial.state, 'nvideo', 3)
  assert.ok(final.ok)
  assert.equal(final.receipt.netRealizedProfit, 56.7)
  assert.equal(final.receipt.taxAccrued, 8.51)
  assert.equal(final.state.fiscal.taxesDueCents, 1135)
  assert.equal(final.state.trading.positions.nvideo, undefined)
  assert.equal(final.state.game.lifetimeEarned, 1075.6)

  const other = quoted(funded(), 'nvideo', 100)
  const bought = buyAsset(other, 'nvideo', 1)
  assert.ok(bought.ok)
  const losing = sellAsset(quoted(bought.state, 'nvideo', 80), 'nvideo', 1)
  assert.ok(losing.ok)
  assert.ok(losing.receipt.netRealizedProfit < 0)
  assert.equal(losing.receipt.taxAccrued, 0)
  assert.equal(losing.state.fiscal.taxesDueCents, 0)
})

test('stocks, cryptos et memecoins : seules les ventes bénéficiaires créent une dette', () => {
  for (const [id, quantity] of [['nvideo', 1], ['bitcoin', 0.01], ['shiba-inu', 1_000_000]] as const) {
    const original = funded(100_000)
    const price = getAsset(id)!.referencePrice
    const bought = buyAsset(quoted(original, id, price), id, quantity)
    assert.ok(bought.ok, id)
    const sold = sellAsset(quoted(bought.state, id, price * 1.3), id, quantity)
    assert.ok(sold.ok, sold.ok ? id : `${id}: ${sold.error}`)
    const source = getAsset(id)!.kind === 'stock' ? 'stocks' : getAsset(id)!.kind === 'memecoin' ? 'memecoins' : 'crypto'
    assert.equal(sold.state.fiscal.dueBySourceCents[source], Math.round(sold.receipt.netRealizedProfit * 100 * .15), id)
    assert.equal(sold.receipt.cashChange > 0, true)
    assert.equal(sold.state.fiscal.taxesPaidCents, 0)
  }
})

test('petits revenus d entreprises : taxe fractionnaire sans perte au fil des ticks', () => {
  let state = funded()
  for (let n = 1; n <= 7; n++) {
    state = tax(state, 1, 'enterprises')
    assert.equal(state.fiscal.taxesDueCents, Math.floor(n * 0.15))
  }
  assert.equal(state.fiscal.taxesDueCents, 1)
  assert.equal(state.fiscal.enterpriseTaxRemainderBps, 500)
  const restored = restoreCapitalState(JSON.parse(JSON.stringify(state)), T0)
  assert.deepEqual(restored.fiscal, state.fiscal)
  const later = tax(restored, 1, 'enterprises')
  assert.equal(later.fiscal.taxesDueCents, 1)
  assert.equal(later.fiscal.enterpriseTaxRemainderBps, 2000)
})

test('entreprises : revenu BRUT crédité immédiatement et taxe seulement accumulée', () => {
  const start = purchasedKiosk()
  const next = advanceEnterpriseIncome(start, T0 + DAY)
  const gained = Math.round((next.game.balance - start.game.balance) * 100)
  assert.ok(gained > 0)
  assert.equal(next.game.lifetimeEarned, start.game.lifetimeEarned + gained / 100)
  assert.equal(next.fiscal.taxesDueCents, Math.floor(gained * 0.15))
  assert.equal(next.fiscal.taxesPaidCents, 0)
  assert.equal(next.fiscal.dueBySourceCents.enterprises, next.fiscal.taxesDueCents)
  assert.equal(next.stats.earnedBySource.enterprises, gained / 100)
  const again = advanceEnterpriseIncome(next, T0 + DAY)
  assert.strictEqual(again, next)
})

test('échéance exacte 72h : prélèvement automatique même avec découvert, XP préservée', () => {
  let state = { ...funded(10), game: { balance: 10, lifetimeEarned: 100, purchasedUpgrades: 0 } }
  state = tax(state, 10_000, 'stocks')
  assert.equal(state.fiscal.taxesDueCents, 1500)
  const before = advanceFiscalEconomy(state, T0 + FISCAL_PERIOD_MS - 1)
  assert.equal(before.fiscal.taxesDueCents, 1500)
  assert.equal(before.game.balance, 10)
  const due = advanceFiscalEconomy(before, T0 + FISCAL_PERIOD_MS)
  assert.equal(due.game.balance, -5)
  assert.equal(due.game.lifetimeEarned, 100)
  assert.equal(getLevel(due.game.lifetimeEarned), getLevel(state.game.lifetimeEarned))
  assert.equal(due.fiscal.taxesDueCents, 0)
  assert.equal(due.fiscal.taxesPaidCents, 1500)
  assert.equal(due.fiscal.paidBySourceCents.stocks, 1500)
  assert.equal(due.fiscal.periodStartedAt, T0 + FISCAL_PERIOD_MS)
  assert.strictEqual(advanceFiscalEconomy(due, T0 + FISCAL_PERIOD_MS), due)
  const secondDue = advanceFiscalEconomy(due, T0 + 2 * FISCAL_PERIOD_MS)
  assert.equal(secondDue.fiscal.periodStartedAt, T0 + 2 * FISCAL_PERIOD_MS)
  assert.equal(secondDue.fiscal.taxesPaidCents, 1500)
  assert.equal(secondDue.game.balance, -5)
})

test('paiement anticipé : 100% de la dette, timer remis à 72h, même si négatif', () => {
  let start = { ...funded(), game: { balance: 4, lifetimeEarned: 100, purchasedUpgrades: 0 } }
  start = tax(start, 4000, 'crypto')
  const at = T0 + 20 * 3600_000
  const paid = payFiscalBalanceNow(start, at)
  assert.ok(paid.ok)
  assert.equal(paid.amountCents, 600)
  assert.equal(paid.state.game.balance, -2)
  assert.equal(paid.state.game.lifetimeEarned, 100)
  assert.equal(paid.state.fiscal.taxesPaidCents, 600)
  assert.equal(paid.state.fiscal.taxesDueCents, 0)
  assert.equal(paid.state.fiscal.periodStartedAt, at)
  assert.equal(advanceFiscalEconomy(paid.state, at + FISCAL_PERIOD_MS - 1).fiscal.periodStartedAt, at)
  assert.equal(advanceFiscalEconomy(paid.state, at + FISCAL_PERIOD_MS).fiscal.periodStartedAt, at + FISCAL_PERIOD_MS)
  const second = payFiscalBalanceNow(paid.state, at + 1000)
  assert.equal(second.ok, false)
  if (!second.ok) assert.equal(second.error, 'nothing-due')
  const noFreeRestart = payTaxesEarly(funded(), T0 + 1000)
  assert.equal(noFreeRestart.ok, false)
})

test('absence de 10 jours : chaque période impôt correctement répartie, pas de double paiement', () => {
  const initial = purchasedKiosk()
  const now = T0 + 10 * DAY
  const all = advanceFiscalEconomy(initial, now)
  let incremental = initial
  for (let n = 1; n <= 10; n++) incremental = advanceFiscalEconomy(incremental, T0 + n * DAY)
  assert.deepEqual(all.game, incremental.game)
  assert.deepEqual(all.fiscal, incremental.fiscal)
  assert.equal(all.enterprises.lastAccruedAt, now)
  assert.equal(all.fiscal.periodStartedAt, T0 + 9 * DAY)
  assert.ok(all.fiscal.taxesPaidCents > 0)
  assert.ok(all.fiscal.taxesDueCents > 0)
  const restored = restoreCapitalState(JSON.parse(JSON.stringify(all)), now)
  assert.deepEqual(advanceFiscalEconomy(restored, now), restored)
})

test('erreurs: impossible de payer une échéance en avance sans taxes, pas de timestamps invalides', () => {
  const initial = funded()
  assert.strictEqual(advanceFiscalEconomy(initial, Number.POSITIVE_INFINITY), initial)
  assert.strictEqual(advanceFiscalEconomy(initial, T0 - 1), initial)
  assert.equal(collectTaxesAtDeadline(initial, T0 + FISCAL_PERIOD_MS - 1), null)
  assert.deepEqual(payTaxesEarly(initial, T0), { ok: false, state: initial, error: 'nothing-due' })
})
