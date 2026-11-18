import test from 'node:test'
import assert from 'node:assert/strict'
import { COLLECTION_CATEGORIES, CURRENT_COLLECTION_SLOTS, type CollectionCategoryId } from './catalog.ts'
import {
  COLLECTION_MUSEUM_PP_BPS, COLLECTION_SET_REWARDS, COLLECTION_RARITIES,
  collectionRarity, collectionV3BonusBps, collectionV3Snapshot,
} from './collections-v3.ts'
import { createV8CapitalState } from '../exact-state-v8.ts'
import { v8BuyCollection, v8Click, v8CreditIncome, v8BonusBasisPoints, v8EarningBonusBps } from '../exact-runtime-v8.ts'
import { v8PerformPrestige, v8PrestigeRewardPreview } from '../exact-prestige-v8.ts'
import { validateExactV8State } from '../exact-save-validation.ts'
import { exportV8Save, prepareV8SaveImport } from '../exact-persistence-v8.ts'
import { getAsset } from '../trading/catalog.ts'

const AT = 1_800_000_000_000
const assetDecimals = (id: string) => getAsset(id)?.quantityDecimals ?? null
const ids = CURRENT_COLLECTION_SLOTS.map(row => row.id)
function ownedCategory(category: CollectionCategoryId): string[] {
  return CURRENT_COLLECTION_SLOTS.filter(item => item.category === category).map(item => item.id)
}

test('All 100 deterministic rarities match rank 1–20; historical v1 IDs keep their canonical identity', () => {
  assert.equal(CURRENT_COLLECTION_SLOTS.length, 100)
  assert.equal(COLLECTION_RARITIES.length, 6)
  const ranks = [100, 100, 100, 300, 300, 300, 300, 700, 700, 700, 700, 1500, 1500, 1500, 1500, 3000, 3000, 3000, 5000, 5000]
  for (const { id, rank } of CURRENT_COLLECTION_SLOTS) {
    assert.equal(collectionRarity(id)?.bonusBps, ranks[rank - 1], id)
    assert.equal(collectionRarity(id.replace(/^v2:/, ''))?.bonusBps, ranks[rank - 1], id)
  }
  assert.equal(collectionRarity('watches-02')?.bonusBps, 100, 'old rank 2 is canonical current rank 3')
  assert.equal(collectionRarity('missing'), null)
  assert.equal(collectionV3Snapshot(['watches-01','v2:watches-01']).owned, 1, 'canonical IDs count once')
})

test('Category sets unlock only at 20/20; museum strictly 100/100 with memoized totals', () => {
  const empty: string[] = []
  assert.equal(collectionV3Snapshot(empty).museumComplete, false)
  const first = ownedCategory('watches')
  const at19 = collectionV3Snapshot(first.slice(0, 19))
  assert.equal(at19.categories.watches, 19)
  assert.equal(at19.setBps.dividend, 0)
  const full = collectionV3Snapshot(first)
  assert.equal(full.categories.watches, 20)
  assert.equal(full.setBps.dividend, 5000)
  assert.equal(full.museumComplete, false)
  const at99 = collectionV3Snapshot(ids.slice(0, 99))
  assert.equal(at99.museumComplete, false)
  assert.equal(at99.museumPpBps, 0)
  const all = collectionV3Snapshot(ids)
  assert.equal(all, collectionV3Snapshot(ids), 'unchanged ownership is cached by identity')
  assert.equal(all.owned, 100)
  assert.equal(all.museumComplete, true)
  assert.equal(all.museumIncomeBps, 10_000)
  assert.equal(all.museumPpBps, COLLECTION_MUSEUM_PP_BPS)
  for (const { id } of COLLECTION_CATEGORIES) {
    assert.equal(all.categories[id], 20)
    assert.equal(all.setBps[COLLECTION_SET_REWARDS[id].boostId] >= 5000, true)
  }
  assert.equal(collectionV3BonusBps(all, 'xp'), all.originalBps.xp + all.rarityBps.xp + all.setBps.xp)
  assert.equal(collectionV3BonusBps(all, 'fame'), all.originalBps.fame + all.rarityBps.fame + all.setBps.fame)
  assert.equal(collectionV3BonusBps(all, 'click'), all.originalBps.click + all.rarityBps.click + all.setBps.click + 10_000)
})

test('V8 click, XP and Fame receive additive collection rewards without modifying historical balances', () => {
  const base = createV8CapitalState(AT)
  const holdings = ownedCategory('autos')
  const state = { ...base, prestige: { ...base.prestige, ownedCollectionIds: holdings } }
  const snap = collectionV3Snapshot(holdings)
  assert.equal(v8BonusBasisPoints(state, 'click'), snap.originalBps.click + snap.rarityBps.click + snap.setBps.click)
  const click = v8Click(state)
  const plain = v8Click(base)
  assert.equal(BigInt(click.game.balance), BigInt(plain.game.balance) +
    BigInt(Math.floor((snap.originalBps.click + snap.rarityBps.click + snap.setBps.click)/100)))
  assert.ok(BigInt(click.prestige.experienceCents) > BigInt(plain.prestige.experienceCents))
  const museum = { ...base, prestige: { ...base.prestige, ownedCollectionIds: ids } }
  assert.equal(v8EarningBonusBps(museum, 'xp'), v8BonusBasisPoints(museum, 'xp'))
  assert.equal(v8EarningBonusBps(museum, 'fame'), v8BonusBasisPoints(museum, 'fame'))
  assert.equal(v8EarningBonusBps(museum, 'trading'), v8BonusBasisPoints(museum, 'trading'))
  assert.equal(v8BonusBasisPoints(museum, 'click'), collectionV3BonusBps(collectionV3Snapshot(ids), 'click'))
  assert.equal(state.prestige.fameMicros, base.prestige.fameMicros)
})

test('100 real purchases activate museum PP in immutable V3 receipt; old receipts and V8 exports survive', () => {
  let state = createV8CapitalState(AT)
  state = v8CreditIncome(state, 'clicks', 10n**40n)
  const earlier = v8PerformPrestige(state, AT)
  assert.ok(earlier.ok)
  if (!earlier.ok) return
  state = v8CreditIncome(earlier.state, 'clicks', 10n**40n)
  const original = state.ascension.progress.history[0]!
  assert.equal(original.museumCompleteAtCycle, false)
  for (const id of ids) {
    const bought = v8BuyCollection(state, id)
    assert.ok(bought, id)
    if (bought === null) return
    state = bought
  }
  assert.equal(state.prestige.ownedCollectionIds.length, 100)
  assert.equal(validateExactV8State(state, assetDecimals).valid, true)
  assert.equal(v8BuyCollection(state, ids[0]!), null, 'legacy and current IDs cannot double-buy')
  const beforeFame = state.prestige.collectionFameMicros
  const eligibleWorth = 10n ** 36n
  const preview = v8PrestigeRewardPreview(state, eligibleWorth, 150)
  assert.equal(preview.museumCompleteAtCycle, true)
  assert.equal(preview.bonusBps, 12_500)
  assert.equal(preview.earned, preview.base * 12_500n / 10_000n)
  const done = v8PerformPrestige(state, AT)
  assert.ok(done.ok)
  if (!done.ok) return
  const receipt = done.state.ascension.progress.history.at(-1)!
  assert.equal(receipt.formulaVersion, 3)
  assert.equal(receipt.museumCompleteAtCycle, true)
  assert.equal(receipt.bonusBps, 12_500)
  assert.equal(BigInt(receipt.earnedPoints), BigInt(receipt.basePoints!) * 12_500n / 10_000n)
  assert.deepEqual(done.state.ascension.progress.history[0], original, 'earlier receipt is untouched')
  assert.equal(done.state.prestige.collectionFameMicros, beforeFame, 'past Fame is permanent')
  assert.equal(done.state.prestige.ownedCollectionIds.length, 100)
  const valid = validateExactV8State(done.state, assetDecimals)
  assert.equal(valid.valid, true, valid.reason)
  const exported = exportV8Save(done.state, AT)
  const reimport = prepareV8SaveImport(exported, AT)
  assert.equal(reimport.ok, true)
  if (reimport.ok) assert.deepEqual(reimport.state, done.state)
  const forged = JSON.parse(exported)
  forged.state.ascension.progress.history.at(-1).bonusBps = 10_000
  assert.equal(prepareV8SaveImport(JSON.stringify(forged), AT).ok, false)
  const missingMuseum = JSON.parse(exported)
  missingMuseum.state.prestige.ownedCollectionIds.pop()
  assert.equal(prepareV8SaveImport(JSON.stringify(missingMuseum), AT).ok, false)
})
