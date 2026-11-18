import assert from 'node:assert/strict'
import test from 'node:test'
import { createV8CapitalState, getExactAmount as cents } from '../exact-state-v8.ts'
import { v8BuyTrade, v8SellTrade, v8MaximumBuyUnits, v8AccrueTax } from '../exact-runtime-v8.ts'
import { getAsset } from '../trading/catalog.ts'
import { liquidityQuote } from '../trading/liquidity-v8.ts'
import { formatDecimalUnits } from '../large-numbers.ts'
import { validateExactV8State } from '../exact-save-validation.ts'
import { progressiveTaxNumerator, marginalTaxRateBps } from './tax-curve.ts'
import { getEnterpriseIncomeMicrosPerSecondExact,
  getEnterpriseUpgradeCostCentsExact, getEnterpriseUpgradeBatchCostCentsExact } from './catalog.ts'

const NOW = 1_800_000_000_000
const wealthy = (cash: bigint) => {
  const base = createV8CapitalState(NOW)
  return { ...base, game: { ...base.game, balance: cash.toString(), lifetimeEarned: cash.toString() } }
}

test('progressive marginal tax crosses a bracket exactly and cannot be diluted by chunks', () => {
  const before = 99_999_900n
  const profit = 200n
  const expected = 100n * 1_500n + 100n * 2_000n
  assert.equal(progressiveTaxNumerator(profit, before), expected)
  assert.equal(progressiveTaxNumerator(100n, before) +
    progressiveTaxNumerator(100n, before + 100n), expected)
  assert.equal(marginalTaxRateBps(before), 1_500n)
  assert.equal(marginalTaxRateBps(before + 100n), 2_000n)
  assert.equal(marginalTaxRateBps(10n ** 150n), 7_000n)
  const state = wealthy(before + profit)
  const taxed = v8AccrueTax(state, 'stocks', profit)
  assert.equal(cents(taxed.fiscal.taxesDueCents), 35n)
  assert.equal(cents(taxed.game.balance), cents(state.game.balance))
})

test('large buy pumps stock; liquidation reprices strongly and cannot create free profit', () => {
  const stock = getAsset('nvideo')!
  const start = wealthy(10n ** 20n)
  const volume = '24000000'
  const bought = v8BuyTrade(start, stock.id, volume)
  assert.ok(bought.ok)
  if (!bought.ok) return
  const pumped = bought.state.trading.quotes[stock.id]!.price
  assert.ok(pumped > stock.referencePrice * 1.3)
  const sold = v8SellTrade(bought.state, stock.id, volume)
  assert.ok(sold.ok)
  if (!sold.ok) return
  const after = sold.state.trading.quotes[stock.id]!.price
  assert.ok(after < pumped * 0.8)
  assert.ok(Math.abs(after / stock.referencePrice - 1) < 1e-10)
  assert.ok(cents(sold.state.game.balance) < cents(start.game.balance))
  assert.equal(sold.state.trading.positions[stock.id], undefined)
  const checked = validateExactV8State(sold.state,
    id => getAsset(id)?.quantityDecimals ?? null)
  assert.equal(checked.valid, true, checked.reason)
})

test('market impact is path-independent against order splitting', () => {
  const asset = getAsset('bitcoin')!
  const base = asset.referencePrice
  const first = liquidityQuote(asset, base, 5_000n * 100_000_000n, 'buy', 0n)!
  const second = liquidityQuote(asset, first.endingPrice, 5_000n * 100_000_000n,
    'buy', 5_000n * 100_000_000n)!
  const single = liquidityQuote(asset, base, 10_000n * 100_000_000n, 'buy', 0n)!
  assert.ok(Math.abs(second.endingPrice / single.endingPrice - 1) < 1e-12)
  assert.ok(first.executionPrice < first.endingPrice)
  assert.ok(single.executionPrice > base)
  const liquidate = liquidityQuote(asset, single.endingPrice,
    10_000n * 100_000_000n, 'sell', 10_000n * 100_000_000n)!
  assert.ok(Math.abs(liquidate.endingPrice / base - 1) < 1e-12)
})

test('MAX order uses real impacted execution cost, never overdraws wallet', () => {
  const state = wealthy(1_000_000_000n)
  const asset = getAsset('nvideo')!
  const max = v8MaximumBuyUnits(state, asset.id)
  assert.ok(max > 0n)
  const amount = formatDecimalUnits(max, asset.quantityDecimals, true)
  const bought = v8BuyTrade(state, asset.id, amount)
  assert.ok(bought.ok)
  if (!bought.ok) return
  assert.ok(cents(bought.state.game.balance) >= 0n)
  const extra = formatDecimalUnits(max + 1n, asset.quantityDecimals, true)
  assert.equal(v8BuyTrade(state, asset.id, extra).ok, false)
})

test('after level 20 enterprise income and purchase cost grow gently, not exponentially', () => {
  const before = getEnterpriseIncomeMicrosPerSecondExact('kiosque', 20)!
  const at1000 = getEnterpriseIncomeMicrosPerSecondExact('kiosque', 1_000)!
  const at2000 = getEnterpriseIncomeMicrosPerSecondExact('kiosque', 2_000)!
  assert.ok(at1000 > before)
  assert.ok(at2000 < at1000 * 3n)
  const c1000 = getEnterpriseUpgradeCostCentsExact('kiosque', 1_000)!
  const c2000 = getEnterpriseUpgradeCostCentsExact('kiosque', 2_000)!
  assert.ok(c2000 < c1000 * 3n)
  const batch = getEnterpriseUpgradeBatchCostCentsExact('kiosque', 20, 100)!
  let sequential = 0n
  for (let level = 20; level < 100; level++)
    sequential += getEnterpriseUpgradeCostCentsExact('kiosque', level)!
  assert.equal(batch, sequential)
})
