import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState } from '../capital.ts'
import { earnCapitalClick } from '../economy/stats-ledger.ts'
import { buyEnterprise, advanceEnterpriseIncome } from '../economy/enterprises.ts'
import { advanceCapitalSecond } from '../trading/dividends.ts'
import { buyAsset, sellAsset } from '../trading/trades.ts'
import { createSaveExport, prepareSaveImport } from '../save-transfer.ts'
import { getBonusBreakdown, getBonusMultiplier, getTotalBonusBps, scaleNewFameMicros, scaleRewardCents } from './bonuses.ts'
import { creditExperience, FAME_MICROS } from './state.ts'
import type { CapitalState } from '../capital.ts'
import type { FameBoostId } from './catalog.ts'

const NOW = 1_800_000_000_000
const fresh = () => createCapitalState(undefined, NOW)
function boosted(state: CapitalState, id: FameBoostId, level: number): CapitalState {
  return { ...state, prestige: { ...state.prestige, boosts: { ...state.prestige.boosts, [id]: level } } }
}
function owned(state: CapitalState, ...ids: string[]): CapitalState {
  return { ...state, prestige: { ...state.prestige, ownedCollectionIds: ids } }
}
function quoted(state: CapitalState, price: number): CapitalState {
  return { ...state, trading: { ...state.trading, quotes: {
    ...state.trading.quotes, nvideo: { price, momentum: 0, dividendYield: 0.05, updatedAt: NOW },
  } } }
}

test('six shared bonuses: zero, +5%, +100%, and collection +0.1% add without compounding', () => {
  for (const id of ['click', 'enterprise', 'dividend', 'trading', 'xp', 'fame'] as const) {
    assert.deepEqual(getBonusBreakdown(fresh(), id), { shopBps: 0, collectionBps: 0, totalBps: 0 })
    assert.equal(getBonusMultiplier(fresh(), id), 1)
    assert.equal(getTotalBonusBps(boosted(fresh(), id, 1), id), 500)
    assert.equal(getTotalBonusBps(boosted(fresh(), id, 20), id), 10000)
  }
  const mixed = owned(boosted(fresh(), 'click', 20), 'autos-01')
  assert.deepEqual(getBonusBreakdown(mixed, 'click'), {
    shopBps: 10000, collectionBps: 10, totalBps: 10010,
  })
  assert.equal(getBonusMultiplier(mixed, 'click'), 2.001)
  assert.equal(getTotalBonusBps(mixed, 'enterprise'), 0)
})

test('scaling a small +0.1% click keeps fractional cents until paid, never mints cash on XP-only credit', () => {
  const small = owned(fresh(), 'autos-01')
  let state = small
  for (let i = 0; i < 9; i++) state = earnCapitalClick(state)
  assert.equal(state.game.balance, 9)
  assert.equal(state.prestige.clickCarryBps, 9000)
  state = earnCapitalClick(state)
  assert.equal(state.game.balance, 10.01)
  assert.equal(state.game.lifetimeEarned, 10.01)
  assert.equal(state.prestige.clickCarryBps, 0)
  assert.equal(state.prestige.experienceCents, 1001)
  assert.equal(state.stats.earnedBySource.clicks, 10.01)
  const reloaded = restoreCapitalState(state, NOW)
  assert.deepEqual(reloaded, state)
  assert.deepEqual(prepareSaveImport(createSaveExport(state, NOW), NOW), {
    ok: true, preview: { state, sourceVersion: 6, exportedAt: NOW },
  })
  assert.deepEqual(scaleRewardCents(1, 10, 9990), { cents: 2, carryBps: 0 })
})

test('XP is independent and Fame bonus affects new level rewards, never retroactively', () => {
  const bonuses = boosted(boosted(fresh(), 'xp', 1), 'fame', 1)
  const crossed = creditExperience(bonuses, 3500)
  assert.ok(crossed)
  assert.equal(crossed.prestige.experienceCents, 3675)
  assert.equal(crossed.prestige.lastAwardedLevel, 2)
  assert.equal(crossed.prestige.fameMicros, 3_100_000)
  assert.equal(crossed.prestige.levelFameMicros, 3_100_000)
  assert.equal(crossed.game.lifetimeEarned, 0)
  assert.equal(crossed.game.balance, 0)
  assert.equal(scaleNewFameMicros(bonuses, 2 * FAME_MICROS), 2_100_000)
  assert.equal(scaleNewFameMicros(fresh(), 2 * FAME_MICROS), 2 * FAME_MICROS)
  const xpCollection = owned(fresh(), 'paintings-01')
  const scaled = creditExperience(xpCollection, 1000)
  assert.ok(scaled)
  assert.equal(scaled.prestige.experienceCents, 1001)
})

test('enterprise bonus affects gross credited cash, tax debt, XP and offline catch-up', () => {
  const funded = createCapitalState({ balance: 100_000, lifetimeEarned: 100_000, purchasedUpgrades: 0 }, NOW)
  const bought = buyEnterprise(funded, 'kiosque', NOW)
  assert.ok(bought.ok)
  const baseline = advanceEnterpriseIncome(bought.state, NOW + 3600_000)
  const withBonus = boosted(bought.state, 'enterprise', 1)
  const boostedHour = advanceEnterpriseIncome(withBonus, NOW + 3600_000)
  const plainGross = baseline.game.lifetimeEarned - bought.state.game.lifetimeEarned
  const boostedGross = boostedHour.game.lifetimeEarned - withBonus.game.lifetimeEarned
  assert.ok(Math.abs(boostedGross - plainGross * 1.05) < 0.02)
  assert.ok(boostedHour.fiscal.taxesDueCents > baseline.fiscal.taxesDueCents)
  assert.ok(boostedHour.prestige.experienceCents > baseline.prestige.experienceCents)
  assert.ok(boostedHour.stats.earnedBySource.enterprises > baseline.stats.earnedBySource.enterprises)
  const inTwoParts = advanceEnterpriseIncome(boostedHour, NOW + 7200_000)
  const atOnce = advanceEnterpriseIncome(withBonus, NOW + 7200_000)
  assert.equal(inTwoParts.game.balance, atOnce.game.balance)
  assert.equal(inTwoParts.fiscal.taxesDueCents, atOnce.fiscal.taxesDueCents)
  assert.equal(inTwoParts.prestige.fameMicros, atOnce.prestige.fameMicros)
  assert.strictEqual(advanceEnterpriseIncome(atOnce, NOW + 7200_000), atOnce)
})

test('dividend bonus is paid using existing fractional-cent carry, without creating taxes', () => {
  const seeded = createCapitalState({ balance: 20_000, lifetimeEarned: 20_000, purchasedUpgrades: 0 }, NOW)
  seeded.trading.positions.nvideo = { quantity: 1000, costBasis: 100 }
  const baseline = advanceCapitalSecond(seeded)
  const increased = advanceCapitalSecond(boosted(seeded, 'dividend', 20))
  const plainEarned = baseline.game.lifetimeEarned - seeded.game.lifetimeEarned
  const bonusEarned = increased.game.lifetimeEarned - seeded.game.lifetimeEarned
  assert.ok(bonusEarned >= plainEarned)
  assert.ok(bonusEarned > 0)
  assert.equal(increased.fiscal.taxesDueCents, baseline.fiscal.taxesDueCents)
  assert.ok(increased.prestige.experienceCents >= baseline.prestige.experienceCents)
})

test('trading only boosts positive NET sale profit; tax and cash include gain, basis and losses do not', () => {
  const funded = createCapitalState({ balance: 1000, lifetimeEarned: 1000, purchasedUpgrades: 0 }, NOW)
  const baseBuy = buyAsset(quoted(funded, 100), 'nvideo', 4)
  assert.ok(baseBuy.ok)
  const normal = sellAsset(quoted(baseBuy.state, 120), 'nvideo', 1)
  assert.ok(normal.ok)
  const boostedBuy = boosted(baseBuy.state, 'trading', 1)
  const sale = sellAsset(quoted(boostedBuy, 120), 'nvideo', 1)
  assert.ok(sale.ok)
  assert.equal(normal.receipt.netRealizedProfit, 18.9)
  assert.equal(sale.receipt.netRealizedProfit, 19.84)
  assert.equal(sale.receipt.cashChange - normal.receipt.cashChange, 0.94)
  assert.equal(sale.state.prestige.tradingCarryBps, 5000)
  assert.ok(sale.state.fiscal.taxesDueCents > normal.state.fiscal.taxesDueCents)
  assert.equal(sale.state.game.lifetimeEarned, 1019.84)
  assert.equal(sale.state.prestige.experienceCents, 101_984)
  const loss = sellAsset(quoted(sale.state, 80), 'nvideo', 3)
  assert.ok(loss.ok)
  assert.ok(loss.receipt.netRealizedProfit < 0)
  assert.equal(loss.state.game.lifetimeEarned, sale.state.game.lifetimeEarned)
  assert.equal(loss.state.prestige.tradingCarryBps, 5000)
})

test('v6 import accepts missing early carry fields but rejects negative ones', () => {
  const state = fresh()
  const legacy = JSON.parse(createSaveExport(state, NOW))
  delete legacy.state.prestige.clickCarryBps
  delete legacy.state.prestige.tradingCarryBps
  delete legacy.state.prestige.experienceCarryBps
  const imported = prepareSaveImport(JSON.stringify(legacy), NOW)
  assert.ok(imported.ok)
  assert.deepEqual(imported.preview.state.prestige, state.prestige)
  legacy.state.prestige.experienceCarryBps = -1
  assert.deepEqual(prepareSaveImport(JSON.stringify(legacy), NOW), { ok: false, error: 'invalid-save' })
})
