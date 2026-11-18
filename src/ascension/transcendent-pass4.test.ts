import test from 'node:test'
import assert from 'node:assert/strict'
import {createV8CapitalState} from '../exact-state-v8.ts'
import {v8CreditIncome,v8AccrueEnterpriseUntil,v8BuyTrade,v8SellTrade} from '../exact-runtime-v8.ts'
import {v8PerformPrestige,v8PrestigeRewardPreview,previewV8PrestigePoints} from '../exact-prestige-v8.ts'
import {v8AdvanceMarketSecond} from '../exact-market-v8.ts'
import {v8SettleStaking} from '../exact-staking-v8.ts'
import {getAsset,createInitialQuotes} from '../trading/catalog.ts'
import {validateExactV8State} from '../exact-save-validation.ts'
import {exportV8Save,prepareV8SaveImport} from '../exact-persistence-v8.ts'
import {v8BuyTranscendent,v8BuyTranscendentNews,TRANSCENDENT_MAIN_IDS,
  TRANSCENDENT_NEWS_IDS,zeroTranscendentV1,transcendentSpent,
  transcendentSpentThrough,transcendentEconomicBps,pendingStartingCapitalCents,
  TRANSCENDENT_MAIN_PRESENTATION,transcendentNextCost} from './transcendent-v1.ts'
const NOW=1_800_000_000_000
const decimals=(id:string)=>getAsset(id)?.quantityDecimals??null
function cycle(times=3){
  let state=createV8CapitalState(NOW)
  for(let i=0;i<times;i++){
    state=v8CreditIncome(state,'clicks',10n**40n)
    const result=v8PerformPrestige(state,NOW)
    assert.ok(result.ok)
    state=result.state
  }
  return state
}
function withRanks(state:ReturnType<typeof createV8CapitalState>,ranks:Record<string,number>){
  const previous=state.ascension.progress
  const base=previous.transcendentV1??zeroTranscendentV1()
  const section={version:1 as const,levels:{...base.levels,...ranks}}
  const oldCost=transcendentSpent(base)
  const newCost=transcendentSpent(section)
  assert.notEqual(oldCost,null)
  assert.notEqual(newCost,null)
  assert.ok(BigInt(previous.availablePoints)>=newCost!-oldCost!)
  return {...state,ascension:{...state.ascension,progress:{...previous,
    transcendentV1:section,availablePoints:(BigInt(previous.availablePoints)-(newCost!-oldCost!)).toString()}}}
}
test('Ten PP branches, seven purchasable main branches, seven-branch prices immutable',()=>{
  assert.equal(TRANSCENDENT_MAIN_IDS.length,7)
  assert.equal(TRANSCENDENT_MAIN_PRESENTATION.length,7)
  assert.equal(TRANSCENDENT_NEWS_IDS.length,3)
  assert.equal(7n*transcendentSpentThrough(1000)!,24_179_470_000n)
  assert.equal(10n*transcendentSpentThrough(1000)!,34_542_100_000n)
  assert.equal(transcendentNextCost(999),10_230_760n)
  const ready=cycle()
  for(const id of TRANSCENDENT_MAIN_IDS){
    const first=v8BuyTranscendent(ready,id,0)
    assert.ok(first!==null,id)
    if(first){
      assert.equal(first.ascension.progress.transcendentV1?.levels[id],1)
      assert.equal(BigInt(first.ascension.progress.availablePoints),BigInt(ready.ascension.progress.availablePoints)-1000n)
      assert.equal(first.ascension.progress.lifetimePoints,ready.ascension.progress.lifetimePoints)
      assert.equal(first.game,ready.game)
      assert.equal(validateExactV8State(first,decimals).valid,true,id)
      assert.equal(v8BuyTranscendent(first,id,0),null,'stale rank cannot double spend')
      assert.equal(v8BuyTranscendent(first,id,1000),null)
    }
  }
  assert.equal(v8BuyTranscendent(ready,'unknown' as 'empire',0),null)
  assert.equal(pendingStartingCapitalCents(ready.ascension.progress),0n)
  const purchased=v8BuyTranscendent(ready,'starting-capital',0)!
  assert.ok(purchased)
  assert.equal(pendingStartingCapitalCents(purchased.ascension.progress),1_000_000n)
  assert.equal(purchased.game.balance,ready.game.balance)
  assert.equal(v8BuyTranscendent(ready,'news-power',0)?.ascension.progress.transcendentV1?.levels['news-power'],1)
  assert.equal(v8BuyTranscendentNews(ready,'empire' as 'news-power',0),null)
  const future=withRanks(ready,{empire:1000})
  assert.equal(v8BuyTranscendent(future,'empire',1000),null)
  const empty={...ready,ascension:{...ready.ascension,progress:{...ready.ascension.progress,availablePoints:'0'}}}
  assert.equal(v8BuyTranscendent(empty,'empire',0),null)
  for(const earlier of [0,1,2])assert.equal(v8BuyTranscendent(cycle(earlier),'empire',0),null)
})
test('Extreme PP rank ledger, 1e30 exact balances and exports do not round or mint any PP',()=>{
  let ready=cycle()
  const state=withRanks(ready,{empire:1000,trading:1000,rentier:1000,xp:1000,fame:1000,heritage:1000})
  assert.equal(transcendentSpent(state.ascension.progress.transcendentV1),20_725_260_000n)
  assert.equal(validateExactV8State(state,decimals).valid,true)
  const imported=prepareV8SaveImport(exportV8Save(state,NOW),NOW)
  assert.ok(imported.ok)
  assert.deepEqual(imported.state,state)
  const forged=JSON.parse(exportV8Save(state,NOW))
  forged.state.ascension.progress.transcendentV1.levels.empire=999
  assert.equal(prepareV8SaveImport(JSON.stringify(forged),NOW).ok,false)
  const bought=JSON.parse(exportV8Save(state,NOW))
  bought.state.ascension.progress.transcendentV1.levels['starting-capital']=1
  assert.equal(prepareV8SaveImport(JSON.stringify(bought),NOW).ok,false)
  // Valid source with enormous PP must not be converted through Number.
  const huge=10n**35n
  ready={...ready,ascension:{...ready.ascension,progress:{
    ...ready.ascension.progress,
    availablePoints:(BigInt(ready.ascension.progress.availablePoints)+huge).toString(),
    lifetimePoints:(BigInt(ready.ascension.progress.lifetimePoints)+huge).toString(),
  }}}
  // Unbacked PP are not a valid persisted state. The purchase still remains
  // exact and the strict validator rejects the forged lifetime increment.
  const proposed=v8BuyTranscendent(ready,'empire',0)
  assert.ok(proposed)
  assert.equal(BigInt(proposed.ascension.progress.availablePoints),
    BigInt(ready.ascension.progress.availablePoints)-1000n)
  assert.equal(validateExactV8State(proposed,decimals).valid,false)
})
test('Enterprise income adds +300% to gross base, progressive tax accrued once',()=>{
  const base=cycle()
  const rich=v8CreditIncome(base,'clicks',10n**13n)
  const own={...rich,enterprises:{...rich.enterprises,owned:{
    kiosque:{level:50,investedCents:'10000000000'},
  }}}
  const boosted=withRanks(own,{empire:1000})
  assert.equal(transcendentEconomicBps(boosted.ascension.progress,'empire'),30_000)
  const one=v8AccrueEnterpriseUntil(own,NOW+3600_000)
  const four=v8AccrueEnterpriseUntil(boosted,NOW+3600_000)
  const baseEarn=BigInt(one.stats.earnedBySource.enterprises)
  const topEarn=BigInt(four.stats.earnedBySource.enterprises)
  assert.ok(baseEarn>0n)
  assert.ok(topEarn>=baseEarn*4n-10n && topEarn<=baseEarn*4n+10n,
    `empire +300% gross income after integer carry rounding: base=${baseEarn} boosted=${topEarn}`)
  assert.ok(BigInt(four.fiscal.taxesDueCents)>BigInt(one.fiscal.taxesDueCents))
  assert.equal(BigInt(four.fiscal.dueBySourceCents.enterprises),BigInt(four.fiscal.taxesDueCents))
  assert.equal(four.stats.clickCount,one.stats.clickCount)
})
test('Trading only amplifies realized net gains, never invested principal or losses',()=>{
  let base=v8CreditIncome(cycle(),'clicks',10n**13n)
  const purchase=v8BuyTrade(base,'nvideo','10')
  assert.ok(purchase.ok)
  base=purchase.state
  const asset=getAsset('nvideo')!
  const old=base.trading.quotes.nvideo??createInitialQuotes(NOW).nvideo!
  const strong={...base,trading:{...base.trading,quotes:{...base.trading.quotes,
    nvideo:{...old,price:old.price*2}}}}
  const boost=withRanks(strong,{trading:1000})
  const normal=v8SellTrade(strong,'nvideo','10')
  const advanced=v8SellTrade(boost,'nvideo','10')
  assert.ok(normal.ok&&advanced.ok)
  assert.ok(normal.realizedNetProfitCents>0n)
  assert.ok(advanced.realizedNetProfitCents>=normal.realizedNetProfitCents*3n-3n)
  assert.equal(advanced.grossCents,normal.grossCents)
  assert.equal(advanced.feeCents,normal.feeCents)
  assert.ok(BigInt(advanced.state.fiscal.taxesDueCents)>BigInt(normal.state.fiscal.taxesDueCents))
  assert.ok(BigInt(advanced.state.stats.earnedBySource.stocks)>BigInt(normal.state.stats.earnedBySource.stocks))
  const weak={...base,trading:{...base.trading,quotes:{...base.trading.quotes,
    nvideo:{...old,price:old.price/2}}}}
  const bad=v8SellTrade(weak,'nvideo','10')
  const buffBad=v8SellTrade(withRanks(weak,{trading:1000}),'nvideo','10')
  assert.ok(bad.ok&&buffBad.ok)
  assert.ok(bad.realizedNetProfitCents<0n)
  assert.equal(buffBad.realizedNetProfitCents,bad.realizedNetProfitCents)
  assert.equal(buffBad.cashDeltaCents,bad.cashDeltaCents)
  assert.equal(buffBad.state.prestige.experienceCents,bad.state.prestige.experienceCents)
  assert.equal(asset.kind,'stock')
})
test('XP and Fame branches boost only their own newly created rewards; not cash twice',()=>{
  const ready=cycle()
  const amount=10n**13n
  const baseline=v8CreditIncome(ready,'clicks',amount)
  const rankXP=v8CreditIncome(withRanks(ready,{xp:1000}),'clicks',amount)
  const rankFame=v8CreditIncome(withRanks(ready,{fame:1000}),'clicks',amount)
  assert.equal(rankXP.game.balance,baseline.game.balance)
  assert.equal(rankFame.game.balance,baseline.game.balance)
  assert.equal(BigInt(rankXP.prestige.experienceCents),BigInt(baseline.prestige.experienceCents)*3n)
  assert.equal(rankFame.prestige.experienceCents,baseline.prestige.experienceCents)
  assert.equal(BigInt(rankFame.prestige.cycleLevelFameMicros),BigInt(baseline.prestige.cycleLevelFameMicros)*3n)
  assert.ok(BigInt(rankXP.prestige.levelFameMicros)>BigInt(baseline.prestige.levelFameMicros))
})
test('Rentier increases dividends and rewards in token units only, without creating bonus principal',()=>{
  const ready=cycle()
  const pos=10n**15n
  const divAsset=getAsset('nvideo')!
  const quote=ready.trading.quotes.nvideo??createInitialQuotes(NOW).nvideo!
  const dividend={...ready,trading:{...ready.trading,positions:{
    ...ready.trading.positions,nvideo:{quantity:pos.toString(),costBasis:'0'},
  },quotes:{...ready.trading.quotes,nvideo:{...quote,dividendYield:0.1}}}}
  const rich=withRanks(dividend,{rentier:1000})
  const basicIncome=v8AdvanceMarketSecond(dividend)
  const extraIncome=v8AdvanceMarketSecond(rich)
  const earned0=BigInt(basicIncome.stats.earnedBySource.dividends)
  const earned1=BigInt(extraIncome.stats.earnedBySource.dividends)
  assert.ok(earned0>0n)
  assert.ok(earned1>=earned0*3n-2n && earned1<=earned0*3n+2n)
  const coin=getAsset('ethereum')!
  const units=10n**BigInt(coin.quantityDecimals+15)
  const entry={
    locked:units.toString(),unlocking:'0',unlockAt:null,
    awaitingCompound:'0',rewardHeld:'0',rewardLocked:'0',rewardUnlocking:'0',
    carryUnits:0,carryPicoUnits:'0',lifetimeRewards:'0',
  }
  const stakingState={...ready,ascension:{...ready.ascension,progress:{
    ...ready.ascension.progress,upgradeLevels:{...ready.ascension.progress.upgradeLevels,
      'crypto-staking':1},
  }},trading:{...ready.trading,positions:{ethereum:{quantity:units.toString(),costBasis:'0'}},
    staking:{lastAccruedAt:NOW,positions:{ethereum:entry}}}}
  const rewarded=v8SettleStaking(stakingState,NOW+3_600_000)
  const boosted=v8SettleStaking(withRanks(stakingState,{rentier:1000}),NOW+3_600_000)
  const standard=BigInt(rewarded.trading.staking.positions.ethereum!.lifetimeRewards)
  const deluxe=BigInt(boosted.trading.staking.positions.ethereum!.lifetimeRewards)
  assert.ok(standard>0n)
  assert.ok(deluxe>=3n*standard-3n && deluxe<=3n*standard+3n)
  assert.equal(boosted.game.balance,rewarded.game.balance)
  assert.equal(boosted.stats.earnedBySource.crypto,rewarded.stats.earnedBySource.crypto)
  assert.ok(BigInt(boosted.trading.positions.ethereum!.quantity)>BigInt(rewarded.trading.positions.ethereum!.quantity))
})
test('Heritage V3 PP receipts freeze cycle ranks and bonus; earlier V2 receipts untouched',()=>{
  let state=cycle()
  const historical=[...state.ascension.progress.history]
  assert.equal(historical.length,3)
  assert.ok(historical.every(row=>row.formulaVersion===3))
  const invested=withRanks(state,{heritage:1000})
  const fresh=v8CreditIncome(invested,'clicks',10n**40n)
  const worth=v8PrestigeRewardPreview(fresh,10n**40n,150)
  assert.ok(worth.earned>worth.base)
  const done=v8PerformPrestige(fresh,NOW)
  assert.ok(done.ok)
  assert.equal(done.earnedPoints,done.state.ascension.progress.history.at(-1)?.earnedPoints &&
    BigInt(done.state.ascension.progress.history.at(-1)!.earnedPoints))
  const receipt=done.state.ascension.progress.history.at(-1)!
  assert.equal(receipt.formulaVersion,3)
  assert.equal(receipt.heritageLevelAtCycle,1000)
  assert.equal(receipt.museumCompleteAtCycle,false)
  assert.equal(receipt.bonusBps,20_000)
  assert.equal(BigInt(receipt.earnedPoints),BigInt(receipt.basePoints!)*2n)
  assert.deepEqual(done.state.ascension.progress.history.slice(0,3),historical)
  assert.equal(validateExactV8State(done.state,decimals).valid,true)
  const exported=exportV8Save(done.state,NOW)
  const restored=prepareV8SaveImport(exported,NOW)
  assert.ok(restored.ok)
  assert.deepEqual(restored.state,done.state)
  const fake=JSON.parse(exported)
  fake.state.ascension.progress.history.at(-1).heritageLevelAtCycle=999
  assert.equal(prepareV8SaveImport(JSON.stringify(fake),NOW).ok,false)
  const fake2=JSON.parse(exported)
  fake2.state.ascension.progress.history.at(-1).basePoints='0'
  assert.equal(prepareV8SaveImport(JSON.stringify(fake2),NOW).ok,false)
  const fake3=JSON.parse(exported)
  fake3.state.ascension.progress.history.at(-1).bonusBps=10_000
  assert.equal(prepareV8SaveImport(JSON.stringify(fake3),NOW).ok,false)
  const fake4=JSON.parse(exported)
  fake4.state.ascension.progress.history.at(-1).museumCompleteAtCycle=true
  assert.equal(prepareV8SaveImport(JSON.stringify(fake4),NOW).ok,false)
  const another=v8PerformPrestige(v8CreditIncome(done.state,'clicks',10n**40n),NOW)
  assert.ok(another.ok)
  assert.equal(another.state.ascension.progress.history.at(-1)?.heritageLevelAtCycle,1000)
  assert.equal(validateExactV8State(another.state,decimals).valid,true)
})
