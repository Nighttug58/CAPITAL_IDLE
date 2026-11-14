import assert from 'node:assert/strict'
import test from 'node:test'
import { CAPITAL_SAVE_VERSION, createCapitalState, restoreCapitalState } from '../capital.ts'
import { getLevel, getLevelStartThreshold, LEVEL_THRESHOLD_FACTOR } from '../game.ts'
import { createSaveExport, prepareSaveImport } from '../save-transfer.ts'
import { isEnterpriseUnlocked } from '../economy/catalog.ts'
import { BASE_XP_EARN_RATE_BPS, FAME_MICROS, creditExperience, restorePrestigeState } from './state.ts'

const NOW = 1_800_000_000_000
test('fresh Fame and level-up: level 1 grants 1, level 2 grants 2', () => {
  const fresh = createCapitalState(undefined, NOW)
  assert.equal(CAPITAL_SAVE_VERSION, 6)
  assert.equal(fresh.prestige.experienceCents, 0)
  assert.equal(fresh.prestige.fameMicros, FAME_MICROS)
  assert.equal(fresh.prestige.lastAwardedLevel, 1)
  assert.deepEqual(fresh.prestige.ownedCollectionIds, [])
  assert.ok(Object.values(fresh.prestige.boosts).every(level => level === 0))
  assert.equal(BASE_XP_EARN_RATE_BPS, 10000)
  assert.equal(creditExperience(fresh, 3500)?.prestige.experienceCents, 3500)
  const second = creditExperience(fresh, 14_000)
  assert.ok(second)
  assert.equal(second.prestige.lastAwardedLevel, 2)
  assert.equal(second.prestige.fameMicros, 3 * FAME_MICROS)
  assert.equal(second.game.balance, 0)
  assert.equal(second.game.lifetimeEarned, 0)
  assert.strictEqual(creditExperience(second, 0), second)
})

test('multi-level gains and milestones 50/51, 99/100, 100/101', () => {
  for (const level of [50, 51, 99, 100, 101, 120]) {
    const initial = createCapitalState(undefined, NOW)
    const threshold = getLevelStartThreshold(level)
    const achieved = creditExperience(initial, threshold * 100)
    assert.ok(achieved)
    assert.equal(achieved.prestige.lastAwardedLevel, level)
    assert.equal(achieved.prestige.fameMicros / FAME_MICROS, level * (level + 1) / 2)
    const small = creditExperience(achieved, 1)
    assert.ok(small)
    assert.equal(small.prestige.fameMicros, achieved.prestige.fameMicros)
  }
  assert.equal(isEnterpriseUnlocked('groupe-technologique', 49), false)
  assert.equal(isEnterpriseUnlocked('groupe-technologique', 50), true)
  assert.equal(isEnterpriseUnlocked('groupe-technologique', 101), true)
})

test('v5 migration allocates Fame once and preserves economic history', () => {
  const current = createCapitalState({
    balance: 1200, lifetimeEarned: getLevelStartThreshold(50) / 4, purchasedUpgrades: 3,
  }, NOW)
  const { prestige: _old, ...other } = current
  void _old
  const savedV5 = { ...other, version: 5 }
  const first = restoreCapitalState(savedV5, NOW)
  assert.equal(first.version, 6)
  assert.deepEqual(first.game, current.game)
  assert.deepEqual(first.trading, current.trading)
  assert.deepEqual(first.fiscal, current.fiscal)
  assert.deepEqual(first.enterprises, current.enterprises)
  assert.equal(first.prestige.lastAwardedLevel, 50)
  assert.equal(first.prestige.fameMicros / FAME_MICROS, 1275)
  assert.deepEqual(restoreCapitalState(first, NOW), first)
  const oldImport = prepareSaveImport(JSON.stringify(savedV5), NOW)
  assert.ok(oldImport.ok)
  assert.equal(oldImport.preview.sourceVersion, 5)
  assert.equal(oldImport.preview.state.prestige.fameMicros, 1275 * FAME_MICROS)
  const newImport = prepareSaveImport(createSaveExport(oldImport.preview.state, NOW), NOW)
  assert.ok(newImport.ok)
  assert.deepEqual(newImport.preview.state, oldImport.preview.state)
})

test('corrupted Fame is never silently accepted by strict v6 imports', () => {
  const original = createCapitalState(undefined, NOW)
  const invalid = [
    { ...original.prestige, fameMicros: -1 },
    { ...original.prestige, fameMicros: Infinity },
    { ...original.prestige, experienceCents: -1 },
    { ...original.prestige, lastAwardedLevel: 99 },
    { ...original.prestige, ownedCollectionIds: ['watches-01', 'watches-01'] },
    { ...original.prestige, boosts: { ...original.prestige.boosts, fame: 21 } },
  ]
  for (const prestige of invalid) {
    assert.deepEqual(restorePrestigeState(prestige, 0), original.prestige)
    const result = prepareSaveImport(createSaveExport({ ...original, prestige }, NOW), NOW)
    assert.deepEqual(result, { ok: false, error: 'invalid-save' })
  }
})

test('legacy v6: preserve current player level, 49 click upgrades and Fame on 4x XP migration', () => {
  const historicEarnings = getLevelStartThreshold(50) / LEVEL_THRESHOLD_FACTOR
  const game = {
    balance: 12_000, lifetimeEarned: historicEarnings, purchasedUpgrades: 49,
  }
  const template = createCapitalState(game, NOW)
  const historicLevel = getLevel(historicEarnings * LEVEL_THRESHOLD_FACTOR)
  assert.equal(historicLevel, 50)
  const historicFame = historicLevel * (historicLevel + 1) / 2 * FAME_MICROS
  const historicPrestige = {
    ...template.prestige,
    experienceCents: historicEarnings * 100,
    lastAwardedLevel: historicLevel,
    fameMicros: historicFame, lifetimeFameMicros: historicFame,
    levelFameMicros: historicFame,
  }
  const { xpCurveVersion: _curve, ...legacyPrestige } = historicPrestige
  void _curve
  const legacy = { ...template, prestige: legacyPrestige }
  const restored = restoreCapitalState(legacy, NOW)
  assert.deepEqual(restored.game, game)
  assert.equal(restored.prestige.lastAwardedLevel, 50)
  assert.equal(restored.prestige.experienceCents, getLevelStartThreshold(50) * 100)
  assert.equal(restored.prestige.fameMicros, historicFame)
  assert.equal(restored.prestige.lifetimeFameMicros, historicFame)
  assert.equal(restored.prestige.xpCurveVersion, 2)
  assert.deepEqual(restoreCapitalState(restored, NOW), restored)
  const accepted = prepareSaveImport(createSaveExport(legacy, NOW), NOW)
  assert.ok(accepted.ok)
  assert.deepEqual(accepted.preview.state, restored)
  const twice = prepareSaveImport(createSaveExport(restored, NOW), NOW)
  assert.ok(twice.ok)
  assert.deepEqual(twice.preview.state, restored)
})

test('fresh XP remains 1 per dollar; level 2 requires 140 XP, Fame paid once', () => {
  const initial = createCapitalState(undefined, NOW)
  const almost = creditExperience(initial, 13_900)
  assert.ok(almost)
  assert.equal(almost.prestige.experienceCents, 13_900)
  assert.equal(almost.prestige.lastAwardedLevel, 1)
  assert.equal(almost.prestige.fameMicros, FAME_MICROS)
  const crossed = creditExperience(almost, 100)
  assert.ok(crossed)
  assert.equal(crossed.prestige.experienceCents, 14_000)
  assert.equal(crossed.prestige.lastAwardedLevel, 2)
  assert.equal(crossed.prestige.fameMicros, 3 * FAME_MICROS)
})
