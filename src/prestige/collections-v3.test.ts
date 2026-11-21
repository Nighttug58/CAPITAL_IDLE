import test from 'node:test'
import assert from 'node:assert/strict'
import { COLLECTION_CATEGORIES, CURRENT_COLLECTION_SLOTS, type CollectionCategoryId } from './catalog.ts'
import {
  COLLECTION_MUSEUM_PP_BPS, COLLECTION_SET_REWARDS, COLLECTION_RARITIES,
  collectionRarity, collectionV3BonusBps, collectionV3Snapshot,
} from './collections-v3.ts'
import { createV8CapitalState } from '../exact-state-v8.ts'
import { v8BuyCollection, v8CollectionMaxQuote, v8BuyCollectionsMax, v8Click, v8CreditIncome, v8BonusBasisPoints, v8EarningBonusBps, v8BuyTrade, v8SellTrade, v8AccrueEnterpriseUntil } from '../exact-runtime-v8.ts'
import { v8PerformPrestige, v8PrestigeRewardPreview } from '../exact-prestige-v8.ts'
import { validateExactV8State } from '../exact-save-validation.ts'
import { exportV8Save, prepareV8SaveImport } from '../exact-persistence-v8.ts'
import { getAsset, createInitialQuotes } from '../trading/catalog.ts'
import { v8AdvanceMarketSecond } from '../exact-market-v8.ts'
import { v8SettleStaking } from '../exact-staking-v8.ts'

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
  assert.equal(receipt.formulaVersion, 5)
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

test('Museum scales enterprise income, dividends, staking rewards and only positive trading profit', () => {
  const base = v8CreditIncome(createV8CapitalState(AT), 'clicks', 10n**13n)
  const museum = (state: typeof base) => ({
    ...state, prestige: { ...state.prestige, ownedCollectionIds: ids },
  })
  const enterprise = { ...base, enterprises: { ...base.enterprises, owned: {
    kiosque: { level: 50, investedCents: '10000000000' },
  } } }
  const normalEnterprise = v8AccrueEnterpriseUntil(enterprise, AT + 3_600_000)
  const museumEnterprise = v8AccrueEnterpriseUntil(museum(enterprise), AT + 3_600_000)
  assert.ok(BigInt(normalEnterprise.stats.earnedBySource.enterprises) > 0n)
  assert.ok(BigInt(museumEnterprise.stats.earnedBySource.enterprises) >
    2n * BigInt(normalEnterprise.stats.earnedBySource.enterprises))
  assert.ok(BigInt(museumEnterprise.fiscal.taxesDueCents) >
    BigInt(normalEnterprise.fiscal.taxesDueCents))

  const quote = base.trading.quotes.nvideo ?? createInitialQuotes(AT).nvideo!
  const dividend = { ...base, trading: { ...base.trading,
    positions: { nvideo: { quantity: (10n**15n).toString(), costBasis: '0' } },
    quotes: { ...base.trading.quotes, nvideo: { ...quote, dividendYield: 0.1 } },
  } }
  const normalDiv = v8AdvanceMarketSecond(dividend)
  const museumDiv = v8AdvanceMarketSecond(museum(dividend))
  assert.ok(BigInt(normalDiv.stats.earnedBySource.dividends) > 0n)
  assert.ok(BigInt(museumDiv.stats.earnedBySource.dividends) >
    2n * BigInt(normalDiv.stats.earnedBySource.dividends))

  const coin = getAsset('ethereum')!
  const units = 10n**BigInt(coin.quantityDecimals + 15)
  const entry = {
    locked: units.toString(), unlocking: '0', unlockAt: null,
    awaitingCompound: '0', rewardHeld: '0', rewardLocked: '0', rewardUnlocking: '0',
    carryUnits: 0, carryPicoUnits: '0', lifetimeRewards: '0',
  }
  const staking = { ...base, ascension: { ...base.ascension, progress: {
    ...base.ascension.progress, upgradeLevels: {
      ...base.ascension.progress.upgradeLevels, 'crypto-staking': 1,
    },
  } }, trading: { ...base.trading,
    positions: { ethereum: { quantity: units.toString(), costBasis: '0' } },
    staking: { lastAccruedAt: AT, positions: { ethereum: entry } },
  } }
  const normalStake = v8SettleStaking(staking, AT + 3_600_000)
  const museumStake = v8SettleStaking(museum(staking), AT + 3_600_000)
  const ordinaryUnits = BigInt(normalStake.trading.staking.positions.ethereum!.lifetimeRewards)
  const museumUnits = BigInt(museumStake.trading.staking.positions.ethereum!.lifetimeRewards)
  assert.ok(ordinaryUnits > 0n)
  assert.ok(museumUnits >= 2n * ordinaryUnits - 3n && museumUnits <= 2n * ordinaryUnits + 3n,
    'Museum adds exactly 100% token rewards, not a second compounding pass')
  assert.equal(normalStake.game.balance, museumStake.game.balance)

  const bought = v8BuyTrade(base, 'nvideo', '10')
  assert.ok(bought.ok)
  if (!bought.ok) return
  const originalQuote = bought.state.trading.quotes.nvideo ?? createInitialQuotes(AT).nvideo!
  const high = { ...bought.state, trading: { ...bought.state.trading, quotes: {
    ...bought.state.trading.quotes, nvideo: { ...originalQuote, price: originalQuote.price * 2 },
  } } }
  const normalGain = v8SellTrade(high, 'nvideo', '10')
  const museumGain = v8SellTrade(museum(high), 'nvideo', '10')
  assert.ok(normalGain.ok && museumGain.ok)
  if (!normalGain.ok || !museumGain.ok) return
  assert.ok(normalGain.realizedNetProfitCents > 0n)
  assert.ok(museumGain.realizedNetProfitCents > normalGain.realizedNetProfitCents * 2n)
  assert.equal(museumGain.grossCents, normalGain.grossCents)
  assert.equal(museumGain.feeCents, normalGain.feeCents)
  const low = { ...bought.state, trading: { ...bought.state.trading, quotes: {
    ...bought.state.trading.quotes, nvideo: { ...originalQuote, price: originalQuote.price / 2 },
  } } }
  const plainLoss = v8SellTrade(low, 'nvideo', '10')
  const museumLoss = v8SellTrade(museum(low), 'nvideo', '10')
  assert.ok(plainLoss.ok && museumLoss.ok)
  if (!plainLoss.ok || !museumLoss.ok) return
  assert.equal(museumLoss.realizedNetProfitCents, plainLoss.realizedNetProfitCents)
  assert.equal(museumLoss.cashDeltaCents, plainLoss.cashDeltaCents)
})

test('Collection MAX chooses globally affordable missing items cheapest-first, then saves once', () => {
  const ordered = [...CURRENT_COLLECTION_SLOTS].sort((a,b)=>a.priceCents-b.priceCents || a.id.localeCompare(b.id))
  const [first,second] = ordered
  assert.ok(first && second)
  const budget = BigInt(first.priceCents) + BigInt(second.priceCents)
  const initial=v8CreditIncome(createV8CapitalState(AT),'clicks',budget)
  const quote=v8CollectionMaxQuote(initial)
  assert.deepEqual(quote.ids,[first.id,second.id])
  assert.equal(quote.costCents,budget)
  const result=v8BuyCollectionsMax(initial)
  assert.ok(result)
  if(!result)return
  assert.equal(initial.prestige.ownedCollectionIds.length,0,'preview never mutates existing save')
  const individualFirst=v8BuyCollection(initial,first.id)!
  const individualSecond=v8BuyCollection(individualFirst,second.id)!
  assert.deepEqual(result.state,individualSecond,'bulk Fame includes exactly the sequential earned bonuses')
  assert.equal(result.costCents,budget)
  assert.equal(result.state.game.balance,'0')
  assert.equal(result.state.prestige.ownedCollectionIds.length,2)
  const valid=validateExactV8State(result.state,assetDecimals)
  assert.equal(valid.valid,true,valid.reason)
  assert.equal(v8BuyCollectionsMax(result.state),null)
})

test('Collection MAX honors legacy ownership, permanent awards and unlocks Museum',()=>{
  const existing= CURRENT_COLLECTION_SLOTS[0]!.id.replace(/^v2:/,'')
  const quoted=v8CollectionMaxQuote({...createV8CapitalState(AT),
    game:{...createV8CapitalState(AT).game,balance:(10n**20n).toString()},
    prestige:{...createV8CapitalState(AT).prestige,ownedCollectionIds:[existing]}})
  assert.ok(!quoted.ids.includes(CURRENT_COLLECTION_SLOTS[0]!.id))
  const rich=v8CreditIncome(createV8CapitalState(AT),'clicks',10n**20n)
  const all=v8BuyCollectionsMax(rich)
  assert.ok(all)
  if(!all)return
  assert.equal(all.ids.length,100)
  assert.equal(collectionV3Snapshot(all.state.prestige.ownedCollectionIds).museumComplete,true)
  assert.equal(v8CollectionMaxQuote(all.state).ids.length,0)
  const checked=validateExactV8State(all.state,assetDecimals)
  assert.equal(checked.valid,true,checked.reason)
  assert.ok(all.fameMicros>0n)
})
