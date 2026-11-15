import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState } from './capital.ts'
import { ACHIEVEMENTS, achievementProgress, claimAchievement, getAchievementOffers,
  getClaimableAchievementCount } from './achievements.ts'
import { performPrestige } from './ascension/engine.ts'
import { createSaveExport, prepareSaveImport } from './save-transfer.ts'

const NOW = 1_800_000_000_000

test('26 cadeaux à identifiants uniques, seuils croissants et récompenses sûres', () => {
  const tiers = ACHIEVEMENTS.flatMap(group => group.tiers)
  assert.equal(tiers.length, 26)
  assert.equal(new Set(tiers.map(t => t.id)).size, tiers.length)
  for (const group of ACHIEVEMENTS) {
    assert.ok(group.tiers.length >= 4)
    for (const [i, t] of group.tiers.entries()) {
      assert.ok(Number.isSafeInteger(t.rewardCents) && t.rewardCents > 0)
      assert.ok(Number.isSafeInteger(t.target) && t.target > 0)
      if (i > 0) {
        assert.ok(t.target > group.tiers[i - 1]!.target)
        assert.ok(t.rewardCents >= group.tiers[i - 1]!.rewardCents)
      }
    }
  }
})

test('anciennes sauvegardes : les paliers existants sont déverrouillés sans cadeau automatique', () => {
  const state = createCapitalState({ balance: 25_000, lifetimeEarned: 100_000, purchasedUpgrades: 0 }, NOW)
  state.stats.clickCount = 1_234
  state.enterprises.owned.kiosque = { level: 1, investedCents: 5_000 }
  const legacy = JSON.parse(JSON.stringify(state))
  delete legacy.achievements
  const migrated = restoreCapitalState(legacy, NOW)
  assert.deepEqual(migrated.achievements, { claimedIds: [], cycleGiftCents: 0 })
  assert.equal(migrated.game.balance, 25_000)
  assert.equal(achievementProgress(migrated, 'clicks'), 1_234)
  assert.equal(achievementProgress(migrated, 'earnings'), 100_000)
  assert.equal(achievementProgress(migrated, 'enterprises'), 1)
  assert.ok(getClaimableAchievementCount(migrated) >= 8)
  const restored = prepareSaveImport(JSON.stringify(legacy), NOW)
  assert.equal(restored.ok, true)
  if (restored.ok) assert.deepEqual(restored.preview.state, migrated)
})

test('cash unique : pas d XP/Fame/taxe, et sérialisation stable après réclamation', () => {
  const state = createCapitalState({ balance: 25, lifetimeEarned: 1_500, purchasedUpgrades: 0 }, NOW)
  state.stats.clickCount = 101
  const beforeXp = state.prestige.experienceCents
  const beforeFame = state.prestige.fameMicros
  const beforeTax = state.fiscal.taxesDueCents
  const result = claimAchievement(state, 'clicks-100')
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.rewardCents, 10_000)
  assert.equal(result.state.game.balance, 125)
  assert.equal(result.state.game.lifetimeEarned, 1_500)
  assert.equal(result.state.prestige.experienceCents, beforeXp)
  assert.equal(result.state.prestige.fameMicros, beforeFame)
  assert.equal(result.state.fiscal.taxesDueCents, beforeTax)
  assert.deepEqual(result.state.achievements.claimedIds, ['clicks-100'])
  assert.equal(result.state.achievements.cycleGiftCents, 10_000)
  const second = claimAchievement(result.state, 'clicks-100')
  assert.deepEqual(second, { ok:false, state:result.state, error:'claimed' })
  const save = createSaveExport(result.state, NOW)
  const imported = prepareSaveImport(save, NOW)
  assert.equal(imported.ok, true)
  if (!imported.ok) return
  assert.deepEqual(imported.preview.state, result.state)
  assert.equal(getClaimableAchievementCount(imported.preview.state),
    getClaimableAchievementCount(result.state))
  assert.equal(claimAchievement(imported.preview.state, 'clicks-100').ok, false)
})

test('récompenses validées même en découvert fiscal ; aucun achat non débloqué', () => {
  const state = createCapitalState({ balance: -12.34, lifetimeEarned: 1_000, purchasedUpgrades: 0 }, NOW)
  state.stats.clickCount = 100
  assert.deepEqual(claimAchievement(state, 'never-happened'), {
    ok:false, state, error:'unknown',
  })
  const locked = claimAchievement(state, 'clicks-1000')
  assert.deepEqual(locked, { ok:false, state, error:'locked' })
  const result = claimAchievement(state, 'clicks-100')
  assert.ok(result.ok)
  if (result.ok) assert.equal(result.state.game.balance, 87.66)
})

test('le Prestige conserve les cadeaux déjà récupérés et le record de niveau', () => {
  const initial = createCapitalState({
    balance: 150_000_000, lifetimeEarned: 150_000_000, purchasedUpgrades: 0,
  }, NOW)
  const claimed = claimAchievement(initial, 'level-5')
  assert.equal(claimed.ok, true)
  if (!claimed.ok) return
  const advanced = performPrestige(claimed.state, NOW)
  assert.equal(advanced.ok, true)
  if (!advanced.ok) return
  assert.deepEqual(advanced.state.achievements.claimedIds, ['level-5'])
  assert.equal(advanced.state.achievements.cycleGiftCents, 0)
  assert.equal(advanced.state.game.balance, 0)
  assert.equal(advanced.state.stats.clickCount, 0)
  assert.equal(advanced.state.ascension.progress.prestigeCount, 1)
  assert.ok(getAchievementOffers(advanced.state).find(offer => offer.id === 'prestiges-1')?.claimable)
  assert.equal(claimAchievement(advanced.state, 'level-5').ok, false)
  const fresh = createCapitalState(undefined, NOW)
  assert.deepEqual(fresh.achievements.claimedIds, [])
  assert.equal(fresh.achievements.cycleGiftCents, 0)
})

test('un cadeau fait dépasser les revenus sans invalider la sauvegarde ni l XP', () => {
  const state = createCapitalState({ balance: 1_500, lifetimeEarned: 1_500, purchasedUpgrades: 0 }, NOW)
  state.stats.clickCount = 100
  const gift = claimAchievement(state, 'clicks-100')
  assert.ok(gift.ok)
  if (!gift.ok) return
  const restored = restoreCapitalState(JSON.parse(JSON.stringify(gift.state)), NOW)
  assert.deepEqual(restored, gift.state)
  assert.equal(restored.game.balance, 1_600)
  assert.equal(restored.game.lifetimeEarned, 1_500)
  const imported = prepareSaveImport(createSaveExport(gift.state, NOW), NOW)
  assert.equal(imported.ok, true)
  if (imported.ok) assert.deepEqual(imported.preview.state, gift.state)
  const old = JSON.parse(JSON.stringify(gift.state))
  delete old.achievements.cycleGiftCents
  const migrated = prepareSaveImport(JSON.stringify(old), NOW)
  assert.equal(migrated.ok, true)
  if (migrated.ok) assert.deepEqual(migrated.preview.state, gift.state)
})

test('sauvegardes falsifiées avec doublons, IDs inconnus ou gains incorrects : rejet à l import', () => {
  const state = createCapitalState({ balance: 5_000, lifetimeEarned: 5_000, purchasedUpgrades: 0 }, NOW)
  state.stats.clickCount = 100
  const claimed = claimAchievement(state, 'clicks-100')
  assert.ok(claimed.ok)
  if (!claimed.ok) return
  const edits: Array<(value: any) => void> = [
    x => { x.state.achievements.claimedIds = ['clicks-100', 'clicks-100'] },
    x => { x.state.achievements.claimedIds = ['pretend-millionaire'] },
    x => { x.state.achievements.claimedIds = 'everything' },
    x => { x.state.achievements.extra = 1 },
    x => { x.state.achievements.cycleGiftCents = 9999999999 },
  ]
  for (const edit of edits) {
    const raw = JSON.parse(createSaveExport(claimed.state, NOW))
    edit(raw)
    assert.deepEqual(prepareSaveImport(JSON.stringify(raw), NOW),
      { ok:false, error:'invalid-save' })
  }
})
