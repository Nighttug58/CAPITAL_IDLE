import test from 'node:test'
import assert from 'node:assert/strict'
import { createCapitalState } from './capital.ts'
import { createSaveExport } from './save-transfer.ts'
import { previewV8Migration } from './exact-save-migration.ts'
import { buyAsset } from './trading/trades.ts'
import { getAsset } from './trading/catalog.ts'
import { validateExactV8State } from './exact-save-validation.ts'

test('live v7 import/export preview to exact v8 without modifying the original', () => {
  const at = 1_800_000_000_000
  const initial = createCapitalState({ balance: 150000, lifetimeEarned: 150000, purchasedUpgrades: 0 }, at)
  const purchased = buyAsset(initial, 'turbo', 20_000)
  assert.equal(purchased.ok, true)
  if (!purchased.ok) return
  const source = createSaveExport(purchased.state, at)
  const migration = previewV8Migration(source, at)
  assert.equal(migration.ok, true, migration.ok ? '' : migration.error)
  if (!migration.ok) return
  const exported = JSON.parse(migration.v8Json)
  assert.equal(exported.state.version, 8)
  assert.equal(typeof exported.state.trading.positions.turbo.quantity, 'string')
  assert.equal(typeof exported.state.trading.positions.turbo.costBasis, 'string')
  assert.equal(validateExactV8State(exported.state, id => getAsset(id)?.quantityDecimals ?? null).valid, true)
  assert.equal(JSON.parse(source).state.version, 7)
})

test('preflight rejects invalid legacy saves without returning replacement', () => {
  const at = 1_800_000_000_000
  const legacy = JSON.parse(createSaveExport(createCapitalState(undefined, at), at))
  legacy.state.game.balance = 1e30
  const result = previewV8Migration(JSON.stringify(legacy), at)
  assert.equal(result.ok, false)
  assert.equal('convertedState' in result, false)
})
