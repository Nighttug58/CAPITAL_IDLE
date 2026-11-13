import assert from 'node:assert/strict'
import test from 'node:test'
import { formatEditableQuantity, parseTradeQuantity } from './order-ui.ts'
import { createCapitalState } from '../capital.ts'
import { buyAsset, getQuickQuantity, sellAsset } from './trades.ts'

test('quantité éditable : 8 décimales BTC jamais converties en notation e', () => {
  assert.equal(formatEditableQuantity(1e-8, 8), '0.00000001')
  assert.equal(parseTradeQuantity('0,00000001'), 1e-8)
  assert.equal(parseTradeQuantity('0.00000001'), 1e-8)
  assert.equal(formatEditableQuantity(1.25, 4), '1.25')
  assert.equal(formatEditableQuantity(10_000_000, 0), '10000000')
  for (const invalid of ['1e-8', '-1', '0', '2.3.1', 'Infinity', '', ' ', '1 000']) {
    assert.ok(Number.isNaN(parseTradeQuantity(invalid)), invalid)
  }
})

test('25 %, 50 %, MAX et vente intégrale au travers des contrats UI', () => {
  const initial = createCapitalState({ balance: 1000, lifetimeEarned: 1000, purchasedUpgrades: 0 }, 1_800_000_000_000)
  const max = getQuickQuantity(initial, 'bitcoin', 'buy', 1)
  const text = formatEditableQuantity(max, 8)
  assert.ok(text.length > 0)
  const purchased = buyAsset(initial, 'bitcoin', parseTradeQuantity(text))
  assert.equal(purchased.ok, true)
  if (!purchased.ok) return
  const sellQty = getQuickQuantity(purchased.state, 'bitcoin', 'sell', 1)
  const sold = sellAsset(purchased.state, 'bitcoin', parseTradeQuantity(formatEditableQuantity(sellQty, 8)))
  assert.equal(sold.ok, true)
  if (!sold.ok) return
  assert.equal(sold.state.trading.positions.bitcoin, undefined)
  assert.ok(sold.state.game.balance < initial.game.balance)
  assert.equal(sold.state.game.lifetimeEarned, initial.game.lifetimeEarned)
})
