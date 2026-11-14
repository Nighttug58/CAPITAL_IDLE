import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState } from '../capital.ts'
import { createSaveExport, prepareSaveImport } from '../save-transfer.ts'
import { FAME_MICROS } from '../prestige/state.ts'
import { ASCENSION_TOTAL_COST, ASCENSION_TOTAL_LEVELS, ASCENSION_UPGRADES, nextAscensionCost } from './catalog.ts'
import { ASCENSION_CATEGORIES, ASCENSION_PRESENTATION } from './presentation.ts'
import { buyAscensionUpgrade, getAscensionOffers, validAscensionShopLedger } from './shop.ts'
import { performPrestige } from './engine.ts'

const NOW = 1_800_000_000_000
function points(wealth = 100_000_000) {
  const initial = createCapitalState({
    balance: wealth, lifetimeEarned: wealth, purchasedUpgrades: 0,
  }, NOW)
  const prestige = performPrestige(initial, NOW)
  assert.ok(prestige.ok)
  return prestige.state
}

test('Prestige : les 18 descriptions UI couvrent toutes les améliorations et les 5 familles', () => {
  assert.equal(ASCENSION_TOTAL_LEVELS, 87)
  assert.equal(ASCENSION_TOTAL_COST, 1637)
  assert.equal(ASCENSION_UPGRADES.length, 18)
  assert.equal(ASCENSION_PRESENTATION.length, 18)
  assert.equal(new Set(ASCENSION_PRESENTATION.map(p => p.id)).size, 18)
  assert.equal(ASCENSION_CATEGORIES.length, 5)
  for (const item of ASCENSION_UPGRADES) {
    const view = ASCENSION_PRESENTATION.find(p => p.id === item.id)
    assert.ok(view)
    assert.ok(view.label.length > 0 && view.description.length > 0)
    assert.ok(ASCENSION_CATEGORIES.some(section => section.id === view.category))
    assert.equal(nextAscensionCost(item.id, item.maxLevel - 1), item.firstCost + (item.maxLevel - 1) * item.stepCost)
  }
})

test('Un upgrade Prestige coûte des PP, survit à la sauvegarde et ne modifie pas Fame/Gold', () => {
  const start = points()
  assert.equal(start.ascension.progress.availablePoints, 20)
  const beforeFame = start.prestige.fameMicros
  const offer = getAscensionOffers(start).find(p => p.id === 'auto-click')
  assert.ok(offer)
  assert.equal(offer.nextCost, 1)
  assert.equal(offer.canAfford, true)
  const first = buyAscensionUpgrade(start, 'auto-click', 0)
  assert.ok(first.ok)
  assert.equal(first.receipt.costPoints, 1)
  assert.equal(first.state.ascension.progress.availablePoints, 19)
  assert.equal(first.state.ascension.progress.lifetimePoints, 20)
  assert.equal(first.state.ascension.progress.upgradeLevels['auto-click'], 1)
  assert.equal(first.state.game.balance, 0)
  assert.equal(first.state.prestige.fameMicros, beforeFame)
  assert.equal(first.state.prestige.fameMicros, start.prestige.fameMicros)
  assert.equal(first.state.prestige.lifetimeFameMicros >= FAME_MICROS, true)
  assert.equal(validAscensionShopLedger(first.state), true)
  const serialized = createSaveExport(first.state, NOW)
  const restored = prepareSaveImport(serialized, NOW)
  assert.ok(restored.ok)
  assert.deepEqual(restored.preview.state, first.state)
  assert.deepEqual(restoreCapitalState(first.state, NOW), first.state)
  const offer2 = getAscensionOffers(first.state).find(p => p.id === 'auto-click')
  assert.equal(offer2?.nextCost, 2)
  const second = buyAscensionUpgrade(first.state, 'auto-click', 1)
  assert.ok(second.ok)
  assert.equal(second.state.ascension.progress.availablePoints, 17)
})

test('Le moteur refuse niveaux obsolètes, inconnus, absence de PP, et état falsifié', () => {
  const start = points()
  const initial = buyAscensionUpgrade(start, 'auto-trader', 0)
  assert.equal(initial.ok, false)
  if (!initial.ok) assert.equal(initial.error, 'insufficient-points')
  const unknown = buyAscensionUpgrade(start, 'not-an-upgrade', 0)
  assert.equal(unknown.ok, false)
  if (!unknown.ok) assert.equal(unknown.error, 'unknown-upgrade')
  const first = buyAscensionUpgrade(start, 'auto-click', 0)
  assert.ok(first.ok)
  const duplicate = buyAscensionUpgrade(first.state, 'auto-click', 0)
  assert.equal(duplicate.ok, false)
  if (!duplicate.ok) {
    assert.equal(duplicate.error, 'stale-level')
    assert.strictEqual(duplicate.state, first.state)
  }
  const forged = {
    ...first.state,
    ascension: { ...first.state.ascension, progress: {
      ...first.state.ascension.progress, availablePoints: 20,
    }},
  }
  assert.equal(validAscensionShopLedger(forged), false)
  const invalid = buyAscensionUpgrade(forged, 'auto-click', 1)
  assert.equal(invalid.ok, false)
  if (!invalid.ok) assert.equal(invalid.error, 'invalid-state')
  assert.deepEqual(prepareSaveImport(JSON.stringify(forged), NOW), { ok: false, error: 'invalid-save' })
})

test('Les coûts d’une branche sont bornés et le niveau MAX ne se rachète jamais', () => {
  const start = points(11_025_000_000)
  assert.equal(start.ascension.progress.availablePoints, 210)
  let state = start
  for (let level = 0; level < 20; level++) {
    const offer = getAscensionOffers(state).find(p => p.id === 'auto-click')
    assert.equal(offer?.nextCost, level + 1)
    const purchase = buyAscensionUpgrade(state, 'auto-click', level)
    assert.ok(purchase.ok)
    assert.equal(purchase.receipt.newLevel, level + 1)
    state = purchase.state
  }
  assert.equal(state.ascension.progress.availablePoints, 0)
  assert.equal(state.ascension.progress.upgradeLevels['auto-click'], 20)
  assert.equal(validAscensionShopLedger(state), true)
  const max = buyAscensionUpgrade(state, 'auto-click', 20)
  assert.equal(max.ok, false)
  if (!max.ok) assert.equal(max.error, 'max-level')
  assert.deepEqual(prepareSaveImport(createSaveExport(state, NOW), NOW).ok, true)
})
