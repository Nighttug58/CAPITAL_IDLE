import assert from 'node:assert/strict'
import test from 'node:test'
import {
  INITIAL_GAME,
  LEVEL_THRESHOLDS,
  earnClick,
  getClickValue,
  getLevel,
  getNextLevelThreshold,
  migrateLegacyGame,
  migrateV2Game,
  purchaseUpgrade,
  restoreGame,
  UPGRADES,
} from './game.ts'

test('50 niveaux lissés avec des seuils strictement croissants', () => {
  assert.equal(LEVEL_THRESHOLDS.length, 50)
  assert.equal(LEVEL_THRESHOLDS[0], 0)
  assert.equal(LEVEL_THRESHOLDS[1], 35)
  assert.equal(LEVEL_THRESHOLDS[2], 74)
  assert.equal(LEVEL_THRESHOLDS[9], 475)
  assert.equal(LEVEL_THRESHOLDS[29], 5_203)
  assert.equal(LEVEL_THRESHOLDS[49], 37_002)
  assert.ok(LEVEL_THRESHOLDS.every((value, index) => index === 0 || value > LEVEL_THRESHOLDS[index - 1]!))
})

test('le niveau dépend du total gagné, pas du solde', () => {
  assert.equal(getLevel(0), 1)
  assert.equal(getLevel(34), 1)
  assert.equal(getLevel(35), 2)
  assert.equal(getLevel(74), 3)
  assert.equal(getNextLevelThreshold(35), 74)
  assert.equal(getNextLevelThreshold(37_002), null)
})

test('clic puis achat : niveau et total gagné sont préservés', () => {
  let state = { balance: 34, lifetimeEarned: 34, purchasedUpgrades: 0 }
  state = earnClick(state)
  assert.equal(state.lifetimeEarned, 35)
  assert.equal(getLevel(state.lifetimeEarned), 2)
  state = purchaseUpgrade(state)
  assert.deepEqual(state, { balance: 15, lifetimeEarned: 35, purchasedUpgrades: 1 })
  assert.equal(getClickValue(state.purchasedUpgrades), 2)
  state = earnClick(state)
  assert.equal(state.balance, 17)
  assert.equal(state.lifetimeEarned, 37)
})

test('impossible d acheter une amélioration avant son niveau ou sans fonds', () => {
  const locked = { balance: 35, lifetimeEarned: 34, purchasedUpgrades: 0 }
  assert.deepEqual(purchaseUpgrade(locked), locked)
  const poor = { balance: 10, lifetimeEarned: 35, purchasedUpgrades: 0 }
  assert.deepEqual(purchaseUpgrade(poor), poor)
})

test('chaque achat apporte exactement +1 $/clic et les prix suivent les paliers', () => {
  assert.equal(UPGRADES.length, 49)
  UPGRADES.forEach((upgrade, index) => {
    const step = LEVEL_THRESHOLDS[index + 1]! - LEVEL_THRESHOLDS[index]!
    assert.equal(upgrade.requiredLevel, index + 2)
    assert.ok(upgrade.price > 0 && upgrade.price < step)
    assert.equal(upgrade.clickValue, index + 2)
    assert.equal(upgrade.clickValue - getClickValue(index), 1)
    if (index > 0) assert.ok(upgrade.price >= UPGRADES[index - 1]!.price)
  })
  assert.equal(UPGRADES[48]!.clickValue, 50)
})

test('progression complète : on peut acheter tous les niveaux sans blocage', () => {
  let state = { ...INITIAL_GAME }
  let clicks = 0
  while (state.purchasedUpgrades < UPGRADES.length && clicks < 100_000) {
    const purchase = purchaseUpgrade(state)
    if (purchase !== state) state = purchase
    else { state = earnClick(state); clicks++ }
  }
  assert.equal(state.purchasedUpgrades, UPGRADES.length)
  assert.equal(getClickValue(state.purchasedUpgrades), 50)
  assert.ok(clicks > 0 && clicks < 5_000)
  assert.ok(state.balance >= 0)
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
  assert.deepEqual(restoreGame({ balance: 15, lifetimeEarned: 35, purchasedUpgrades: 1 }), { balance: 15, lifetimeEarned: 35, purchasedUpgrades: 1 })
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
  assert.deepEqual(restoreGame(raw, { allowNegativeBalance: true }), raw)
  assert.deepEqual(restoreGame({ ...raw, balance: Number.NaN }, { allowNegativeBalance: true }), INITIAL_GAME)
  assert.deepEqual(restoreGame({ ...raw, balance: Number.NEGATIVE_INFINITY }, { allowNegativeBalance: true }), INITIAL_GAME)
  assert.deepEqual(restoreGame({ ...raw, balance: -0.001 }, { allowNegativeBalance: true }), INITIAL_GAME)
  assert.deepEqual(restoreGame({ ...raw, balance: Number.MIN_SAFE_INTEGER }, { allowNegativeBalance: true }), INITIAL_GAME)
})

test('un joueur endetté gagne normalement des clics sans pouvoir acheter à crédit', () => {
  const negative = restoreGame({ balance: -5, lifetimeEarned: 100, purchasedUpgrades: 1 }, { allowNegativeBalance: true })
  assert.deepEqual(purchaseUpgrade(negative), negative)
  const credited = earnClick(negative)
  assert.equal(credited.balance, -3)
  assert.equal(credited.lifetimeEarned, 102)
  assert.equal(purchaseUpgrade(credited), credited)
})
