import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState, type CapitalState } from '../capital.ts'
import { getLevel, getLevelStartThreshold } from '../game.ts'
import { getCapitalStatsOverview } from '../economy/stats-overview.ts'
import { advanceFiscalEconomy } from '../economy/clock.ts'
import { buyEnterprise } from '../economy/enterprises.ts'
import { createSaveExport, prepareSaveImport } from '../save-transfer.ts'
import {
  COLLECTION_BASE_FAME, COLLECTION_SLOTS, FAME_BOOSTS,
  LEVEL_100_BASE_FAME, TOTAL_BASE_FAME_TO_LEVEL_100, TOTAL_FAME_SHOP_COST,
} from './catalog.ts'
import { COLLECTION_ITEMS } from './collections-catalog.ts'
import { buyCollectionItem, getCollectionOffer } from './collections.ts'
import { buyFameUpgrade } from './shop.ts'
import { getAbsolutePrestigeStatus } from './absolute.ts'
import { FAME_MICROS } from './state.ts'

const NOW = 1_800_000_000_000
const TOTAL_COLLECTION_PRICE = COLLECTION_ITEMS.reduce((sum, item) => sum + item.priceCents, 0) / 100

function acquireEverything(state: CapitalState): CapitalState {
  for (const item of COLLECTION_ITEMS) {
    const expected = getCollectionOffer(state, item.id)
    assert.ok(expected)
    assert.equal(expected.owned, false)
    assert.equal(expected.canAfford, true, item.id)
    const tx = buyCollectionItem(state, item.id)
    assert.ok(tx.ok, item.id)
    assert.equal(tx.receipt.awardedFameMicros, expected.awardedFameMicros)
    assert.ok(tx.state.prestige.fameMicros >= state.prestige.fameMicros + item.fame * FAME_MICROS)
    state = tx.state
  }
  return state
}
function purchaseAllShop(state: CapitalState, skipFame = false): CapitalState {
  for (const boost of FAME_BOOSTS) {
    if (skipFame && boost.id === 'fame') continue
    for (let level = state.prestige.boosts[boost.id]; level < 20; level++) {
      const purchase = buyFameUpgrade(state, boost.id, level)
      assert.ok(purchase.ok, boost.id + ' niveau ' + (level + 1))
      state = purchase.state
    }
  }
  return state
}

test('base contractual budget: 80% collections at level 100 and 600 Fame left', () => {
  assert.equal(LEVEL_100_BASE_FAME, 5_050)
  assert.equal(COLLECTION_BASE_FAME, 20_200)
  assert.equal(TOTAL_BASE_FAME_TO_LEVEL_100, 25_250)
  assert.equal(COLLECTION_BASE_FAME / TOTAL_BASE_FAME_TO_LEVEL_100, .8)
  assert.equal(TOTAL_FAME_SHOP_COST, 24_650)
  assert.equal(TOTAL_BASE_FAME_TO_LEVEL_100 - TOTAL_FAME_SHOP_COST, 600)
  assert.equal(COLLECTION_SLOTS.length, 50)
  assert.equal(FAME_BOOSTS.reduce((sum, b) => sum + b.costs.length, 0), 120)
})

test('price audit: collection costs and level-100 ratio are theoretical, not a realistic co-occurrence', () => {
  assert.equal(TOTAL_COLLECTION_PRICE, 3_012_250_000)
  assert.equal(getLevelStartThreshold(100), 3_133_648)
  const milestoneLevel = getLevel(3_012_250_000)
  assert.ok(milestoneLevel > 250, 'la courbe dégressive accélère les niveaux élevés')
  const fameFromLevels = milestoneLevel * (milestoneLevel + 1) / 2
  assert.ok(Number.isSafeInteger(fameFromLevels))
  // Le catalogue de collections reste inchangé, mais la part de Fame d'origine
  // est maintenant plus faible puisque les niveaux supérieurs sont plus faciles.
  const realisticBaseShare = COLLECTION_BASE_FAME / (COLLECTION_BASE_FAME + fameFromLevels)
  assert.ok(realisticBaseShare > 0 && realisticBaseShare < .2)
  // Ne pas retarifer rétroactivement les bonus ou les collections.
})

test('realistic late Notoriété path: all 50 cash purchases, Shop 120/120, no double asset counting', () => {
  const start = createCapitalState({ balance: 3_100_000_000, lifetimeEarned: 3_100_000_000, purchasedUpgrades: 0 }, NOW)
  const beforeWorth = getCapitalStatsOverview(start).netWorth
  assert.equal(start.prestige.lastAwardedLevel, getLevel(3_100_000_000))
  assert.ok(start.prestige.lastAwardedLevel > 250)
  const collected = acquireEverything(start)
  assert.equal(collected.prestige.ownedCollectionIds.length, 50)
  assert.equal(getCapitalStatsOverview(collected).collectionBookValue, TOTAL_COLLECTION_PRICE)
  assert.equal(getCapitalStatsOverview(collected).netWorth, beforeWorth)
  assert.ok(collected.prestige.collectionFameMicros >= 20_200 * FAME_MICROS)
  assert.equal(collected.prestige.experienceCents, start.prestige.experienceCents)
  const completed = purchaseAllShop(collected)
  assert.equal(getAbsolutePrestigeStatus(completed).unlocked, true)
  assert.equal(completed.game.balance, start.game.balance - TOTAL_COLLECTION_PRICE)
  assert.equal(completed.prestige.lifetimeFameMicros - completed.prestige.fameMicros, 24_650 * FAME_MICROS)
  assert.ok(completed.prestige.fameMicros >= 600 * FAME_MICROS)
  assert.deepEqual(restoreCapitalState(completed, NOW), completed)
  const imported = prepareSaveImport(createSaveExport(completed, NOW), NOW)
  assert.ok(imported.ok)
  assert.deepEqual(imported.preview.state, completed)
})

test('realistic early Notoriété path outperforms late purchasing without touching cash, XP or taxes', () => {
  const seeded = createCapitalState({ balance: 3_100_000_000, lifetimeEarned: 3_100_000_000, purchasedUpgrades: 0 }, NOW)
  let early = seeded
  // Spend the full expensive Fame bonus upfront, when the 168 levels have
  // already supplied more than the 5 200 needed for its twenty ranks.
  for (let level = 0; level < 20; level++) {
    const tx = buyFameUpgrade(early, 'fame', level)
    assert.ok(tx.ok)
    early = tx.state
  }
  early = acquireEverything(early)
  early = purchaseAllShop(early, true)
  const late = purchaseAllShop(acquireEverything(seeded))
  assert.equal(getAbsolutePrestigeStatus(early).unlocked, true)
  assert.equal(getAbsolutePrestigeStatus(late).unlocked, true)
  assert.equal(early.game.balance, late.game.balance)
  assert.equal(early.prestige.experienceCents, late.prestige.experienceCents)
  assert.equal(early.fiscal.taxesDueCents, late.fiscal.taxesDueCents)
  assert.deepEqual(early.prestige.ownedCollectionIds, late.prestige.ownedCollectionIds)
  assert.equal(early.prestige.lifetimeFameMicros - early.prestige.fameMicros, 24_650 * FAME_MICROS)
  assert.equal(late.prestige.lifetimeFameMicros - late.prestige.fameMicros, 24_650 * FAME_MICROS)
  assert.ok(early.prestige.collectionFameMicros > late.prestige.collectionFameMicros)
  assert.ok(Math.abs(late.prestige.collectionFameMicros / FAME_MICROS - 22_725.14) < .000001)
  assert.ok(Math.abs(early.prestige.collectionFameMicros / FAME_MICROS - 42_925.14) < .000001)
  const level = seeded.prestige.lastAwardedLevel
  const levelFame = level * (level + 1) / 2
  const lateCollectionShare = late.prestige.collectionFameMicros /
    (late.prestige.collectionFameMicros + levelFame * FAME_MICROS)
  const earlyCollectionShare = early.prestige.collectionFameMicros /
    (early.prestige.collectionFameMicros + levelFame * FAME_MICROS)
  assert.ok(earlyCollectionShare > lateCollectionShare)
  assert.ok(lateCollectionShare > 0 && earlyCollectionShare < 1)
  assert.ok(early.prestige.fameMicros > late.prestige.fameMicros)
  assert.ok(Math.abs(late.prestige.fameMicros / FAME_MICROS -
    (levelFame + 22_725.14 - 24_650)) < .000001)
  assert.ok(Math.abs(early.prestige.fameMicros / FAME_MICROS -
    (levelFame + 42_925.14 - 24_650)) < .000001)
  assert.equal(getAbsolutePrestigeStatus(late).fameSteps,
    Math.floor(late.prestige.fameMicros / FAME_MICROS / 100))
  assert.equal(getAbsolutePrestigeStatus(early).fameSteps,
    Math.floor(early.prestige.fameMicros / FAME_MICROS / 100))
  assert.ok(getAbsolutePrestigeStatus(early).factor >= getAbsolutePrestigeStatus(late).factor)
  assert.equal(getCapitalStatsOverview(early).netWorth, getCapitalStatsOverview(late).netWorth)
})

test('cash debt and long absence: no purchases with debt, no duplicate offline income or taxes', () => {
  const indebted = createCapitalState({ balance: -100, lifetimeEarned: 100_000, purchasedUpgrades: 0 }, NOW)
  const tx = buyCollectionItem(indebted, 'paintings-01')
  assert.equal(tx.ok, false)
  if (!tx.ok) assert.equal(tx.error, 'insufficient-funds')
  assert.strictEqual(tx.state, indebted)
  const seeded = createCapitalState({ balance: 100_000, lifetimeEarned: 100_000, purchasedUpgrades: 0 }, NOW)
  const bought = buyEnterprise(seeded, 'kiosque', NOW)
  assert.ok(bought.ok)
  const yearLater = NOW + 365 * 86_400_000
  const advanced = advanceFiscalEconomy(bought.state, yearLater)
  assert.equal(advanced.enterprises.lastAccruedAt, yearLater)
  assert.ok(advanced.stats.earnedBySource.enterprises > 0)
  assert.ok(advanced.prestige.experienceCents > bought.state.prestige.experienceCents)
  assert.ok(advanced.fiscal.taxesPaidCents > bought.state.fiscal.taxesPaidCents)
  assert.strictEqual(advanceFiscalEconomy(advanced, yearLater), advanced)
  const reloaded = restoreCapitalState(JSON.parse(JSON.stringify(advanced)), yearLater)
  assert.deepEqual(reloaded, advanced)
  assert.strictEqual(advanceFiscalEconomy(reloaded, yearLater), reloaded)
  assert.ok(Number.isSafeInteger(advanced.prestige.fameMicros))
})
