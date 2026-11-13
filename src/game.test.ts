import assert from 'node:assert/strict'
import test from 'node:test'
import {
  INITIAL_GAME,
  earnClick,
  getClickValue,
  getLevel,
  getNextLevelThreshold,
  purchaseUpgrade,
  restoreGame,
  UPGRADES,
} from './game.ts'

test('le niveau dépend du total des gains (et pas du solde)', () => {
  assert.equal(getLevel(0), 1)
  assert.equal(getLevel(99), 1)
  assert.equal(getLevel(100), 2)
  assert.equal(getLevel(500), 3)
  assert.equal(getNextLevelThreshold(100), 500)
  assert.equal(getNextLevelThreshold(50_000), null)
})

test('clic puis achat : le total gagné ne diminue jamais', () => {
  let state = { balance: 99, lifetimeEarned: 99, purchasedUpgrades: 0 }
  state = earnClick(state)
  assert.equal(state.balance, 100)
  assert.equal(state.lifetimeEarned, 100)
  state = purchaseUpgrade(state)
  assert.deepEqual(state, { balance: 50, lifetimeEarned: 100, purchasedUpgrades: 1 })
  assert.equal(getClickValue(state.purchasedUpgrades), 2)
  state = earnClick(state)
  assert.equal(state.balance, 52)
  assert.equal(state.lifetimeEarned, 102)
  assert.equal(getLevel(state.lifetimeEarned), 2)
})

test('une amélioration ne peut pas être achetée avant son niveau ou sans argent', () => {
  const notUnlocked = { balance: 100, lifetimeEarned: 99, purchasedUpgrades: 0 }
  assert.deepEqual(purchaseUpgrade(notUnlocked), notUnlocked)
  const notEnough = { balance: 25, lifetimeEarned: 100, purchasedUpgrades: 0 }
  assert.deepEqual(purchaseUpgrade(notEnough), notEnough)
})

test('les améliorations se débloquent dans l’ordre et toutes les étapes ont un prix', () => {
  assert.equal(UPGRADES.length, 5)
  UPGRADES.forEach((upgrade, index) => {
    assert.equal(upgrade.requiredLevel, index + 2)
    assert.ok(upgrade.price > 0)
    assert.ok(upgrade.clickValue > (index === 0 ? 1 : UPGRADES[index - 1]!.clickValue))
  })
})

test('chargement protégé contre données invalides et achats incohérents', () => {
  assert.deepEqual(restoreGame(null), INITIAL_GAME)
  assert.deepEqual(restoreGame({ balance: 10, lifetimeEarned: 5, purchasedUpgrades: 0 }), INITIAL_GAME)
  assert.deepEqual(restoreGame({ balance: 100, lifetimeEarned: 100, purchasedUpgrades: 5 }), INITIAL_GAME)
  assert.deepEqual(restoreGame({ balance: 50, lifetimeEarned: 100, purchasedUpgrades: 1 }), { balance: 50, lifetimeEarned: 100, purchasedUpgrades: 1 })
})
