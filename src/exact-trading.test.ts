import test from 'node:test'
import assert from 'node:assert/strict'
import {
  quoteToExactFraction, exactTradeCost, quantityStringToUnits,
  affordableExactQuantity, divideCostBasis,
} from './exact-trading.ts'

test('v8 exact trading quote conversion and stock fee reproduce present rules', () => {
  const quote = quoteToExactFraction(166.19)!
  assert.deepEqual(quote, { numerator: 16619n, denominator: 100n })
  const quantity = quantityStringToUnits('2', 4)!
  assert.equal(quantity, 20_000n)
  const buy = exactTradeCost(quote, quantity, 4, 50n, 'buy')!
  assert.equal(buy.grossCents, 33238n)
  assert.equal(buy.feeCents, 167n)
  assert.equal(buy.totalCents, 33405n)
  const sell = exactTradeCost(quote, quantity, 4, 50n, 'sell')!
  assert.equal(sell.proceedsCents, 33071n)
})

test('prices below one cent, fraction of tokens and tiny residual sales', () => {
  const price = quoteToExactFraction(0.00000434)!
  const qty = quantityStringToUnits('2500', 0)!
  const buy = exactTradeCost(price, qty, 0, 150n, 'buy')!
  assert.equal(buy.grossCents, 2n)
  assert.equal(buy.feeCents, 1n)
  assert.equal(buy.totalCents, 3n)
  const sell = exactTradeCost(price, qty, 0, 150n, 'sell')!
  assert.equal(sell.grossCents, 1n)
  assert.equal(sell.proceedsCents, 0n)
  assert.equal(exactTradeCost(price, 1n, 0, 150n, 'sell')!.proceedsCents, 0n)
  assert.equal(quoteToExactFraction(1e-9)?.numerator, 1n)
  assert.equal(quoteToExactFraction(Number.POSITIVE_INFINITY), null)
})

test('trading at 1AA/1AB with fee and no volume caps or slippage', () => {
  const cash = 10n ** 105n
  const q = quoteToExactFraction(69_448)!
  const units = affordableExactQuantity(cash, q, 8, 100n)
  assert.ok(units > 10n ** 90n)
  const cost = exactTradeCost(q, units, 8, 100n, 'buy')!
  assert.ok(cost.totalCents <= cash)
  const next = exactTradeCost(q, units + 1n, 8, 100n, 'buy')!
  assert.ok(next.totalCents > cash)
  assert.equal(exactTradeCost(q, units, 8, 100n, 'sell')!.grossCents > 10n ** 95n, true)
})

test('cost basis allocation never manufactures cents across repeated sales', () => {
  let basis = 10n ** 106n + 1n
  let count = 9n
  for (let i = 0; i < 8; i++) {
    const [sold, left] = divideCostBasis(basis, 1n, count)
    assert.equal(sold + left, basis)
    basis = left
    count--
  }
  const [sold, remainder] = divideCostBasis(basis, 1n, 1n)
  assert.equal(sold, basis)
  assert.equal(remainder, 0n)
  assert.throws(() => divideCostBasis(1n, 2n, 1n))
})
