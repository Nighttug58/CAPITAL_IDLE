import test from 'node:test'
import assert from 'node:assert/strict'
import { createV8CapitalState } from '../exact-state-v8.ts'
import { v8ExactRewardRate, v8ScaleRewardUnits, v8ScaleRewardCents } from '../prestige/exact-bonuses-v8.ts'
import { transcendentUltimateUnlocked, transcendentReserveRatio, zeroTranscendentV1,
  TRANSCENDENT_MAIN_IDS, transcendentEconomicBps, transcendentHeritageBps,
  pendingStartingCapitalCents, transcendentNewsModifiers, type TranscendentShopV1 } from './transcendent-v1.ts'
import { v8PrestigeRewardPreview } from '../exact-prestige-v8.ts'

const AT=1_800_000_000_000
const empty=zeroTranscendentV1()
const all={version:2 as const,levels:{...empty.levels,...Object.fromEntries(TRANSCENDENT_MAIN_IDS.map(id=>[id,100]))}} as TranscendentShopV1
function wallet(points:bigint,main=all) {
  return {transcendentV1:main,availablePoints:points.toString()}
}
function stateAt(points:bigint,main=all) {
  const state=createV8CapitalState(AT)
  return {...state,ascension:{...state.ascension,
    progress:{...state.ascension.progress,transcendentV1:main,availablePoints:points.toString()}}}
}
test('Ultime only after the seven economic/heritage/capital trees at 100 (news not required)',()=>{
  assert.equal(transcendentUltimateUnlocked(wallet(0n)),true)
  assert.equal(transcendentUltimateUnlocked({transcendentV1:empty}),false)
  for(const id of TRANSCENDENT_MAIN_IDS){
    const almost={version:2 as const,levels:{...all.levels,[id]:99}}
    assert.equal(transcendentUltimateUnlocked({transcendentV1:almost}),false,id)
    assert.equal(transcendentReserveRatio(wallet(10n**100n,almost)).numerator,1n)
  }
  const withNews={version:2 as const,levels:{...all.levels,
    'news-power':100,'news-intensity':100,'news-duration':100}}
  assert.equal(transcendentUltimateUnlocked({transcendentV1:withNews}),true)
  assert.equal(transcendentReserveRatio(wallet(1000n,withNews)).unlocked,true)
})
test('Exact reserve ratio 0, 1M, 1B, 10^100 PP; finite wallets always < ×1.5',()=>{
  const zero=transcendentReserveRatio(wallet(0n))
  assert.deepEqual(zero,{unlocked:true,numerator:2_000_000_000n,denominator:2_000_000_000n})
  const oneMillion=transcendentReserveRatio(wallet(1_000_000n))
  assert.equal(oneMillion.numerator,oneMillion.denominator+1_000_000n)
  assert.equal(oneMillion.denominator,2_002_000_000n)
  const billion=transcendentReserveRatio(wallet(1_000_000_000n))
  assert.equal(billion.numerator*4n,billion.denominator*5n)
  const huge=transcendentReserveRatio(wallet(10n**100n))
  assert.ok(huge.numerator*2n<huge.denominator*3n)
  assert.ok(huge.numerator>huge.denominator)
})
test('Reserve adds only on Transcendent economic branch bases, not entire income or Fame Shop',()=>{
  const base=stateAt(0n),rich=stateAt(1_000_000_000n)
  const rate0=v8ExactRewardRate(base,'enterprise')
  const rate1=v8ExactRewardRate(rich,'enterprise')
  const same=10n**40n
  assert.equal(v8ScaleRewardUnits(same,rate0),same*4n)
  assert.equal(v8ScaleRewardUnits(same,rate1),same*475n/100n)
  for(const id of ['trading','dividend','xp','fame'] as const){
    const ordinary=v8ScaleRewardUnits(same,v8ExactRewardRate(base,id))
    const improved=v8ScaleRewardUnits(same,v8ExactRewardRate(rich,id))
    assert.equal(ordinary,same*3n,id)
    assert.equal(improved,same*35n/10n,id)
  }
  const click0=v8ExactRewardRate(base,'click')
  const click1=v8ExactRewardRate(rich,'click')
  assert.deepEqual(click0,click1,'ultimate never enhances direct clicks')
  assert.deepEqual(v8ScaleRewardCents(1n,click0),v8ScaleRewardCents(1n,click1))
  assert.equal(transcendentEconomicBps(rich.ascension.progress,'empire'),30_000)
})
test('Ultimate cannot amplify PP Heritage or Museum, starting capital, or manual news powers',()=>{
  const before=stateAt(0n),after=stateAt(1_000_000_000n)
  const worth=10n**35n
  const base=v8PrestigeRewardPreview(before,worth,150)
  const tuned=v8PrestigeRewardPreview(after,worth,150)
  assert.equal(base.earned,tuned.earned)
  assert.equal(tuned.bonusBps,20_000)
  assert.equal(transcendentHeritageBps(after.ascension.progress),20_000)
  assert.equal(pendingStartingCapitalCents(after.ascension.progress),
    pendingStartingCapitalCents(before.ascension.progress))
  assert.deepEqual(transcendentNewsModifiers(after.ascension.progress),
    transcendentNewsModifiers(before.ascension.progress))
  assert.equal(before.prestige.fameMicros,after.prestige.fameMicros)
  assert.equal(before.game.balance,after.game.balance)
})
test('Reserve reacts immediately when PP wallet is spent, no special store/currency',()=>{
  const billion=stateAt(1_000_000_000n)
  const lower=stateAt(1_000_000n)
  const high=v8ScaleRewardUnits(10n**40n,v8ExactRewardRate(billion,'xp'))
  const low=v8ScaleRewardUnits(10n**40n,v8ExactRewardRate(lower,'xp'))
  assert.ok(high>low)
  assert.equal(transcendentReserveRatio(lower.ascension.progress).unlocked,true)
  assert.equal(Object.hasOwn(lower.ascension.progress,'ultimateBalance'),false)
})
