import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState, type CapitalState } from '../capital.ts'
import {
  getLegacyLevelStartThreshold, getLevel, getLevelStartThreshold,
  migrateExperienceCentsToTieredCurve,
} from '../game.ts'
import { earnCapitalClick } from '../economy/stats-ledger.ts'
import { createInitialAscensionState } from '../ascension/state.ts'
import { performPrestige } from '../ascension/engine.ts'
import { createSaveExport, prepareSaveImport } from '../save-transfer.ts'
import { getPurchasedFameBoostCost } from './catalog.ts'
import { getAbsolutePrestigeStatus } from './absolute.ts'
import { FAME_MICROS, XP_CURVE_VERSION } from './state.ts'

const NOW = 1_800_000_000_000
const ALL_MAX = { click: 20, enterprise: 20, dividend: 20, xp: 20, trading: 20, fame: 20 } as const

/** Simule le niveau 250 observé, avec 7,11 % du niveau 251 et 1,8 milliard de Fame. */
function oldSave(): CapitalState {
  const lvl = 250
  const oldStart = getLegacyLevelStartThreshold(lvl) * 100
  const oldSpan = (getLegacyLevelStartThreshold(lvl + 1) - getLegacyLevelStartThreshold(lvl)) * 100
  const oldExperienceCents = oldStart + Math.round(oldSpan * 0.0711)
  const seed = createCapitalState({
    balance: 308_183_386.09,
    lifetimeEarned: oldExperienceCents / 100,
    purchasedUpgrades: 999,
  }, NOW)
  const available = 1_803_896_100 * FAME_MICROS
  const spent = getPurchasedFameBoostCost(ALL_MAX)
  assert.ok(spent !== null)
  const levelFameMicros = available + spent * FAME_MICROS
  const old = {
    ...seed, prestige: {
      ...seed.prestige,
      xpCurveVersion: 2,
      experienceCents: oldExperienceCents,
      lastAwardedLevel: lvl,
      levelFameMicros,
      lifetimeFameMicros: levelFameMicros,
      collectionFameMicros: 0,
      fameMicros: available,
      boosts: ALL_MAX,
      ownedCollectionIds: [],
    },
    ascension: createInitialAscensionState(NOW, lvl),
  }
  return old as unknown as CapitalState
}

test('niveau 250 et 1,8 milliard Fame : migration conserve niveau, %, Fame et achats', () => {
  const old = oldSave()
  const savedSnapshot = JSON.stringify(old)
  const migrated = restoreCapitalState(old, NOW)
  const { xpRebase, ...withoutRebase } = migrated.prestige
  assert.ok(xpRebase)
  assert.equal(migrated.prestige.xpCurveVersion, XP_CURVE_VERSION)
  assert.equal(migrated.prestige.lastAwardedLevel, 250)
  assert.equal(getLevel(migrated.prestige.experienceCents / 100), 250)
  const currentStart = getLevelStartThreshold(250) * 100
  const currentSpan = (getLevelStartThreshold(251) - getLevelStartThreshold(250)) * 100
  const newPercent = (migrated.prestige.experienceCents - currentStart) / currentSpan
  assert.ok(Math.abs(newPercent - 0.0711) < 1e-7)
  assert.equal(migrated.prestige.experienceCents,
    migrateExperienceCentsToTieredCurve(old.prestige.experienceCents))
  assert.equal(xpRebase.fromCents, old.prestige.experienceCents)
  assert.equal(xpRebase.toCents, migrated.prestige.experienceCents)
  assert.equal(withoutRebase.fameMicros, old.prestige.fameMicros)
  assert.equal(withoutRebase.lifetimeFameMicros, old.prestige.lifetimeFameMicros)
  assert.deepEqual(withoutRebase.boosts, old.prestige.boosts)
  assert.deepEqual(migrated.game, old.game)
  assert.deepEqual(migrated.trading, old.trading)
  assert.deepEqual(migrated.enterprises, old.enterprises)
  assert.deepEqual(migrated.fiscal, old.fiscal)
  assert.deepEqual(migrated.stats, old.stats)
  assert.deepEqual(migrated.achievements, old.achievements)
  assert.deepEqual(migrated.ascension, old.ascension)
  assert.equal(getAbsolutePrestigeStatus(migrated).factor, 100)
  assert.equal(JSON.stringify(old), savedSnapshot, 'l ancien objet nest pas modifié')
})

test('ancienne sauvegarde v7 : import JSON, rechargement, re-export et idempotence', () => {
  const old = oldSave()
  const imported = prepareSaveImport(createSaveExport(old, NOW), NOW)
  assert.equal(imported.ok, true)
  if (!imported.ok) return
  const current = imported.preview.state
  assert.equal(current.prestige.lastAwardedLevel, 250)
  assert.equal(current.prestige.xpCurveVersion, XP_CURVE_VERSION)
  const restoredAgain = restoreCapitalState(JSON.parse(JSON.stringify(current)), NOW)
  assert.deepEqual(restoredAgain, current)
  const exportedAgain = prepareSaveImport(createSaveExport(current, NOW), NOW)
  assert.equal(exportedAgain.ok, true)
  if (exportedAgain.ok) assert.deepEqual(exportedAgain.preview.state, current)
  assert.equal(current.prestige.fameMicros, old.prestige.fameMicros)
})

test('un clic sur le run migré conserve le ledger, un nouveau Prestige repart sans rebase', () => {
  const migrated = restoreCapitalState(oldSave(), NOW)
  const clicked = earnCapitalClick(migrated)
  assert.ok(clicked.game.balance > migrated.game.balance)
  assert.ok(clicked.prestige.experienceCents > migrated.prestige.experienceCents)
  assert.equal(clicked.prestige.xpRebase?.fromCents, migrated.prestige.xpRebase?.fromCents)
  const roundTrip = prepareSaveImport(createSaveExport(clicked, NOW), NOW)
  assert.ok(roundTrip.ok, 'l XP convertie et les revenus sont compatibles')
  if (roundTrip.ok) assert.deepEqual(roundTrip.preview.state, clicked)
  const prestiged = performPrestige(clicked, NOW)
  assert.ok(prestiged.ok)
  if (!prestiged.ok) return
  assert.equal(prestiged.state.prestige.experienceCents, 0)
  assert.equal(prestiged.state.prestige.xpRebase, undefined)
  assert.equal(Object.hasOwn(prestiged.state.prestige, 'xpRebase'), false)
  assert.equal(prestiged.state.prestige.fameMicros, clicked.prestige.fameMicros)
  const newRun = prepareSaveImport(createSaveExport(prestiged.state, NOW), NOW)
  assert.ok(newRun.ok)
  if (newRun.ok) assert.deepEqual(newRun.preview.state, prestiged.state)
})

test('rejet des rebases frauduleux et des XP qui dépassent le niveau déclaré', () => {
  const current = restoreCapitalState(oldSave(), NOW)
  const invalid: Array<(value: any) => void> = [
    x => { x.state.prestige.xpRebase.fromCents += 100 },
    x => { x.state.prestige.xpRebase.toCents += 100 },
    x => { x.state.prestige.xpRebase.toCents = 0 },
    x => { x.state.prestige.xpCurveVersion = 999 },
    x => { x.state.prestige.lastAwardedLevel = 1 },
    x => { x.state.prestige.experienceCents = 1 },
    x => { delete x.state.prestige.xpRebase },
  ]
  for (const modify of invalid) {
    const raw = JSON.parse(createSaveExport(current, NOW))
    modify(raw)
    assert.deepEqual(prepareSaveImport(JSON.stringify(raw), NOW),
      { ok: false, error: 'invalid-save' })
  }
})
