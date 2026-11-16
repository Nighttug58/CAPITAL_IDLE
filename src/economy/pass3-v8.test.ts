import test from 'node:test'
import assert from 'node:assert/strict'
import { createCapitalState } from '../capital.ts'
import { createV8CapitalState, convertValidatedV7ToV8, getExactAmount as cents } from '../exact-state-v8.ts'
import { v8AccrueEnterpriseUntil, v8AdvanceFiscalEconomy, v8BuyEnterprise } from '../exact-runtime-v8.ts'
import { getEnterpriseIncomeMicrosPerSecondExact, getEnterpriseUpgradeCostCentsExact } from './catalog.ts'
import { validateExactV8State } from '../exact-save-validation.ts'
import { saveV8CapitalState, loadV8CapitalState, exportV8Save, prepareV8SaveImport } from '../exact-persistence-v8.ts'
import { getAsset } from '../trading/catalog.ts'
import { FISCAL_PERIOD_MS } from './state.ts'

const START = 1_800_000_000_000
const wealth = 10n ** 110n
const seeded = (level = 20) => {
  const base = createV8CapitalState(START)
  return {
    ...base,
    game: { ...base.game, balance: wealth.toString(), lifetimeEarned: wealth.toString() },
    enterprises: { ...base.enterprises, owned: { kiosque: { level, investedCents: '192620302' } } },
  }
}
const validate = (state: ReturnType<typeof seeded>) =>
  validateExactV8State(state, id => getAsset(id)?.quantityDecimals ?? null)

test('V8 upgrades business 20 -> 21 -> 22 without a company cap and with exact invested book value', () => {
  const state = seeded(20)
  const first = v8BuyEnterprise(state, 'kiosque', START, true)
  assert.equal(first.ok, true)
  if (!first.ok) return
  assert.equal(first.state.enterprises.owned.kiosque.level, 21)
  assert.equal(first.costCents, getEnterpriseUpgradeCostCentsExact('kiosque', 20))
  assert.equal(cents(first.state.enterprises.owned.kiosque.investedCents), 192620302n + first.costCents)
  assert.equal(cents(first.state.game.balance), wealth - first.costCents)
  const second = v8BuyEnterprise(first.state, 'kiosque', START, true)
  assert.equal(second.ok, true)
  if (!second.ok) return
  assert.equal(second.state.enterprises.owned.kiosque.level, 22)
  assert.ok(second.costCents > first.costCents)
  assert.equal(cents(second.state.game.balance), wealth - first.costCents - second.costCents)
  assert.equal(cents(second.state.game.lifetimeEarned), wealth, 'upgrading is not eligible XP income')
  const checked = validate(second.state)
  assert.equal(checked.valid, true, checked.reason)
})

test('level 1000 earns beyond Number safe limit, accrual is exact and cannot double credit', () => {
  const state = seeded(1000)
  const rate = getEnterpriseIncomeMicrosPerSecondExact('kiosque', 1000)!
  assert.ok(rate > 10n ** 14n)
  const next = v8AccrueEnterpriseUntil(state, START + 123_456)
  const whole = rate * 123_456n / 10_000_000n
  const carry = rate * 123_456n % 10_000_000n
  assert.equal(cents(next.game.balance) - cents(state.game.balance), whole)
  assert.equal(cents(next.enterprises.revenueCarryNanoCents!), carry)
  assert.equal(cents(next.fiscal.taxesDueCents), whole * 1_500n / 10_000n)
  assert.equal(cents(next.prestige.experienceCents) > 0n, true)
  assert.strictEqual(v8AccrueEnterpriseUntil(next, START + 123_456), next)
  assert.equal(validate(next).valid, true, validate(next).reason)
})

test('one-shot 72h+offline catch-up is equivalent to splitting at the real fiscal boundary', () => {
  const base = seeded(100)
  const end = START + FISCAL_PERIOD_MS + 12_345
  const whole = v8AdvanceFiscalEconomy(base, end)
  const split = v8AdvanceFiscalEconomy(v8AdvanceFiscalEconomy(base, START + FISCAL_PERIOD_MS), end)
  for (const key of ['balance', 'lifetimeEarned'] as const)
    assert.equal(whole.game[key], split.game[key])
  for (const key of ['taxesPaidCents', 'taxesDueCents'] as const)
    assert.equal(whole.fiscal[key], split.fiscal[key])
  assert.equal(whole.prestige.experienceCents, split.prestige.experienceCents)
  assert.equal(whole.stats.earnedBySource.enterprises, split.stats.earnedBySource.enterprises)
  assert.equal(whole.fiscal.periodStartedAt, START + FISCAL_PERIOD_MS)
  assert.equal(validate(whole).valid, true, validate(whole).reason)
})

test('V8 preserves level 1000 and enormous invested cost through save, reload and import/export', () => {
  const base = seeded(1000)
  const upgraded = v8BuyEnterprise(base, 'kiosque', START, true)
  assert.equal(upgraded.ok, true)
  if (!upgraded.ok) return
  const state = v8AccrueEnterpriseUntil(upgraded.state, START + 1000)
  const storage = new Map<string,string>()
  const store = { getItem: (key:string) => storage.get(key) ?? null,
    setItem: (key:string,value:string) => { storage.set(key,value) } }
  assert.equal(saveV8CapitalState(store,state),true)
  const loaded = loadV8CapitalState(store,START+1000)
  assert.equal(loaded.ok,true)
  if (!loaded.ok) return
  assert.equal(loaded.state.enterprises.owned.kiosque.level,1001)
  assert.equal(loaded.state.enterprises.owned.kiosque.investedCents,
    state.enterprises.owned.kiosque.investedCents)
  assert.equal(loaded.state.game.balance,state.game.balance)
  const restored = prepareV8SaveImport(exportV8Save(loaded.state,START+1000),START+1000)
  assert.equal(restored.ok,true)
  if (restored.ok) assert.deepEqual(restored.state, state)
})

test('old V7 company remains owned at original book value and receives only future new rates', () => {
  const initial = createCapitalState({ balance: 1_000_000, lifetimeEarned: 1_000_000, purchasedUpgrades: 0 }, START)
  initial.enterprises.owned.kiosque = {level:20, investedCents:987_654_321}
  const migrated = convertValidatedV7ToV8(initial)
  assert.equal(migrated.enterprises.owned.kiosque.level,20)
  assert.equal(migrated.enterprises.owned.kiosque.investedCents,'987654321')
  const before = cents(migrated.game.balance)
  const after = v8AccrueEnterpriseUntil(migrated,START+1000)
  assert.ok(cents(after.game.balance)>before)
  assert.equal(after.enterprises.owned.kiosque.investedCents,'987654321')
  assert.equal(validate(after).valid,true,validate(after).reason)
})
