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

test('large buy and full sale leave prices and charts unchanged for all assets', () => {
  for (const id of ['nvideo', 'bitcoin', 'shiba-inu'] as const) {
    const asset = getAsset(id)!
    const start = wealthy(10n ** 28n)
    const volume = '24000000'
    const quotes = start.trading.quotes
    const history = start.trading.history
    const bought = v8BuyTrade(start, id, volume)
    assert.equal(bought.ok, true, id)
    if (!bought.ok) continue
    assert.strictEqual(bought.state.trading.quotes, quotes)
    assert.strictEqual(bought.state.trading.history, history)
    const sold = v8SellTrade(bought.state, id, volume)
    assert.equal(sold.ok, true, id)
    if (!sold.ok) continue
    assert.strictEqual(sold.state.trading.quotes, quotes)
    assert.strictEqual(sold.state.trading.history, history)
    assert.ok(cents(sold.state.game.balance) < cents(start.game.balance), 'round trip pays fees')
    assert.equal(sold.state.trading.positions[id], undefined)
    const checked = validateExactV8State(sold.state,
      assetId => getAsset(assetId)?.quantityDecimals ?? null)
    assert.equal(checked.valid, true, checked.reason)
    assert.ok(asset.referencePrice > 0)
  }
})

test('buy and sell quotes have zero impact even for very large orders', () => {
  for (const id of ['nvideo', 'bitcoin', 'shiba-inu'] as const) {
    const asset = getAsset(id)!
    const base = asset.referencePrice
    const units = 10_000_000n * 10n ** BigInt(asset.quantityDecimals)
    const buy = liquidityQuote(asset, base, units, 'buy', 0n)!
    const sell = liquidityQuote(asset, base, units, 'sell', units)!
    assert.deepEqual(buy, { executionPrice: base, endingPrice: base, priceImpactPercent: 0 })
    assert.deepEqual(sell, { executionPrice: base, endingPrice: base, priceImpactPercent: 0 })
  }
})

test('MAX order uses public quote and fees, never overdraws wallet', () => {
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
