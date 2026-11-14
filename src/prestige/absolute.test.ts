import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState, type CapitalState } from '../capital.ts'
import { getLevelStartThreshold } from '../game.ts'
import { earnCapitalClick } from '../economy/stats-ledger.ts'
import { buyEnterprise, advanceEnterpriseIncome } from '../economy/enterprises.ts'
import { advanceCapitalSecond } from '../trading/dividends.ts'
import { buyAsset, sellAsset } from '../trading/trades.ts'
import { createSaveExport, prepareSaveImport } from '../save-transfer.ts'
import { COLLECTION_BASE_FAME, COLLECTION_SLOTS, FAME_BOOST_IDS, FAME_BOOSTS, TOTAL_BASE_FAME_TO_LEVEL_100 } from './catalog.ts'
import { FAME_MICROS, creditExperience } from './state.ts'
import { getAbsolutePrestigeStatus } from './absolute.ts'
import { getBonusBreakdown, getBonusMultiplier, getTotalBonusBps, scaleNewFameMicros, scaleRewardCents } from './bonuses.ts'
import { getFameStatsOverview } from './overview.ts'
import { buyFameUpgrade, hasValidFameShopLedger } from './shop.ts'

const NOW = 1_800_000_000_000
const levelsAtMax = () => ({ click:20, enterprise:20, dividend:20, xp:20, trading:20, fame:20 })
function prestigeAt(fame: number, unlocked = true): CapitalState {
  const fresh = createCapitalState(undefined, NOW)
  return { ...fresh, prestige: {
    ...fresh.prestige, fameMicros: fame * FAME_MICROS,
    boosts: unlocked ? levelsAtMax() : { ...levelsAtMax(), fame: 19 },
  } }
}

/** Earns all 25 250 base Fame, buys all 120 tiers without a single boost reward. */
function fullyPurchased(): CapitalState {
  const threshold = getLevelStartThreshold(100)
  const levelled = createCapitalState({ balance: threshold, lifetimeEarned: threshold, purchasedUpgrades: 0 }, NOW)
  const baseline: CapitalState = {
    ...levelled, prestige: {
      ...levelled.prestige,
      fameMicros: TOTAL_BASE_FAME_TO_LEVEL_100 * FAME_MICROS,
      lifetimeFameMicros: TOTAL_BASE_FAME_TO_LEVEL_100 * FAME_MICROS,
      collectionFameMicros: COLLECTION_BASE_FAME * FAME_MICROS,
      ownedCollectionIds: COLLECTION_SLOTS.map(slot => slot.id),
    },
  }
  let state = baseline
  for (const boost of FAME_BOOSTS) {
    for (let level = 0; level < 20; level++) {
      const result = buyFameUpgrade(state, boost.id, level)
      assert.ok(result.ok, boost.id + ':' + level)
      state = result.state
    }
  }
  assert.equal(state.prestige.fameMicros / FAME_MICROS, 600)
  assert.ok(hasValidFameShopLedger(state))
  return state
}

test('Prestige absolu is free, automatically locked until exactly 120/120 and not persistent', () => {
  const fresh = createCapitalState(undefined, NOW)
  assert.deepEqual(getAbsolutePrestigeStatus(fresh), {
    unlocked: false, purchasedLevels: 0, requiredLevels: 120,
    fameSteps: 0, nextStepAtFame: 100, factor: 1, overflowed: false,
  })
  for (const id of FAME_BOOST_IDS) {
    const almost = { ...fresh, prestige: { ...fresh.prestige, boosts: { ...levelsAtMax(), [id]: 19 }, fameMicros: 1000 * FAME_MICROS } }
    const status = getAbsolutePrestigeStatus(almost)
    assert.equal(status.unlocked, false, id)
    assert.equal(status.purchasedLevels, 119)
    assert.equal(status.factor, 1)
  }
  const bought = fullyPurchased()
  const status = getAbsolutePrestigeStatus(bought)
  assert.equal(status.unlocked, true)
  assert.equal(status.purchasedLevels, 120)
  assert.equal(status.fameSteps, 6)
  assert.equal(status.nextStepAtFame, 700)
  assert.equal(status.factor, 1.01 ** 6)
  assert.equal(status.overflowed, false)
  assert.equal((bought.prestige as unknown as Record<string,unknown>).absolutePrestige, undefined)
})

test('exact 1.01^floor(available Fame / 100) at 0, 99, 100, 500, 600, 1000 and 10000', () => {
  for (const fame of [0, 99, 99.999999, 100, 199.99, 500, 599.99, 600, 1000, 10_000]) {
    const status = getAbsolutePrestigeStatus(prestigeAt(fame))
    const steps = Math.floor(fame / 100)
    assert.equal(status.fameSteps, steps)
    assert.equal(status.factor, 1.01 ** steps)
    assert.equal(status.nextStepAtFame, (steps + 1) * 100)
    assert.equal(status.overflowed, false)
  }
  assert.equal(getAbsolutePrestigeStatus(prestigeAt(100, false)).factor, 1)
  assert.equal(getAbsolutePrestigeStatus(prestigeAt(10_000, false)).factor, 1)
})

test('Shop bonus is multiplied, collection bonus is added, not multiplied', () => {
  const state = fullyPurchased()
  const status = getAbsolutePrestigeStatus(state)
  const overview = getFameStatsOverview(state)
  assert.equal(overview.available, 600)
  assert.equal(overview.earned, 25_250)
  assert.equal(overview.spent, 24_650)
  assert.equal(overview.fromLevels, 5050)
  assert.equal(overview.fromCollections, 20_200)
  assert.equal(overview.ownedCollections, 50)
  assert.equal(overview.boosts.length, 6)
  for (const boost of overview.boosts) {
    const breakdown = getBonusBreakdown(state, boost.id as typeof FAME_BOOST_IDS[number])
    assert.equal(boost.level, 20)
    assert.equal(breakdown.shopBps, 10_000)
    assert.equal(boost.prestigeShopBps, 10_000 * status.factor)
    assert.equal(boost.collectionBps, breakdown.collectionBps)
    assert.equal(boost.totalBps, 10_000 * status.factor + breakdown.collectionBps)
    assert.equal(getTotalBonusBps(state, boost.id as typeof FAME_BOOST_IDS[number]), boost.totalBps)
    assert.equal(getBonusMultiplier(state, boost.id as typeof FAME_BOOST_IDS[number]), 1 + boost.totalBps / 10_000)
  }
  const owned = state.prestige.ownedCollectionIds
  assert.ok(owned.length > 0)
  const totalCollectionBps = overview.boosts.reduce((sum, item) => sum + item.collectionBps, 0)
  assert.equal(totalCollectionBps, COLLECTION_SLOTS.reduce((sum, slot) => sum + slot.bonusBps, 0))
})

test('bonus precision: under-cent carry survives dynamic factors, legacy integer rates stay exact', () => {
  assert.deepEqual(scaleRewardCents(1, 10, 9_990), { cents:2, carryBps:0 })
  assert.deepEqual(scaleRewardCents(100, 500), { cents:105, carryBps:0 })
  const state = prestigeAt(600)
  const bonus = getTotalBonusBps(state, 'click')
  assert.equal(bonus, 10_000 * 1.01 ** 6)
  const scaled = scaleRewardCents(100, bonus)
  assert.ok(scaled)
  assert.equal(scaled.cents, 206)
  assert.ok(scaled.carryBps > 1500 && scaled.carryBps < 1600)
  let carry = 0, grossCents = 0
  for (let i = 0; i < 1_000; i++) {
    const reward = scaleRewardCents(100, bonus, carry)
    assert.ok(reward)
    carry = reward.carryBps
    grossCents += reward.cents
  }
  const ideal = 1000 * 100 * (1 + bonus / 10_000)
  assert.ok(Math.abs(grossCents - ideal) <= 1, 'small fractional errors do not accumulate materially')
  assert.equal(scaleRewardCents(1, Number.POSITIVE_INFINITY), null)
  assert.equal(scaleNewFameMicros(state, FAME_MICROS), Math.floor(FAME_MICROS * (1 + bonus / 10_000)))
})

test('six live engines use Prestige: click, enterprise gross/tax, dividend, trading, XP and Fame', () => {
  const state = fullyPurchased()
  const locked = { ...state, prestige: { ...state.prestige, boosts: { ...state.prestige.boosts, fame: 19 } } }
  const clicked = earnCapitalClick(state)
  const clickedLocked = earnCapitalClick(locked)
  assert.ok(clicked.game.balance > clickedLocked.game.balance)
  assert.ok(clicked.prestige.experienceCents > clickedLocked.prestige.experienceCents)
  assert.ok(clicked.stats.earnedBySource.clicks > clickedLocked.stats.earnedBySource.clicks)

  const original = buyEnterprise(state, 'kiosque', NOW)
  const old = buyEnterprise(locked, 'kiosque', NOW)
  assert.ok(original.ok && old.ok)
  const income = advanceEnterpriseIncome(original.state, NOW + 3_600_000)
  const incomeLocked = advanceEnterpriseIncome(old.state, NOW + 3_600_000)
  assert.ok(income.game.lifetimeEarned > incomeLocked.game.lifetimeEarned)
  assert.ok(income.fiscal.taxesDueCents > incomeLocked.fiscal.taxesDueCents)
  assert.ok(income.prestige.experienceCents > incomeLocked.prestige.experienceCents)

  const dividendState = { ...state, trading: { ...state.trading,
    positions: { ...state.trading.positions, nvideo: { quantity: 1_000_000, costBasis: 100 } },
  } }
  const dividendLocked = { ...locked, trading: dividendState.trading }
  const dividend = advanceCapitalSecond(dividendState)
  const plainDividend = advanceCapitalSecond(dividendLocked)
  assert.ok(dividend.game.lifetimeEarned > plainDividend.game.lifetimeEarned)

  function quote(s: CapitalState, price: number) {
    return { ...s, trading: { ...s.trading, quotes: {
      ...s.trading.quotes, nvideo: { price, momentum: 0, dividendYield: 0.05, updatedAt: NOW },
    } } }
  }
  const bought = buyAsset(quote(state, 100), 'nvideo', 5)
  const boughtLocked = buyAsset(quote(locked, 100), 'nvideo', 5)
  assert.ok(bought.ok && boughtLocked.ok)
  const sold = sellAsset(quote(bought.state, 120), 'nvideo', 1)
  const soldLocked = sellAsset(quote(boughtLocked.state, 120), 'nvideo', 1)
  assert.ok(sold.ok && soldLocked.ok)
  assert.ok(sold.receipt.netRealizedProfit > soldLocked.receipt.netRealizedProfit)
  assert.ok(sold.state.fiscal.taxesDueCents > soldLocked.state.fiscal.taxesDueCents)

  const xp = creditExperience(state, 1_000)
  const xpLocked = creditExperience(locked, 1_000)
  assert.ok(xp && xpLocked)
  assert.ok(xp.prestige.experienceCents > xpLocked.prestige.experienceCents)
  const futureFame = scaleNewFameMicros(state, 101 * FAME_MICROS)
  const futureLocked = scaleNewFameMicros(locked, 101 * FAME_MICROS)
  assert.ok(futureFame !== null && futureLocked !== null && futureFame > futureLocked)
  assert.equal(state.prestige.levelFameMicros, 5050 * FAME_MICROS, 'prestige has no retroactive reward')
})

test('Prestige factor is recalculated on new Fame, with no new state/clock or refund', () => {
  const state = fullyPurchased()
  const before = getAbsolutePrestigeStatus(state)
  const newXp = (getLevelStartThreshold(101) - getLevelStartThreshold(100)) * 100
  const gained = creditExperience(state, newXp)
  assert.ok(gained)
  assert.equal(gained.prestige.lastAwardedLevel, 101)
  assert.ok(gained.prestige.fameMicros > state.prestige.fameMicros)
  assert.ok(getAbsolutePrestigeStatus(gained).fameSteps > before.fameSteps)
  assert.equal(gained.game.balance, state.game.balance)
  assert.equal(gained.fiscal.taxesDueCents, state.fiscal.taxesDueCents)
  assert.equal(gained.prestige.collectionFameMicros, state.prestige.collectionFameMicros)
  assert.equal(state.prestige.lastAwardedLevel, 100)
  assert.equal(getAbsolutePrestigeStatus(state).factor, 1.01 ** 6)
})

test('same-session, reload, strict v6 export/import, v5 migration and reset always derive unlock', () => {
  const state = fullyPurchased()
  const restored = restoreCapitalState(JSON.parse(JSON.stringify(state)), NOW)
  assert.deepEqual(restored, state)
  assert.equal(getAbsolutePrestigeStatus(restored).unlocked, true)
  const imported = prepareSaveImport(createSaveExport(state, NOW), NOW)
  assert.ok(imported.ok)
  assert.equal(getAbsolutePrestigeStatus(imported.preview.state).factor, 1.01 ** 6)
  assert.deepEqual(imported.preview.state, state)
  const { prestige: _unused, ...legacy } = createCapitalState({
    balance: 500, lifetimeEarned: 10_000, purchasedUpgrades: 0,
  }, NOW)
  void _unused
  const migrated = restoreCapitalState({ ...legacy, version: 5 }, NOW)
  assert.equal(getAbsolutePrestigeStatus(migrated).unlocked, false)
  assert.equal(migrated.prestige.boosts.fame, 0)
  assert.equal(getAbsolutePrestigeStatus(createCapitalState(undefined, NOW)).unlocked, false)
  assert.equal(prepareSaveImport(createSaveExport(state, NOW), NOW).ok, true)
})

test('extreme Fame never produces NaN cash, XP or Fame or crashes BigInt conversion', () => {
  const unsafe = prestigeAt(9_000_000_000)
  const status = getAbsolutePrestigeStatus(unsafe)
  assert.equal(status.unlocked, true)
  assert.equal(status.overflowed, true)
  assert.equal(status.factor, Infinity)
  assert.equal(getBonusMultiplier(unsafe, 'click'), Infinity)
  assert.equal(scaleRewardCents(100, getTotalBonusBps(unsafe, 'click')), null)
  assert.equal(scaleNewFameMicros(unsafe, FAME_MICROS), null)
  assert.strictEqual(earnCapitalClick(unsafe), unsafe)
  const dividendState = { ...unsafe, trading: { ...unsafe.trading,
    positions: { ...unsafe.trading.positions, nvideo: { quantity:100, costBasis:100 } },
  } }
  assert.strictEqual(advanceCapitalSecond(dividendState), dividendState)
  const smaller = prestigeAt(10_000)
  assert.ok(Number.isFinite(getTotalBonusBps(smaller, 'click')))
  assert.ok(scaleRewardCents(100, getTotalBonusBps(smaller, 'click')))
})
