import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState } from '../capital.ts'
import { getAsset } from '../trading/catalog.ts'
import { buyAsset, sellAsset } from '../trading/trades.ts'
import { advanceCapitalSecond } from '../trading/dividends.ts'
import { earnCapitalClick, recordActivePlay } from './stats-ledger.ts'
import { getCapitalStatsOverview } from './stats-overview.ts'
import { buyEnterprise, advanceEnterpriseIncome } from './enterprises.ts'
import { accrueProfitTax } from './fiscal.ts'
import { advanceFiscalEconomy, payFiscalBalanceNow } from './clock.ts'
import type { CapitalState } from '../capital.ts'

const AT = 1_800_000_000_000
const founded = (amount = 1_000): CapitalState =>
  createCapitalState({ balance: amount, lifetimeEarned: amount, purchasedUpgrades: 0 }, AT)
const quoted = (state: CapitalState, id: string, price: number): CapitalState => ({
  ...state, trading: { ...state.trading, quotes: {
    ...state.trading.quotes,
    [id]: { price, momentum: 0, dividendYield: getAsset(id)!.initialDividendYield, updatedAt: AT },
  } },
})

test('clics : ajout atomique au solde, à l XP et au compteur sans double crédit', () => {
  const before = founded()
  const after = earnCapitalClick(before)
  assert.equal(before.stats.clickCount, 0)
  assert.equal(before.stats.earnedBySource.clicks, 0)
  assert.equal(after.game.balance, 1001)
  assert.equal(after.game.lifetimeEarned, 1001)
  assert.equal(after.stats.clickCount, 1)
  assert.equal(after.stats.earnedBySource.clicks, 1)
  const onceMore = earnCapitalClick(after)
  assert.equal(onceMore.game.balance, 1002)
  assert.equal(onceMore.stats.clickCount, 2)
  assert.equal(onceMore.stats.earnedBySource.clicks, 2)
  assert.equal(onceMore.stats.earnedBySource.unclassified, 1000)
})

test('Trading : bénéfices et pertes par source distincts, fiscalité conservée, XP high-water intacte', () => {
  let state = quoted(founded(), 'nvideo', 100)
  const purchase = buyAsset(state, 'nvideo', 4)
  assert.ok(purchase.ok)
  state = quoted(purchase.state, 'nvideo', 120)
  const gain = sellAsset(state, 'nvideo', 1)
  assert.ok(gain.ok)
  assert.equal(gain.receipt.netRealizedProfit, 18.9)
  assert.equal(gain.state.stats.earnedBySource.stocks, 18.9)
  assert.equal(gain.state.stats.realizedLossesBySource.stocks, 0)
  assert.equal(gain.state.fiscal.taxesDueCents, 284)
  assert.equal(gain.state.game.lifetimeEarned, 1018.9)
  state = quoted(gain.state, 'nvideo', 80)
  const loss = sellAsset(state, 'nvideo', 3)
  assert.ok(loss.ok)
  assert.equal(loss.receipt.netRealizedProfit, -62.7)
  assert.equal(loss.state.stats.earnedBySource.stocks, 18.9)
  assert.equal(loss.state.stats.realizedLossesBySource.stocks, 62.7)
  assert.equal(loss.state.game.lifetimeEarned, 1018.9)
  assert.equal(loss.state.fiscal.taxesDueCents, 284)
  const view = getCapitalStatsOverview(loss.state)
  assert.equal(view.totalRealizedTradingProfit, 18.9)
  assert.equal(view.totalRealizedTradingLoss, 62.7)
  assert.equal(view.sources.find(s => s.id === 'stocks')?.net, -43.8)
  assert.equal(view.sources.find(s => s.id === 'unclassified')?.gains, 1000)
})

test('Dividendes : seules les sommes effectivement créditées sont suivies', () => {
  let state = founded(1_000_000)
  const purchased = buyAsset(state, 'nvideo', 1_000)
  assert.ok(purchased.ok)
  state = purchased.state
  const next = advanceCapitalSecond(state)
  const added = Math.round((next.game.balance - state.game.balance) * 100)
  assert.ok(added > 0)
  assert.equal(Math.round((next.stats.earnedBySource.dividends - state.stats.earnedBySource.dividends) * 100), added)
  const onceAgain = advanceCapitalSecond(next)
  assert.ok(onceAgain.stats.earnedBySource.dividends >= next.stats.earnedBySource.dividends)
  assert.equal(state.stats.earnedBySource.dividends, 0)
})

test('Entreprises : la valeur comptable est conservée, mais aucune revente possible', () => {
  const purchase = buyEnterprise(founded(100_000), 'kiosque', AT)
  assert.ok(purchase.ok)
  const next = advanceEnterpriseIncome(purchase.state, AT + 24 * 3_600_000)
  const view = getCapitalStatsOverview(next)
  assert.equal(view.enterpriseCount, 1)
  assert.equal(view.enterpriseLevels, 1)
  assert.equal(view.enterpriseBookValue, 75_000)
  assert.equal(view.enterpriseIncomePerSecond, 2_604_167 / 1_000_000)
  assert.ok(view.sources.find(s => s.id === 'enterprises')!.gains > 0)
  assert.equal(view.assetMarketValue, 0)
  assert.equal(view.netWorth, next.game.balance + 75_000 - next.fiscal.taxesDueCents / 100)
})

test('Fortune nette : découvert, titres, entreprises, dette fiscale sans double prélèvement', () => {
  const state = founded(1_000)
  state.game.balance = -25
  state.trading.positions.nvideo = { quantity: 2, costBasis: 201 }
  state.trading.quotes.nvideo = {
    price: 120, momentum: 0, dividendYield: getAsset('nvideo')!.initialDividendYield, updatedAt: AT,
  }
  state.enterprises.owned.kiosque = { level: 1, investedCents: 7_500_000 }
  const withTax = accrueProfitTax(state, 'stocks', 10_000)
  assert.ok(withTax)
  const view = getCapitalStatsOverview(withTax)
  assert.equal(view.cash, -25)
  assert.equal(view.assetMarketValue, 240)
  assert.equal(view.enterpriseBookValue, 75_000)
  assert.equal(view.taxesDue, 15)
  assert.equal(view.netWorth, 75_200)
  // Le paiement anticipé rattrape d'abord la seconde de revenu passif :
  // ne pas confondre le nouveau cash avec l'ancien - 15 $ de taxes.
  const accrued = advanceFiscalEconomy(withTax, AT + 1000)
  const paid = payFiscalBalanceNow(withTax, AT + 1000)
  assert.ok(paid.ok)
  const after = getCapitalStatsOverview(paid.state)
  assert.equal(after.cash, Math.round((accrued.game.balance - accrued.fiscal.taxesDueCents / 100) * 100) / 100)
  assert.equal(after.taxesDue, 0)
  assert.equal(after.taxesPaid, accrued.fiscal.taxesDueCents / 100)
  assert.equal(after.netWorth, getCapitalStatsOverview(accrued).netWorth)
  assert.equal(after.lifetimeEarned, accrued.game.lifetimeEarned)
})

test('Migration ancien v5 : attribution inconnue sans inventer des clics ou dividendes', () => {
  const old = founded()
  old.game.lifetimeEarned = 1_010
  old.stats.earnedBySource.enterprises = 3
  const serialized = JSON.parse(JSON.stringify(old))
  delete serialized.stats.sourceTrackingVersion
  const restored = restoreCapitalState(serialized, AT)
  assert.equal(restored.stats.sourceTrackingVersion, 1)
  assert.equal(restored.stats.earnedBySource.unclassified, 1007)
  assert.equal(restored.stats.earnedBySource.enterprises, 3)
  assert.equal(restored.stats.earnedBySource.clicks, 0)
  assert.equal(restored.stats.earnedBySource.dividends, 0)
  assert.deepEqual(restoreCapitalState(JSON.parse(JSON.stringify(restored)), AT).stats, restored.stats)
})

test('Progression et temps actif : plafonds de niveau, horaires sans simulation hors ligne', () => {
  const first = founded()
  const after = recordActivePlay(first, 90_000)
  assert.equal(after.stats.activePlayMs, 90_000)
  assert.equal(after.stats.startedAt, AT)
  assert.strictEqual(recordActivePlay(after, -100), after)
  assert.equal(getCapitalStatsOverview(after).activePlayMs, 90_000)
  assert.equal(getCapitalStatsOverview(after).level, getCapitalStatsOverview(first).level)
  const final = { ...after, game: { ...after.game, lifetimeEarned: 100_000 } }
  const view = getCapitalStatsOverview(final)
  assert.equal(view.level, 50)
  assert.equal(view.nextLevelAt, null)
  assert.equal(view.levelProgressPercent, 100)
})
