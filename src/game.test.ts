import assert from 'node:assert/strict'
import test from 'node:test'
import {
  INITIAL_GAME,
  LEVEL_THRESHOLDS,
  earnClick,
  getClickValue,
  getLevel,
  getLevelStartThreshold,
  getNextLevelThreshold,
  getNextUpgrade,
  migrateLegacyGame,
  migrateV2Game,
  purchaseUpgrade,
  restoreGame,
  UPGRADES,
  MAX_CLICK_LEVEL,
  FIRST_CLICK_UPGRADE_PRICE,
  CLICK_UPGRADE_PRICE_STEP,
  CLICK_PRICE_INCREMENT_GROWTH,
} from './game.ts'

test('50 niveaux lissés avec des seuils strictement croissants', () => {
  assert.equal(LEVEL_THRESHOLDS.length, 50)
  assert.equal(LEVEL_THRESHOLDS[0], 0)
  assert.equal(LEVEL_THRESHOLDS[1], 140)
  assert.equal(LEVEL_THRESHOLDS[2], 296)
  assert.equal(LEVEL_THRESHOLDS[9], 1_900)
  assert.equal(LEVEL_THRESHOLDS[29], 20_812)
  assert.equal(LEVEL_THRESHOLDS[49], 148_008)
  assert.ok(LEVEL_THRESHOLDS.every((value, index) => index === 0 || value > LEVEL_THRESHOLDS[index - 1]!))
})

test('le niveau dépend du total gagné, pas du solde', () => {
  assert.equal(getLevel(0), 1)
  assert.equal(getLevel(139), 1)
  assert.equal(getLevel(140), 2)
  assert.equal(getLevel(296), 3)
  assert.equal(getNextLevelThreshold(140), 296)
  assert.equal(getLevel(148_008), 50)
  assert.ok(getNextLevelThreshold(148_008)! > 148_008)
  assert.equal(getLevel(getLevelStartThreshold(100)), 100)
  assert.equal(getLevel(getLevelStartThreshold(101)), 101)
  assert.ok(getNextLevelThreshold(getLevelStartThreshold(101))! > getLevelStartThreshold(101))
})

test('clic puis achat : prix revalorisé, niveau et total gagné préservés', () => {
  let state = { balance: 139, lifetimeEarned: 139, purchasedUpgrades: 0 }
  state = earnClick(state)
  assert.equal(state.lifetimeEarned, 140)
  assert.equal(getLevel(state.lifetimeEarned), 2)
  assert.strictEqual(purchaseUpgrade(state), state, '140 $ ne suffisent pas au premier achat')
  state = { ...state, balance: 375, lifetimeEarned: 375 }
  state = purchaseUpgrade(state)
  assert.deepEqual(state, { balance: 0, lifetimeEarned: 375, purchasedUpgrades: 1 })
  assert.equal(getClickValue(state.purchasedUpgrades), 2)
  state = earnClick(state)
  assert.equal(state.balance, 2)
  assert.equal(state.lifetimeEarned, 377)
})

test('impossible d acheter une amélioration avant son niveau ou sans fonds', () => {
  const locked = { balance: 35, lifetimeEarned: 34, purchasedUpgrades: 0 }
  assert.deepEqual(purchaseUpgrade(locked), locked)
  const poor = { balance: 10, lifetimeEarned: 35, purchasedUpgrades: 0 }
  assert.deepEqual(purchaseUpgrade(poor), poor)
})

test('999 améliorations du clic : augmentation des écarts de prix de 0,05 % composée par palier', () => {
  assert.equal(MAX_CLICK_LEVEL, 1000)
  assert.equal(UPGRADES.length, MAX_CLICK_LEVEL - 1)
  assert.equal(FIRST_CLICK_UPGRADE_PRICE, 375)
  assert.equal(CLICK_UPGRADE_PRICE_STEP, 750)
  assert.equal(CLICK_PRICE_INCREMENT_GROWTH, 0.0005)
  let lastIncrease = 0
  UPGRADES.forEach((upgrade, index) => {
    const clickValue = index + 2
    const expectedGate = clickValue <= 50 ? clickValue : 50 + Math.ceil((clickValue - 50) / 20)
    assert.equal(upgrade.requiredLevel, expectedGate)
    assert.equal(upgrade.clickValue, clickValue)
    assert.equal(upgrade.clickValue - getClickValue(index), 1)
    if (index === 0) assert.equal(upgrade.price, 375)
    else {
      const increase = upgrade.price - UPGRADES[index - 1]!.price
      assert.equal(
        increase,
        Math.round(CLICK_UPGRADE_PRICE_STEP * (1 + CLICK_PRICE_INCREMENT_GROWTH) ** (index - 1)),
        'the INCREMENT compounds by only 0.05% per tier',
      )
      assert.ok(increase >= lastIncrease, 'price increments never shrink')
      lastIncrease = increase
    }
  })
  assert.equal(UPGRADES[48]!.clickValue, 50)
  assert.equal(UPGRADES[49]!.requiredLevel, 51)
  assert.equal(UPGRADES[68]!.requiredLevel, 51)
  assert.equal(UPGRADES[69]!.requiredLevel, 52)
  assert.equal(UPGRADES[998]!.requiredLevel, 98)
  assert.equal(UPGRADES[1]!.price, 1_125)
  assert.equal(UPGRADES[3]!.price, 2_626)
  assert.equal(UPGRADES[99]!.price, 76_475)
  assert.equal(UPGRADES[499]!.price, 425_336)
  assert.equal(UPGRADES[998]!.price, 970_678)
  assert.equal(UPGRADES.reduce((sum, upgrade) => sum + upgrade.price, 0), 444_951_055)
  const oldLastPrice = FIRST_CLICK_UPGRADE_PRICE + 998 * CLICK_UPGRADE_PRICE_STEP
  assert.ok(UPGRADES[998]!.price > oldLastPrice)
  assert.ok(UPGRADES[998]!.price < oldLastPrice * 1.3, 'exponential bend must stay mild at max tier')
  assert.equal(getClickValue(999), 1000)
  assert.equal(getNextUpgrade({ ...INITIAL_GAME, purchasedUpgrades: 999 }), null)
})

test('on peut acheter les 999 améliorations, sans niveau joueur 1000 ni achat à crédit', () => {
  const budget = UPGRADES.reduce((sum, upgrade) => sum + upgrade.price, 0)
  let state = { balance: budget, lifetimeEarned: budget, purchasedUpgrades: 0 }
  assert.ok(getLevel(state.lifetimeEarned) >= 98)
  for (const upgrade of UPGRADES) {
    const previous = state
    state = purchaseUpgrade(state)
    assert.equal(state.purchasedUpgrades, previous.purchasedUpgrades + 1)
    assert.equal(previous.balance - state.balance, upgrade.price)
  }
  assert.equal(state.purchasedUpgrades, 999)
  assert.equal(state.balance, 0)
  assert.equal(getClickValue(state.purchasedUpgrades), 1000)
  assert.strictEqual(purchaseUpgrade(state), state)
})

test('les anciennes sauvegardes conservent le solde, le total et au moins les gains par clic', () => {
  const oldLevels = [0, 100, 500, 2_000, 10_000, 50_000]
  const oldClicks = [1, 2, 5, 10, 25, 50]
  oldLevels.forEach((lifetimeEarned, purchasedUpgrades) => {
    const balance = lifetimeEarned === 0 ? 0 : Math.floor(lifetimeEarned / 2)
    const migrated = migrateLegacyGame({ balance, lifetimeEarned, purchasedUpgrades })
    assert.equal(migrated.balance, balance)
    assert.equal(migrated.lifetimeEarned, lifetimeEarned)
    assert.equal(getClickValue(migrated.purchasedUpgrades), oldClicks[purchasedUpgrades]!)
  })
})

test('refus des sauvegardes invalides, corrompues ou impossibles', () => {
  assert.deepEqual(restoreGame(null), INITIAL_GAME)
  assert.deepEqual(restoreGame({ balance: 10, lifetimeEarned: 5, purchasedUpgrades: 0 }), INITIAL_GAME)
  assert.deepEqual(restoreGame({ balance: 100, lifetimeEarned: 100, purchasedUpgrades: 49 }), INITIAL_GAME)
  assert.deepEqual(migrateLegacyGame({ balance: 100, lifetimeEarned: 100, purchasedUpgrades: 5 }), INITIAL_GAME)
  assert.deepEqual(restoreGame({ balance: 15, lifetimeEarned: 35, purchasedUpgrades: 1 }, { experiencePoints: 140 }), { balance: 15, lifetimeEarned: 35, purchasedUpgrades: 1 })
})

test('migration v2 : chaque ancien boost conserve exactement le revenu par clic', () => {
  let earned = 0
  for (let purchases = 0; purchases <= 29; purchases++) {
    if (purchases > 0) earned += Math.round(35 * 1.21 ** (purchases - 1))
    const oldRate = purchases <= 9 ? purchases + 1 : 10 + 2 * (purchases - 9)
    const balance = Math.floor(earned / 2)
    const migrated = migrateV2Game({ balance, lifetimeEarned: earned, purchasedUpgrades: purchases })
    assert.equal(migrated.balance, balance)
    assert.equal(migrated.lifetimeEarned, earned)
    assert.equal(getClickValue(migrated.purchasedUpgrades), oldRate)
  }
})

test('migration v2 : les données impossibles sont refusées', () => {
  assert.deepEqual(migrateV2Game({ balance: 100, lifetimeEarned: 100, purchasedUpgrades: 20 }), INITIAL_GAME)
})

test('le solde négatif est refusé par défaut et accepté uniquement pour la v5 fiscale', () => {
  const raw = { balance: -12.34, lifetimeEarned: 100, purchasedUpgrades: 1 }
  assert.deepEqual(restoreGame(raw), INITIAL_GAME)
  assert.deepEqual(restoreGame(raw, { allowNegativeBalance: true, experiencePoints: 400 }), raw)
  assert.deepEqual(restoreGame({ ...raw, balance: Number.NaN }, { allowNegativeBalance: true }), INITIAL_GAME)
  assert.deepEqual(restoreGame({ ...raw, balance: Number.NEGATIVE_INFINITY }, { allowNegativeBalance: true }), INITIAL_GAME)
  assert.deepEqual(restoreGame({ ...raw, balance: -0.001 }, { allowNegativeBalance: true }), INITIAL_GAME)
  assert.deepEqual(restoreGame({ ...raw, balance: Number.MIN_SAFE_INTEGER }, { allowNegativeBalance: true }), INITIAL_GAME)
})

test('un joueur endetté gagne normalement des clics sans pouvoir acheter à crédit', () => {
  const negative = restoreGame({ balance: -5, lifetimeEarned: 100, purchasedUpgrades: 1 }, { allowNegativeBalance: true, experiencePoints: 400 })
  assert.deepEqual(purchaseUpgrade(negative), negative)
  const credited = earnClick(negative)
  assert.equal(credited.balance, -3)
  assert.equal(credited.lifetimeEarned, 102)
  assert.equal(purchaseUpgrade(credited), credited)
})
