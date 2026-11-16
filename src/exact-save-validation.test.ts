import test from 'node:test'
import assert from 'node:assert/strict'
import { createCapitalState } from './capital.ts'
import { getAsset } from './trading/catalog.ts'
import { projectValidatedV7ToExactV8 } from './exact-save-v8.ts'
import { validateExactV8State } from './exact-save-validation.ts'
import { buyAsset } from './trading/trades.ts'

const decimals = (id: string) => getAsset(id)?.quantityDecimals ?? null
function snap() {
  const at = 1_800_000_000_000
  const initial = createCapitalState({balance: 100_000, lifetimeEarned: 100_000, purchasedUpgrades: 0}, at)
  const bought = buyAsset(initial, 'nvideo', 2)
  assert.equal(bought.ok, true)
  if (!bought.ok) throw Error('Trade setup failed')
  return projectValidatedV7ToExactV8(bought.state, decimals)
}

test('valid real v7 game with trading positions converts into canonical v8', () => {
  const converted = snap()
  assert.deepEqual(validateExactV8State(converted, decimals), {valid: true})
  assert.equal(validateExactV8State(JSON.parse(JSON.stringify(converted)), decimals).valid, true)
})

test('v8 rejects corrupt and forged ledgers, even when numbers exceed 1e100', () => {
  const value = snap()
  const altered = JSON.parse(JSON.stringify(value))
  altered.game.balance = '1' + '0'.repeat(120)
  assert.equal(validateExactV8State(altered, decimals).valid, false)
  const tax = JSON.parse(JSON.stringify(value))
  tax.fiscal.taxesDueCents = '100'
  assert.equal(validateExactV8State(tax, decimals).valid, false)
  const stakes = JSON.parse(JSON.stringify(value))
  stakes.trading.staking.positions.nvideo = {
    locked: '30000', unlocking: '0', awaitingCompound: '0', rewardHeld: '0',
    rewardLocked: '0', rewardUnlocking: '0', lifetimeRewards: '0',
  }
  assert.equal(validateExactV8State(stakes, decimals).valid, false)
  const fame = JSON.parse(JSON.stringify(value))
  fame.prestige.fameMicros = '99999999999999999999999999999999'
  assert.equal(validateExactV8State(fame, decimals).valid, false)
  const pp = JSON.parse(JSON.stringify(value))
  pp.ascension.progress.availablePoints = '1000000000000000000000000000'
  assert.equal(validateExactV8State(pp, decimals).valid, false)
  const leading = JSON.parse(JSON.stringify(value))
  leading.trading.positions.nvideo.quantity = '020000'
  assert.equal(validateExactV8State(leading, decimals).valid, false)
})

test('v8 allows genuinely very large balances when reconciled against earnings', () => {
  const state = snap()
  const enormous = '1' + '0'.repeat(110)
  ;(state.game as Record<string, unknown>).balance = enormous
  ;(state.game as Record<string, unknown>).lifetimeEarned = enormous
  assert.equal(validateExactV8State(state, decimals).valid, true)
})
