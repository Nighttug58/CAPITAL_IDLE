import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState, type CapitalState } from '../capital.ts'
import { getLevelStartThreshold } from '../game.ts'
import { earnCapitalClick } from '../economy/stats-ledger.ts'
import { loadCapitalState, saveCapitalState } from '../persistence.ts'
import { createSaveExport, prepareSaveImport } from '../save-transfer.ts'
import {
  COLLECTION_BASE_FAME, COLLECTION_SLOTS, FAME_BOOSTS, FAME_BOOST_IDS,
  FAME_BOOST_BPS_PER_LEVEL, LEVEL_100_BASE_FAME, MAX_FAME_BOOST_LEVEL,
  TOTAL_BASE_FAME_TO_LEVEL_100, TOTAL_FAME_SHOP_COST,
  getNextFameBoostCost, getPurchasedFameBoostCost,
} from './catalog.ts'
import { getBonusBreakdown } from './bonuses.ts'
import { buyFameUpgrade, getFameShopOffer, getFameShopOffers, hasValidFameShopLedger } from './shop.ts'
import { creditExperience, FAME_MICROS } from './state.ts'

const NOW = 1_800_000_000_000
const fresh = (): CapitalState => createCapitalState(undefined, NOW)

/** Synthetic endgame snapshot using the exact level-100 and 50-collection rewards. */
function completeCollectionFixture(): CapitalState {
  const threshold = getLevelStartThreshold(100)
  const levelled = createCapitalState({
    balance: threshold, lifetimeEarned: threshold, purchasedUpgrades: 0,
  }, NOW)
  assert.equal(levelled.prestige.lastAwardedLevel, 100)
  assert.equal(levelled.prestige.levelFameMicros, LEVEL_100_BASE_FAME * FAME_MICROS)
  return {
    ...levelled,
    prestige: {
      ...levelled.prestige,
      fameMicros: TOTAL_BASE_FAME_TO_LEVEL_100 * FAME_MICROS,
      lifetimeFameMicros: TOTAL_BASE_FAME_TO_LEVEL_100 * FAME_MICROS,
      collectionFameMicros: COLLECTION_BASE_FAME * FAME_MICROS,
      ownedCollectionIds: COLLECTION_SLOTS.map((slot) => slot.id),
    },
  }
}

function unchanged(result: ReturnType<typeof buyFameUpgrade>, state: CapitalState, error: string): void {
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error, error)
  assert.strictEqual(result.state, state)
}

test('Fame Shop exposes six current offers with canonical price, +5% per tier and 20 levels', () => {
  assert.equal(getFameShopOffers(fresh()).length, 6)
  assert.deepEqual(getFameShopOffers(fresh()).map((offer) => offer.boostId), FAME_BOOST_IDS)
  for (const boost of FAME_BOOSTS) {
    const offer = getFameShopOffer(fresh(), boost.id)
    assert.ok(offer)
    assert.equal(offer.currentLevel, 0)
    assert.equal(offer.maxLevel, MAX_FAME_BOOST_LEVEL)
    assert.equal(offer.currentBonusBps, 0)
    assert.equal(offer.nextBonusBps, FAME_BOOST_BPS_PER_LEVEL)
    assert.equal(offer.nextCostFame, boost.id === 'fame' ? 70 : 52)
    assert.equal(offer.canAfford, false)
    assert.equal(boost.costs.length, 20)
  }
  assert.equal(getFameShopOffer(fresh(), 'not-a-boost'), null)
  assert.equal(getNextFameBoostCost('click', 19), 337)
  assert.equal(getNextFameBoostCost('fame', 19), 450)
  assert.equal(getPurchasedFameBoostCost(fresh().prestige.boosts), 0)
  assert.equal(getPurchasedFameBoostCost({ ...fresh().prestige.boosts, click: 21 }), null)
  assert.equal(getPurchasedFameBoostCost({ ...fresh().prestige.boosts, xp: -1 }), null)
})

test('one purchase debits exactly one tier, changes only Fame/boost and affects future income', () => {
  const initial = createCapitalState({
    balance: 100, lifetimeEarned: getLevelStartThreshold(20), purchasedUpgrades: 0,
  }, NOW)
  const beforeJSON = JSON.stringify(initial)
  const preCash = initial.game.balance
  const preXp = initial.prestige.experienceCents
  const preStats = initial.stats
  const preFiscal = initial.fiscal
  const preTrading = initial.trading
  const preEnterprise = initial.enterprises
  const receipt = buyFameUpgrade(initial, 'click', 0)
  assert.ok(receipt.ok)
  assert.equal(receipt.receipt.boostId, 'click')
  assert.equal(receipt.receipt.previousLevel, 0)
  assert.equal(receipt.receipt.newLevel, 1)
  assert.equal(receipt.receipt.previousBonusBps, 0)
  assert.equal(receipt.receipt.newBonusBps, 500)
  assert.equal(receipt.receipt.costFame, 52)
  assert.equal(receipt.receipt.costMicros, 52 * FAME_MICROS)
  assert.equal(receipt.receipt.remainingFameMicros, (210 - 52) * FAME_MICROS)
  assert.equal(receipt.state.prestige.boosts.click, 1)
  assert.equal(receipt.state.prestige.fameMicros, receipt.receipt.remainingFameMicros)
  assert.equal(receipt.state.prestige.lifetimeFameMicros, initial.prestige.lifetimeFameMicros)
  assert.equal(receipt.state.prestige.experienceCents, preXp)
  assert.equal(receipt.state.game.balance, preCash)
  assert.strictEqual(receipt.state.stats, preStats)
  assert.strictEqual(receipt.state.fiscal, preFiscal)
  assert.strictEqual(receipt.state.trading, preTrading)
  assert.strictEqual(receipt.state.enterprises, preEnterprise)
  assert.equal(JSON.stringify(initial), beforeJSON, 'input remains untouched')
  assert.equal(getBonusBreakdown(receipt.state, 'click').shopBps, 500)
  assert.equal(getFameShopOffer(receipt.state, 'click')?.nextCostFame, 67)
  assert.equal(getFameShopOffer(receipt.state, 'click')?.canAfford, true)
  const earned = earnCapitalClick(receipt.state)
  assert.equal(earned.game.balance, preCash + 1.05)
  assert.equal(earned.game.lifetimeEarned, initial.game.lifetimeEarned + 1.05)
})

test('replayed UI click cannot charge the same tier twice, while an explicit next tier can', () => {
  const initial = createCapitalState({
    balance: 0, lifetimeEarned: getLevelStartThreshold(20), purchasedUpgrades: 0,
  }, NOW)
  const first = buyFameUpgrade(initial, 'click', 0)
  assert.ok(first.ok)
  unchanged(buyFameUpgrade(first.state, 'click', 0), first.state, 'stale-level')
  unchanged(buyFameUpgrade(first.state, 'click', -1), first.state, 'stale-level')
  unchanged(buyFameUpgrade(first.state, 'click', NaN), first.state, 'stale-level')
  unchanged(buyFameUpgrade(first.state, 'click', 1.5), first.state, 'stale-level')
  const next = buyFameUpgrade(first.state, 'click', 1)
  assert.ok(next.ok)
  assert.equal(next.receipt.costFame, 67)
  assert.equal(next.state.prestige.boosts.click, 2)
  assert.equal(next.state.prestige.fameMicros, (210 - 52 - 67) * FAME_MICROS)
  assert.equal(initial.prestige.boosts.click, 0)
})

test('unknown, insufficient Fame, invalid ledger and zero cash do not allow credit spending', () => {
  const initial = fresh()
  unchanged(buyFameUpgrade(initial, 'alien', 0), initial, 'unknown-boost')
  unchanged(buyFameUpgrade(initial, 'click', 0), initial, 'insufficient-fame')
  unchanged(buyFameUpgrade(initial, 'fame', 0), initial, 'insufficient-fame')

  const corrupt = {
    ...initial,
    prestige: { ...initial.prestige, fameMicros: -1 },
  }
  assert.equal(hasValidFameShopLedger(corrupt), false)
  unchanged(buyFameUpgrade(corrupt, 'click', 0), corrupt, 'invalid-state')
  assert.equal(getFameShopOffer(corrupt, 'click')?.canAfford, false)

  // The Fame Shop deliberately ignores cash, including a fiscal cash debt.
  const level11 = getLevelStartThreshold(11)
  const taxDebtor = createCapitalState({
    balance: -13.37, lifetimeEarned: level11, purchasedUpgrades: 0,
  }, NOW)
  assert.equal(taxDebtor.prestige.fameMicros, 66 * FAME_MICROS)
  const purchase = buyFameUpgrade(taxDebtor, 'click', 0)
  assert.ok(purchase.ok)
  assert.equal(purchase.state.game.balance, -13.37)
  assert.deepEqual(purchase.state.fiscal, taxDebtor.fiscal)
  assert.equal(purchase.state.prestige.fameMicros, 14 * FAME_MICROS)
  unchanged(buyFameUpgrade(purchase.state, 'click', 1), purchase.state, 'insufficient-fame')
})

test('Fame fractions survive purchases and Notoriété never credits Fame retroactively', () => {
  const base = createCapitalState({
    balance: 100, lifetimeEarned: getLevelStartThreshold(20), purchasedUpgrades: 0,
  }, NOW)
  const notoriety = buyFameUpgrade(base, 'fame', 0)
  assert.ok(notoriety.ok)
  assert.equal(notoriety.state.prestige.fameMicros, 140 * FAME_MICROS)
  assert.equal(notoriety.state.prestige.lifetimeFameMicros, 210 * FAME_MICROS)
  const nextXp = (getLevelStartThreshold(21) - getLevelStartThreshold(20)) * 400
  const rewarded = creditExperience(notoriety.state, nextXp)
  assert.ok(rewarded)
  assert.equal(rewarded.prestige.lastAwardedLevel, 21)
  assert.equal(rewarded.prestige.levelFameMicros, 232.05 * FAME_MICROS)
  assert.equal(rewarded.prestige.fameMicros, 162.05 * FAME_MICROS)
  const click = buyFameUpgrade(rewarded, 'click', 0)
  assert.ok(click.ok)
  assert.equal(click.state.prestige.fameMicros, 110.05 * FAME_MICROS)
  assert.equal(click.state.prestige.lifetimeFameMicros, rewarded.prestige.lifetimeFameMicros)
  assert.equal(getFameShopOffer(click.state, 'click')?.nextCostFame, 67)
  assert.equal(hasValidFameShopLedger(click.state), true)
})

test('complete Shop: 6 × 20 tiers for exactly 24 650 Fame, with 600 Fame left', () => {
  const seeded = completeCollectionFixture()
  const baselineJSON = JSON.stringify(seeded)
  assert.equal(hasValidFameShopLedger(seeded), true)
  assert.equal(getFameShopOffers(seeded).every((offer) => offer.canAfford), true)
  let state = seeded
  let paidFame = 0
  let purchases = 0
  for (const boost of FAME_BOOSTS) {
    for (let level = 0; level < MAX_FAME_BOOST_LEVEL; level++) {
      const purchase = buyFameUpgrade(state, boost.id, level)
      assert.ok(purchase.ok, `Unable to buy ${boost.id} tier ${level + 1}`)
      assert.equal(purchase.receipt.newLevel, level + 1)
      assert.equal(purchase.receipt.newBonusBps, 500 * (level + 1))
      assert.equal(purchase.receipt.costFame, boost.costs[level])
      assert.equal(hasValidFameShopLedger(purchase.state), true)
      paidFame += purchase.receipt.costFame
      purchases++
      state = purchase.state
    }
    assert.equal(state.prestige.boosts[boost.id], 20)
    assert.equal(getFameShopOffer(state, boost.id)?.nextCostFame, null)
    assert.equal(getFameShopOffer(state, boost.id)?.nextBonusBps, null)
    assert.equal(getFameShopOffer(state, boost.id)?.canAfford, false)
    unchanged(buyFameUpgrade(state, boost.id, 20), state, 'max-level')
  }
  assert.equal(purchases, 120)
  assert.equal(paidFame, TOTAL_FAME_SHOP_COST)
  assert.equal(paidFame, 24_650)
  assert.equal(getPurchasedFameBoostCost(state.prestige.boosts), 24_650)
  assert.equal(state.prestige.fameMicros, 600 * FAME_MICROS)
  assert.equal(state.prestige.lifetimeFameMicros, seeded.prestige.lifetimeFameMicros)
  assert.equal(state.prestige.collectionFameMicros, COLLECTION_BASE_FAME * FAME_MICROS)
  assert.equal(state.prestige.ownedCollectionIds.length, 50)
  assert.equal(state.game.balance, seeded.game.balance)
  assert.equal(state.game.lifetimeEarned, seeded.game.lifetimeEarned)
  assert.deepEqual(state.stats, seeded.stats)
  assert.deepEqual(state.fiscal, seeded.fiscal)
  assert.equal(JSON.stringify(seeded), baselineJSON)
  assert.deepEqual(restoreCapitalState(JSON.parse(JSON.stringify(state)), NOW), state)
  const imported = prepareSaveImport(createSaveExport(state, NOW), NOW)
  assert.ok(imported.ok)
  assert.deepEqual(imported.preview.state, state)
})

test('strict v6 import refuses forged free upgrades or minted Fame after purchases', () => {
  const initial = createCapitalState({
    balance: 100, lifetimeEarned: getLevelStartThreshold(20), purchasedUpgrades: 0,
  }, NOW)
  const bought = buyFameUpgrade(initial, 'xp', 0)
  assert.ok(bought.ok)
  for (const alteredPrestige of [
    { ...bought.state.prestige, boosts: { ...bought.state.prestige.boosts, click: 1 } },
    { ...bought.state.prestige, fameMicros: initial.prestige.fameMicros },
    { ...bought.state.prestige, fameMicros: bought.state.prestige.fameMicros + 1 },
    { ...bought.state.prestige, lifetimeFameMicros: bought.state.prestige.lifetimeFameMicros + FAME_MICROS },
  ]) {
    const hacked = { ...bought.state, prestige: alteredPrestige }
    assert.equal(hasValidFameShopLedger(hacked), false)
    assert.deepEqual(prepareSaveImport(createSaveExport(hacked, NOW), NOW), {
      ok: false, error: 'invalid-save',
    })
  }
})

test('localStorage v6 reload keeps Fame fractions and purchased boosts without double debit', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const saved = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { saved.set(key, value) },
    removeItem: (key: string) => { saved.delete(key) },
  } })
  try {
    const original = createCapitalState({
      balance: 0, lifetimeEarned: getLevelStartThreshold(20), purchasedUpgrades: 0,
    }, NOW)
    const bought = buyFameUpgrade(original, 'click', 0)
    assert.ok(bought.ok)
    saveCapitalState(bought.state)
    assert.ok(saved.has('capital-idle-save-v6'))
    const loaded = loadCapitalState(NOW)
    assert.deepEqual(loaded, bought.state)
    const restored = loadCapitalState(NOW)
    assert.deepEqual(restored, loaded)
    assert.equal(restored.prestige.boosts.click, 1)
    assert.equal(restored.prestige.fameMicros, (210 - 52) * FAME_MICROS)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
