import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COLLECTION_BASE_FAME, COLLECTION_CATEGORIES, COLLECTION_PRICES_DOLLARS,
  COLLECTION_RANK_REWARDS, COLLECTION_SLOTS, FAME_BOOSTS, FAME_BOOST_IDS,
  FAME_BOOST_BPS_PER_LEVEL, LEVEL_100_BASE_FAME, MAX_FAME_BOOST_LEVEL,
  TOTAL_BASE_FAME_TO_LEVEL_100, TOTAL_FAME_SHOP_COST,
  getCollectionSlot, getFameBoost, getNextFameBoostCost,
} from './catalog.ts'

test('six boosts uniques : 20 paliers de +5 %, plafonnés à +100 %', () => {
  assert.deepEqual(FAME_BOOST_IDS, ['click', 'enterprise', 'dividend', 'xp', 'trading', 'fame'])
  assert.equal(MAX_FAME_BOOST_LEVEL, 20)
  assert.equal(FAME_BOOST_BPS_PER_LEVEL, 500)
  assert.equal(FAME_BOOST_BPS_PER_LEVEL * MAX_FAME_BOOST_LEVEL, 10_000)
  assert.equal(FAME_BOOSTS.length, 6)
  assert.equal(new Set(FAME_BOOSTS.map((boost) => boost.id)).size, 6)
  for (const boost of FAME_BOOSTS) {
    assert.equal(getFameBoost(boost.id), boost)
    assert.equal(boost.costs.length, 20)
    assert.ok(boost.label.length > 0 && boost.description.length > 0)
    const first = boost.id === 'fame' ? 70 : 52
    const delta = boost.id === 'fame' ? 20 : 15
    for (let level = 0; level < 20; level++) {
      assert.equal(boost.costs[level], first + level * delta)
      assert.equal(getNextFameBoostCost(boost.id, level), first + level * delta)
    }
    assert.equal(boost.totalCost, boost.id === 'fame' ? 5_200 : 3_890)
  }
  assert.equal(getFameBoost('unknown'), undefined)
  for (const level of [-1, 20, 21, 0.2, NaN, Infinity]) {
    assert.equal(getNextFameBoostCost('click', level), null)
  }
  assert.equal(getNextFameBoostCost('unknown', 0), null)
  assert.equal(TOTAL_FAME_SHOP_COST, 24_650)
})

test('50 pièces, cinq catégories, dix rangs et récompenses cohérentes', () => {
  assert.deepEqual(COLLECTION_CATEGORIES.map((c) => c.label), ['Montres', 'Autos', 'Peintures', 'Antiquités', 'Joaillerie'])
  assert.equal(COLLECTION_RANK_REWARDS.length, 10)
  assert.deepEqual(COLLECTION_RANK_REWARDS.map((r) => r.fame), [10, 25, 50, 100, 180, 300, 500, 750, 950, 1_175])
  assert.deepEqual(COLLECTION_RANK_REWARDS.map((r) => r.bonusBps), [10, 20, 30, 50, 80, 120, 180, 250, 350, 500])
  assert.equal(COLLECTION_RANK_REWARDS.reduce((sum, item) => sum + item.fame, 0), 4_040)
  assert.equal(COLLECTION_RANK_REWARDS.reduce((sum, item) => sum + item.bonusBps, 0), 1_590)
  assert.equal(COLLECTION_SLOTS.length, 50)
  assert.equal(new Set(COLLECTION_SLOTS.map((slot) => slot.id)).size, 50)
  for (const category of COLLECTION_CATEGORIES) {
    const slots = COLLECTION_SLOTS.filter((slot) => slot.category === category.id)
    assert.equal(slots.length, 10)
    assert.equal(slots.reduce((sum, slot) => sum + slot.fame, 0), 4_040)
    slots.forEach((slot, index) => {
      assert.equal(slot.rank, index + 1)
      assert.equal(slot.id, `${category.id}-${String(index + 1).padStart(2, '0')}`)
      assert.strictEqual(getCollectionSlot(slot.id), slot)
      assert.equal(slot.fame, COLLECTION_RANK_REWARDS[index]?.fame)
      assert.equal(slot.bonusBps, COLLECTION_RANK_REWARDS[index]?.bonusBps)
    })
  }
  assert.equal(getCollectionSlot('invalid'), undefined)
  assert.equal(COLLECTION_BASE_FAME, 20_200)
})

test('50 prix uniques fixes par slot, croissants par catégorie, en centimes sûrs', () => {
  assert.deepEqual(Object.keys(COLLECTION_PRICES_DOLLARS).sort(), COLLECTION_CATEGORIES.map((c) => c.id).sort())
  for (const category of COLLECTION_CATEGORIES) {
    const costs = COLLECTION_PRICES_DOLLARS[category.id]
    assert.equal(costs.length, 10)
    for (let i = 0; i < costs.length; i++) {
      const dollars = costs[i]!
      assert.ok(Number.isSafeInteger(dollars))
      assert.ok(dollars > 0 && Number.isSafeInteger(dollars * 100))
      if (i > 0) assert.ok(dollars > costs[i - 1]!)
      const slot = COLLECTION_SLOTS.find((item) => item.id === `${category.id}-${String(i + 1).padStart(2, '0')}`)
      assert.equal(slot?.priceCents, dollars * 100)
    }
  }
  assert.equal(Math.min(...COLLECTION_SLOTS.map((slot) => slot.priceCents)) / 100, 1_500)
  assert.equal(Math.max(...COLLECTION_SLOTS.map((slot) => slot.priceCents)) / 100, 450_000_000)
  // Références vérifiées dans le catalogue existant : Kiosque 75 000 $,
  // Centre commercial 500 M$ / 30h de retour brut au niveau 1.
  assert.ok(COLLECTION_SLOTS.filter((slot) => slot.rank === 1).every((slot) => slot.priceCents / 100 < 75_000))
  assert.ok(COLLECTION_SLOTS.filter((slot) => slot.rank === 10).every((slot) => slot.priceCents / 100 < 500_000_000))
  const centerIncomePerHour = 500_000_000 / 30
  assert.ok(Math.max(...COLLECTION_SLOTS.map((slot) => slot.priceCents)) / 100 / centerIncomePerHour <= 27)
})

test('budget sans boosts : 80 % des collections, boutique complète finançable et 600 Fame restantes', () => {
  assert.equal(LEVEL_100_BASE_FAME, 5_050)
  assert.equal(COLLECTION_BASE_FAME, 20_200)
  assert.equal(TOTAL_BASE_FAME_TO_LEVEL_100, 25_250)
  assert.equal(COLLECTION_BASE_FAME / TOTAL_BASE_FAME_TO_LEVEL_100, 0.8)
  assert.equal(TOTAL_BASE_FAME_TO_LEVEL_100 - TOTAL_FAME_SHOP_COST, 600)
  let available = TOTAL_BASE_FAME_TO_LEVEL_100
  for (const boost of FAME_BOOSTS) {
    for (const cost of boost.costs) {
      assert.ok(available >= cost)
      available -= cost
    }
  }
  assert.equal(available, 600)
})

test('aucune donnée du catalogue n’est modifiable par une transaction', () => {
  assert.ok(Object.isFrozen(FAME_BOOST_IDS) && Object.isFrozen(FAME_BOOSTS))
  for (const boost of FAME_BOOSTS) assert.ok(Object.isFrozen(boost) && Object.isFrozen(boost.costs))
  assert.ok(Object.isFrozen(COLLECTION_CATEGORIES))
  assert.ok(COLLECTION_CATEGORIES.every(Object.isFrozen))
  assert.ok(Object.isFrozen(COLLECTION_RANK_REWARDS))
  assert.ok(COLLECTION_RANK_REWARDS.every(Object.isFrozen))
  assert.ok(Object.isFrozen(COLLECTION_PRICES_DOLLARS))
  assert.ok(COLLECTION_CATEGORIES.every((c) => Object.isFrozen(COLLECTION_PRICES_DOLLARS[c.id])))
  assert.ok(Object.isFrozen(COLLECTION_SLOTS) && COLLECTION_SLOTS.every(Object.isFrozen))
  const snapshot = JSON.stringify([FAME_BOOSTS, COLLECTION_SLOTS])
  for (let i = 0; i < 10; i++) {
    getNextFameBoostCost('click', 12)
    getCollectionSlot('watches-07')
    assert.equal(JSON.stringify([FAME_BOOSTS, COLLECTION_SLOTS]), snapshot)
  }
})
