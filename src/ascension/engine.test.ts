import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState } from '../capital.ts'
import { getLevel, getLevelStartThreshold } from '../game.ts'
import { creditExperience, FAME_MICROS } from '../prestige/state.ts'
import { buyCollectionItem } from '../prestige/collections.ts'
import { buyFameUpgrade } from '../prestige/shop.ts'
import { buyEnterprise } from '../economy/enterprises.ts'
import { accrueProfitTax, payTaxesEarly } from '../economy/fiscal.ts'
import { getCapitalStatsOverview } from '../economy/stats-overview.ts'
import { createSaveExport, prepareSaveImport } from '../save-transfer.ts'
import { previewPrestigePoints } from './contracts.ts'
import { ASCENSION_TOTAL_COST, ASCENSION_TOTAL_LEVELS, nextAscensionCost } from './catalog.ts'
import { commitPrestige, performPrestige } from './engine.ts'
import { restoreAscensionState } from './state.ts'

const NOW = 1_800_000_000_000
function funded(): ReturnType<typeof createCapitalState> {
  return createCapitalState({ balance: 120_000_000, lifetimeEarned: 120_000_000, purchasedUpgrades: 0 }, NOW)
}

test('Catalogue officiel : 18 upgrades, 87 niveaux, 1637 PP avec prix arithmétiques', () => {
  assert.equal(ASCENSION_TOTAL_LEVELS, 87)
  assert.equal(ASCENSION_TOTAL_COST, 1637)
  assert.equal(nextAscensionCost('auto-click', 0), 1)
  assert.equal(nextAscensionCost('auto-click', 19), 20)
  assert.equal(nextAscensionCost('time-accelerator', 4), 48)
  assert.equal(nextAscensionCost('auto-trader', 1), null)
})

test('Migration V6 vers V7 : stocks, Fame, objets et niveaux intacts, record mondial initialisé', () => {
  const original = funded()
  const collection = buyCollectionItem(original, 'watches-01')
  assert.ok(collection.ok)
  const fame = buyFameUpgrade(collection.state, 'click', 0)
  assert.ok(fame.ok)
  const { ascension: _ignore, ...six } = fame.state
  void _ignore
  const raw = { ...six, version: 6 }
  const result = prepareSaveImport(JSON.stringify(raw), NOW)
  assert.ok(result.ok)
  assert.equal(result.preview.sourceVersion, 6)
  const state = result.preview.state
  assert.deepEqual(state.prestige, fame.state.prestige)
  assert.deepEqual(state.game, fame.state.game)
  assert.deepEqual(state.trading, fame.state.trading)
  assert.deepEqual(state.prestige.ownedCollectionIds, ['watches-01'])
  assert.equal(state.ascension.progress.highestFameAwardedLevel, state.prestige.lastAwardedLevel)
  assert.equal(state.ascension.progress.availablePoints, 0)
  assert.equal(state.ascension.progress.prestigeCount, 0)
  assert.deepEqual(restoreCapitalState(state, NOW), state)
})

test('Premier Prestige : reset économique, collection et Fame conservées, PP acquis une seule fois', () => {
  const original = funded()
  const business = buyEnterprise(original, 'kiosque', NOW)
  assert.ok(business.ok)
  const collect = buyCollectionItem(business.state, 'watches-01')
  assert.ok(collect.ok)
  const fame = buyFameUpgrade(collect.state, 'click', 0)
  assert.ok(fame.ok)
  const current = fame.state
  const before = getCapitalStatsOverview(current)
  const expected = previewPrestigePoints(before.netWorth - before.collectionBookValue, before.level)
  assert.ok(expected >= 20)
  const result = performPrestige(current, NOW)
  assert.ok(result.ok)
  const next = result.state
  assert.equal(result.receipt.earnedPoints, expected)
  assert.equal(next.game.balance, 0)
  assert.equal(next.game.lifetimeEarned, 0)
  assert.equal(next.game.purchasedUpgrades, 0)
  assert.deepEqual(next.trading.positions, {})
  assert.deepEqual(next.enterprises.owned, {})
  assert.equal(next.stats.clickCount, 0)
  assert.equal(next.prestige.experienceCents, 0)
  assert.equal(next.prestige.lastAwardedLevel, 1)
  assert.equal(next.prestige.fameMicros, current.prestige.fameMicros)
  assert.deepEqual(next.prestige.boosts, current.prestige.boosts)
  assert.deepEqual(next.prestige.ownedCollectionIds, current.prestige.ownedCollectionIds)
  assert.equal(next.fiscal.periodStartedAt, current.fiscal.periodStartedAt)
  assert.deepEqual(next.fiscal.paidBySourceCents, current.fiscal.paidBySourceCents)
  assert.equal(next.ascension.progress.highestFameAwardedLevel, current.prestige.lastAwardedLevel)
  assert.equal(next.ascension.progress.prestigeCount, 1)
  assert.equal(next.ascension.progress.availablePoints, expected)
  assert.equal(next.ascension.progress.history[0]?.earnedPoints, expected)
  const again = performPrestige(next, NOW)
  assert.equal(again.ok, false)
  if (!again.ok) assert.equal(again.error, 'insufficient-level')
  assert.strictEqual(again.state, next)
  assert.deepEqual(restoreCapitalState(JSON.parse(JSON.stringify(next)), NOW), next)
  const exported = prepareSaveImport(createSaveExport(next, NOW), NOW)
  assert.ok(exported.ok)
  assert.deepEqual(exported.preview.state, next)
})

test('Record Fame permanent : rejouer les niveaux 1..ancien record ne donne aucune Fame', () => {
  const first = performPrestige(funded(), NOW)
  assert.ok(first.ok)
  const oldRecord = first.state.ascension.progress.highestFameAwardedLevel
  const originalFame = first.state.prestige.fameMicros
  const replay = creditExperience(first.state, getLevelStartThreshold(oldRecord) * 100)
  assert.ok(replay)
  assert.equal(getLevel(replay.prestige.experienceCents / 100), oldRecord)
  assert.equal(replay.prestige.fameMicros, originalFame)
  assert.equal(replay.ascension.progress.highestFameAwardedLevel, oldRecord)
  const newRecord = creditExperience(replay, (getLevelStartThreshold(oldRecord + 1) - getLevelStartThreshold(oldRecord)) * 100)
  assert.ok(newRecord)
  assert.equal(newRecord.ascension.progress.highestFameAwardedLevel, oldRecord + 1)
  assert.equal(newRecord.prestige.fameMicros - originalFame, (oldRecord + 1) * FAME_MICROS)
  assert.deepEqual(restoreCapitalState(newRecord, NOW), newRecord)
})

test('Prestige refuse taxes impayées, niveau insuffisant, seuil insuffisant et retard de marché', () => {
  const current = funded()
  const taxed = accrueProfitTax(current, 'stocks', 100_000)
  assert.ok(taxed)
  const denied = performPrestige(taxed, NOW)
  assert.equal(denied.ok, false)
  if (!denied.ok) assert.equal(denied.error, 'pending-fiscal-debt')
  assert.strictEqual(denied.state, taxed)
  const paid = payTaxesEarly(taxed, NOW)
  assert.ok(paid.ok)
  const done = performPrestige(paid.state, NOW)
  assert.ok(done.ok)
  assert.equal(done.state.fiscal.taxesDueCents, 0)
  assert.equal(done.state.fiscal.taxesPaidCents, paid.state.fiscal.taxesPaidCents)
  assert.equal(done.state.fiscal.periodStartedAt, NOW)
  const lowLevel = createCapitalState(undefined, NOW)
  const refusedLevel = performPrestige(lowLevel, NOW)
  assert.equal(refusedLevel.ok, false)
  if (!refusedLevel.ok) assert.equal(refusedLevel.error, 'insufficient-level')
  const lowWorth = createCapitalState({
    balance: getLevelStartThreshold(100), lifetimeEarned: getLevelStartThreshold(100), purchasedUpgrades: 0,
  }, NOW)
  const refusedWorth = performPrestige(lowWorth, NOW)
  assert.equal(refusedWorth.ok, false)
  if (!refusedWorth.ok) assert.equal(refusedWorth.error, 'insufficient-worth')
  const pending = performPrestige(funded(), NOW + 10_000)
  assert.equal(pending.ok, false)
  if (!pending.ok) assert.equal(pending.error, 'pending-market-replay')
})

test('Écriture atomique : pas de nouveau PP ni reset si le stockage refuse ou lève', () => {
  const original = funded()
  let writes = 0
  const rejected = commitPrestige(original, NOW, () => { writes++; return false })
  assert.equal(writes, 1)
  assert.equal(rejected.ok, false)
  if (!rejected.ok) assert.equal(rejected.error, 'storage-error')
  assert.strictEqual(rejected.state, original)
  const thrown = commitPrestige(original, NOW, () => { throw new Error('Quota') })
  assert.equal(thrown.ok, false)
  assert.strictEqual(thrown.state, original)
  const accepted = commitPrestige(original, NOW, next => {
    assert.ok(next.ascension.progress.availablePoints >= 20)
    return true
  })
  assert.ok(accepted.ok)
})

test('JSON V7 incohérent : PP, ledger, cycles, record Fame et historique falsifiés rejetés', () => {
  const result = performPrestige(funded(), NOW)
  assert.ok(result.ok)
  const good = result.state
  const changes: Array<(state: any) => void> = [
    s => { s.ascension.progress.availablePoints++ },
    s => { s.ascension.progress.highestFameAwardedLevel = 1 },
    s => { s.ascension.progress.upgradeLevels['auto-click'] = 3 },
    s => { s.ascension.progress.history[0].earnedPoints++ },
    s => { s.ascension.progress.prestigeCount++ },
    s => { s.ascension.run.startedAtRealMs = NOW + 86_400_000 },
  ]
  for (const change of changes) {
    const dirty = JSON.parse(JSON.stringify(good))
    change(dirty)
    assert.deepEqual(prepareSaveImport(JSON.stringify(dirty), NOW), { ok: false, error: 'invalid-save' })
  }
  assert.equal(restoreAscensionState(null, NOW, 1, FAME_MICROS), null)
})

test('RESET complet recrée Fame et Prestige ; un prochain cycle repart sans historique', () => {
  const result = performPrestige(funded(), NOW)
  assert.ok(result.ok)
  const fresh = createCapitalState(undefined, NOW)
  assert.equal(fresh.ascension.progress.availablePoints, 0)
  assert.equal(fresh.ascension.progress.lifetimePoints, 0)
  assert.equal(fresh.ascension.progress.highestFameAwardedLevel, 1)
  assert.deepEqual(fresh.ascension.progress.history, [])
  assert.equal(fresh.prestige.fameMicros, FAME_MICROS)
})

test('Deux Prestiges consécutifs après reconstruction : PP cumulés, aucune ressource héritée du run', () => {
  const first = performPrestige(funded(), NOW)
  assert.ok(first.ok)
  const rebuiltXp = creditExperience(first.state, 150_000_000 * 100)
  assert.ok(rebuiltXp)
  const rebuilt = {
    ...rebuiltXp,
    game: { balance: 150_000_000, lifetimeEarned: 150_000_000, purchasedUpgrades: 0 },
  }
  const second = performPrestige(rebuilt, NOW)
  assert.ok(second.ok)
  assert.equal(second.state.ascension.progress.prestigeCount, 2)
  assert.equal(second.state.ascension.progress.history.length, 2)
  assert.equal(second.state.ascension.progress.lifetimePoints, first.receipt.earnedPoints + second.receipt.earnedPoints)
  assert.equal(second.state.ascension.progress.availablePoints, second.state.ascension.progress.lifetimePoints)
  assert.deepEqual(restoreCapitalState(second.state, NOW), second.state)
})
