import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState, type CapitalState } from '../capital.ts'
import { getCapitalStatsOverview } from '../economy/stats-overview.ts'
import { createSaveExport, prepareSaveImport } from '../save-transfer.ts'
import { COLLECTION_BASE_FAME, COLLECTION_CATEGORIES, FAME_BOOST_IDS } from './catalog.ts'
import {
  COLLECTION_ITEMS, getCollectionBookValueCents,
  getCollectionItem, getCollectionItemsByCategory,
} from './collections-catalog.ts'
import {
  buyCollectionItem, getCollectionOffer, getCollectionOffersByCategory, getCollectionProgress,
} from './collections.ts'
import { getBonusBreakdown } from './bonuses.ts'
import { buyFameUpgrade, hasValidFameShopLedger } from './shop.ts'
import { FAME_MICROS } from './state.ts'

const NOW = 1_800_000_000_000
const funded = (cash: number): CapitalState =>
  createCapitalState({ balance: cash, lifetimeEarned: cash, purchasedUpgrades: 0 }, NOW)

test('50 fiches uniques en 5 catégories, descriptions françaises, coût et bonus liés au catalogue immuable', () => {
  assert.equal(COLLECTION_ITEMS.length, 50)
  assert.equal(new Set(COLLECTION_ITEMS.map(i => i.id)).size, 50)
  assert.equal(new Set(COLLECTION_ITEMS.map(i => i.name)).size, 50)
  const categoryIcons = new Set<string>()
  for (const category of COLLECTION_CATEGORIES) {
    const items = getCollectionItemsByCategory(category.id)
    assert.equal(items.length, 10)
    assert.equal(items.reduce((sum, item) => sum + item.fame, 0), 4_040)
    assert.ok(items.every((item) => item.category === category.id))
    categoryIcons.add(items[0]!.visualTag)
    for (const [index, item] of items.entries()) {
      assert.equal(item.rank, index + 1)
      assert.equal(item.id, category.id + '-' + String(index + 1).padStart(2, '0'))
      assert.ok(item.name.length > 8)
      assert.ok(item.description.length > 55)
      assert.ok(Number.isSafeInteger(item.priceCents) && item.priceCents > 0)
      assert.ok(item.visualTag.length > 0)
      assert.ok(FAME_BOOST_IDS.includes(item.boostId))
      assert.equal(getCollectionItem(item.id), item)
      assert.ok(Object.isFrozen(item))
      if (index > 0) assert.ok(item.priceCents > items[index - 1]!.priceCents)
    }
  }
  assert.equal(categoryIcons.size, 5)
  assert.equal(getCollectionItemsByCategory('introuvable').length, 0)
  assert.equal(getCollectionItem('introuvable'), undefined)
  assert.equal(getCollectionBookValueCents([]), 0)
  assert.equal(getCollectionBookValueCents(['introuvable']), null)
  assert.equal(COLLECTION_ITEMS.reduce((sum, item) => sum + item.fame, 0), COLLECTION_BASE_FAME)
})

test('sélecteurs de Collection : disponibilité, catégorie, état possédé et progressions', () => {
  const initial = funded(2_000)
  const painting = getCollectionOffer(initial, 'paintings-01')
  assert.ok(painting)
  assert.equal(painting.item.name, 'Les Fleurs du Matin')
  assert.equal(painting.canAfford, true)
  assert.equal(painting.owned, false)
  assert.equal(painting.awardedFameMicros, 10 * FAME_MICROS)
  assert.equal(getCollectionOffer(initial, 'unknown'), null)
  assert.equal(getCollectionOffersByCategory(initial, 'paintings').length, 10)
  assert.deepEqual(getCollectionOffersByCategory(initial, 'unknown'), [])

  const startProgress = getCollectionProgress(initial)
  assert.deepEqual(startProgress.map(p => p.total), [10, 10, 10, 10, 10])
  assert.equal(startProgress.reduce((sum, p) => sum + p.earnedBaseFame, 0), 0)

  const result = buyCollectionItem(initial, 'paintings-01')
  assert.ok(result.ok)
  const nowOwned = getCollectionOffer(result.state, 'paintings-01')
  assert.ok(nowOwned)
  assert.equal(nowOwned.owned, true)
  assert.equal(nowOwned.canAfford, false)
  const progress = getCollectionProgress(result.state).find(p => p.category === 'paintings')
  assert.ok(progress)
  assert.deepEqual(progress, {
    category: 'paintings', owned: 1, total: 10,
    earnedBaseFame: 10, totalBaseFame: 4040,
    bookValueCents: 150_000,
  })
})

test('achat : Gold débité une fois, Fame créditée une fois, bonus permanent, sans XP, revenu ou taxe', () => {
  const before = funded(2_000)
  const original = JSON.stringify(before)
  const beforeWorth = getCapitalStatsOverview(before)
  const purchased = buyCollectionItem(before, 'paintings-01')
  assert.ok(purchased.ok)
  assert.equal(purchased.receipt.itemId, 'paintings-01')
  assert.equal(purchased.receipt.priceCents, 150_000)
  assert.equal(purchased.receipt.baseFame, 10)
  assert.equal(purchased.receipt.awardedFameMicros, 10 * FAME_MICROS)
  assert.equal(purchased.receipt.bonusBps, 10)
  assert.equal(purchased.receipt.boostId, 'xp')
  assert.equal(purchased.receipt.remainingCashCents, 50_000)
  assert.equal(purchased.receipt.ownedCount, 1)
  assert.equal(purchased.state.game.balance, 500)
  assert.equal(purchased.state.game.lifetimeEarned, before.game.lifetimeEarned)
  assert.equal(purchased.state.prestige.experienceCents, before.prestige.experienceCents)
  assert.equal(purchased.state.prestige.lastAwardedLevel, before.prestige.lastAwardedLevel)
  assert.equal(purchased.state.prestige.fameMicros, before.prestige.fameMicros + 10 * FAME_MICROS)
  assert.equal(purchased.state.prestige.lifetimeFameMicros, before.prestige.lifetimeFameMicros + 10 * FAME_MICROS)
  assert.equal(purchased.state.prestige.collectionFameMicros, 10 * FAME_MICROS)
  assert.deepEqual(purchased.state.prestige.ownedCollectionIds, ['paintings-01'])
  assert.equal(getBonusBreakdown(purchased.state, 'xp').collectionBps, 10)
  assert.equal(getBonusBreakdown(purchased.state, 'click').collectionBps, 0)
  assert.strictEqual(purchased.state.stats, before.stats)
  assert.strictEqual(purchased.state.fiscal, before.fiscal)
  assert.strictEqual(purchased.state.trading, before.trading)
  assert.strictEqual(purchased.state.enterprises, before.enterprises)
  assert.equal(JSON.stringify(before), original)
  const afterWorth = getCapitalStatsOverview(purchased.state)
  assert.equal(afterWorth.collectionBookValue, 1500)
  assert.equal(afterWorth.collectionCount, 1)
  assert.equal(afterWorth.netWorth, beforeWorth.netWorth, 'Gold devient un actif collection au coût historique')
  assert.equal(afterWorth.lifetimeEarned, beforeWorth.lifetimeEarned)
  assert.equal(hasValidFameShopLedger(purchased.state), true)
})

test('achats invalides : ID inconnu, répétition, fonds insuffisants et cash négatif', () => {
  const before = funded(1499.99)
  const unknown = buyCollectionItem(before, 'missing-00')
  assert.equal(unknown.ok, false)
  if (!unknown.ok) assert.equal(unknown.error, 'unknown-item')
  assert.strictEqual(unknown.state, before)

  const poor = buyCollectionItem(before, 'paintings-01')
  assert.equal(poor.ok, false)
  if (!poor.ok) assert.equal(poor.error, 'insufficient-funds')
  assert.strictEqual(poor.state, before)
  assert.equal(getCollectionOffer(before, 'paintings-01')?.canAfford, false)

  const inDebt = createCapitalState({
    balance: -100, lifetimeEarned: 2000, purchasedUpgrades: 0,
  }, NOW)
  const blocked = buyCollectionItem(inDebt, 'paintings-01')
  assert.equal(blocked.ok, false)
  if (!blocked.ok) assert.equal(blocked.error, 'insufficient-funds')
  assert.strictEqual(blocked.state, inDebt)

  const succeeded = buyCollectionItem(funded(2000), 'paintings-01')
  assert.ok(succeeded.ok)
  const replay = buyCollectionItem(succeeded.state, 'paintings-01')
  assert.equal(replay.ok, false)
  if (!replay.ok) assert.equal(replay.error, 'already-owned')
  assert.strictEqual(replay.state, succeeded.state)
  assert.deepEqual(replay.state.prestige.ownedCollectionIds, ['paintings-01'])
  assert.equal(replay.state.prestige.collectionFameMicros, 10 * FAME_MICROS)
})

test('Notoriété : seuls les nouveaux achats sont multipliés, pas le bonus Fame de l’objet lui-même', () => {
  const original = funded(20_000)
  const upgrade = buyFameUpgrade(original, 'fame', 0)
  assert.ok(upgrade.ok)
  const watchOffer = getCollectionOffer(upgrade.state, 'watches-02')
  assert.ok(watchOffer)
  assert.equal(watchOffer.awardedFameMicros, 26.25 * FAME_MICROS)
  const watch = buyCollectionItem(upgrade.state, 'watches-02')
  assert.ok(watch.ok)
  assert.equal(watch.receipt.boostId, 'fame')
  assert.equal(watch.receipt.bonusBps, 20)
  assert.equal(watch.receipt.awardedFameMicros, 26.25 * FAME_MICROS)
  assert.equal(watch.state.game.balance, 8000)
  assert.equal(watch.state.prestige.collectionFameMicros, 26.25 * FAME_MICROS)
  assert.equal(getBonusBreakdown(watch.state, 'fame').totalBps, 520)
  assert.equal(watch.state.prestige.levelFameMicros, original.prestige.levelFameMicros)
  assert.equal(watch.state.prestige.lifetimeFameMicros, original.prestige.lifetimeFameMicros + 26.25 * FAME_MICROS)
  const jewel = buyCollectionItem(watch.state, 'jewelry-01')
  assert.ok(jewel.ok)
  assert.equal(jewel.receipt.awardedFameMicros, 10.52 * FAME_MICROS)
  assert.equal(jewel.state.prestige.collectionFameMicros, 36.77 * FAME_MICROS)
  assert.equal(jewel.state.game.balance, 5000)
  assert.equal(jewel.state.prestige.lastAwardedLevel, original.prestige.lastAwardedLevel)
  assert.equal(getBonusBreakdown(jewel.state, 'fame').totalBps, 530)
  assert.equal(hasValidFameShopLedger(jewel.state), true)

  // Fame is stored to a millionth: buying a Shop tier never loses fractions.
  const click = buyFameUpgrade(jewel.state, 'click', 0)
  assert.ok(click.ok)
  assert.equal(click.state.prestige.fameMicros % FAME_MICROS, 770_000)
})

test('50 achats en cash : 20 200 Fame garanties, bonus Fame cumulés et patrimoine stable', () => {
  const initial = funded(5_000_000_000)
  const initialNetWorth = getCapitalStatsOverview(initial).netWorth
  const initialXP = initial.prestige.experienceCents
  const initialLevelFame = initial.prestige.levelFameMicros
  let totalCostCents = 0
  let totalBaseFame = 0
  let totalAwardedFameMicros = 0
  let state = initial
  for (const item of COLLECTION_ITEMS) {
    // Collection items themselves may improve subsequent Fame rewards.
    // The guaranteed baseline stays 20 200, but real rewards can exceed it.
    const expectedAward = getCollectionOffer(state, item.id)?.awardedFameMicros
    const transaction = buyCollectionItem(state, item.id)
    assert.ok(transaction.ok, item.id)
    assert.equal(transaction.receipt.awardedFameMicros, expectedAward)
    assert.equal(transaction.receipt.bonusBps, item.bonusBps)
    totalCostCents += item.priceCents
    totalBaseFame += item.fame
    totalAwardedFameMicros += transaction.receipt.awardedFameMicros
    state = transaction.state
  }
  assert.equal(state.prestige.ownedCollectionIds.length, 50)
  assert.equal(new Set(state.prestige.ownedCollectionIds).size, 50)
  assert.equal(totalBaseFame, COLLECTION_BASE_FAME)
  assert.ok(totalAwardedFameMicros >= COLLECTION_BASE_FAME * FAME_MICROS)
  assert.equal(state.prestige.collectionFameMicros, totalAwardedFameMicros)
  assert.equal(state.prestige.fameMicros, initial.prestige.fameMicros + totalAwardedFameMicros)
  assert.equal(state.prestige.levelFameMicros, initialLevelFame)
  assert.equal(state.prestige.experienceCents, initialXP)
  assert.equal(state.game.lifetimeEarned, initial.game.lifetimeEarned)
  assert.deepEqual(state.stats, initial.stats)
  assert.deepEqual(state.fiscal, initial.fiscal)
  assert.equal(state.game.balance, (initial.game.balance * 100 - totalCostCents) / 100)
  assert.equal(getCollectionBookValueCents(state.prestige.ownedCollectionIds), totalCostCents)
  const stats = getCapitalStatsOverview(state)
  assert.equal(stats.collectionCount, 50)
  assert.equal(stats.collectionBookValue, totalCostCents / 100)
  assert.equal(stats.netWorth, initialNetWorth)
  assert.deepEqual(getCollectionProgress(state).map(p => p.owned), [10, 10, 10, 10, 10])
  assert.deepEqual(getCollectionProgress(state).map(p => p.earnedBaseFame), [4040, 4040, 4040, 4040, 4040])
  assert.equal(getCollectionProgress(state).reduce((sum, p) => sum + p.bookValueCents, 0), totalCostCents)
  assert.deepEqual(restoreCapitalState(state, NOW), state)
  const imported = prepareSaveImport(createSaveExport(state, NOW), NOW)
  assert.ok(imported.ok)
  assert.deepEqual(imported.preview.state, state)
})

test('import v6 : rejette possessions inventées, récompenses manquantes et identifiants dupliqués', () => {
  const original = buyCollectionItem(funded(2000), 'paintings-01')
  assert.ok(original.ok)
  const rawStates = [
    { ...original.state.prestige, collectionFameMicros: 0 },
    { ...original.state.prestige, ownedCollectionIds: [] },
    { ...original.state.prestige, ownedCollectionIds: ['paintings-01', 'paintings-01'] },
    { ...original.state.prestige, ownedCollectionIds: ['unknown-item'] },
  ]
  for (const prestige of rawStates) {
    const raw = { ...original.state, prestige }
    assert.deepEqual(prepareSaveImport(createSaveExport(raw, NOW), NOW), { ok: false, error: 'invalid-save' })
    const invalid = buyCollectionItem(raw, 'watches-01')
    assert.equal(invalid.ok, false)
    if (!invalid.ok) assert.equal(invalid.error, 'invalid-state')
    assert.strictEqual(invalid.state, raw)
  }
})

test('les achats de collection ne permettent aucune revente et aucun gain passif de Fame', () => {
  const first = buyCollectionItem(funded(10_000), 'paintings-01')
  assert.ok(first.ok)
  assert.equal(typeof (first.state as unknown as Record<string, unknown>).sellCollection, 'undefined')
  const fameBefore = first.state.prestige.fameMicros
  const net = getCapitalStatsOverview(first.state)
  assert.equal(net.collectionCount, 1)
  assert.equal(first.state.prestige.fameMicros, fameBefore)
  assert.equal(getCollectionOffer(first.state, 'paintings-01')?.canAfford, false)
})
