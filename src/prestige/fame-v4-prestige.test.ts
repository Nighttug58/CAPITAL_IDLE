import test from 'node:test'
import assert from 'node:assert/strict'
import {createV8CapitalState,getExactAmount as v,type V8CapitalState} from '../exact-state-v8.ts'
import {v8BuyFameV4UpgradeMax} from './fame-v4-ledger.ts'
import {v8Click,v8ClickBatch,v8CreditIncome,v8BuyTrade,v8SellTrade,v8BuyEnterprise,
  v8AccrueEnterpriseUntil,v8AdvanceFiscalEconomy} from '../exact-runtime-v8.ts'
import {v8AutoClickFrame} from '../exact-autoclick-frame.ts'
import {buyDollarAutoClick} from '../dollar-autoclick-v8.ts'
import {v8PerformPrestige,v8EligiblePrestigeWorthCents} from '../exact-prestige-v8.ts'
import {validateExactV8State} from '../exact-save-validation.ts'
import {exportV8Save,prepareV8SaveImport} from '../exact-persistence-v8.ts'
import {getAsset} from '../trading/catalog.ts'
import {FISCAL_PERIOD_MS} from '../economy/state.ts'
import {V4_CHALLENGES,V4_CHALLENGE_BOOST_MS,V4_RENAISSANCE_MS,v4PrestigeRun,
 v4PrestigeBonusBps,v4ClaimChallenge,v4SelectDestiny,v4DiscountedTradeCost,v4MaximumBuyUnits} from './fame-v4-prestige.ts'
import {quoteToExactFraction} from '../exact-trading.ts'
const T=1_800_000_000_000
const validate=(state:unknown)=>validateExactV8State(state,id=>getAsset(id)?.quantityDecimals??null)
function rich(...ranks:number[]):V8CapitalState{
 const base=createV8CapitalState(T),p=base.prestige
 const fame=200_000n*1_000_000n,cash=10n**40n
 let state:V8CapitalState={...base,
  game:{...base.game,balance:cash.toString(),lifetimeEarned:cash.toString()},
  prestige:{...p,fameMicros:(v(p.fameMicros)+fame).toString(),
   lifetimeFameMicros:(v(p.lifetimeFameMicros)+fame).toString(),
   levelFameMicros:(v(p.levelFameMicros)+fame).toString(),
   cycleEarnedFameMicros:(v(p.cycleEarnedFameMicros)+fame).toString(),
   cycleLevelFameMicros:(v(p.cycleLevelFameMicros)+fame).toString()}}
 for(const n of ranks){
  const next=v8BuyFameV4UpgradeMax(state,'fame-v4-'+String(n).padStart(2,'0'),0)
  assert.ok(next,'purchased '+n)
  state=next
 }
 assert.equal(validate(state).valid,true,validate(state).reason)
 return state
}
function prestige(state:V8CapitalState,at=T):V8CapitalState{
 const richXp=v8CreditIncome(state,'clicks',10n**25n)
 const reward=v8PerformPrestige(richXp,at)
 assert.equal(reward.ok,true,reward.reason)
 if(!reward.ok)throw Error(reward.reason)
 assert.ok(validate(reward.state).valid,validate(reward.state).reason)
 return reward.state
}
test('28 Renaissance: only newly created Prestige activates 20% for 1-5m; no retroactive bonus',()=>{
 const old=rich(28)
 assert.equal(v4PrestigeBonusBps(old,'click',T),0)
 const state=prestige(old)
 assert.equal(v4PrestigeRun(state).renaissanceRankAtStart,5)
 assert.equal(v4PrestigeRun(state).renaissanceStartedAt,T)
 assert.equal(v4PrestigeBonusBps(state,'click',T+V4_RENAISSANCE_MS*5-1),2000)
 assert.equal(v4PrestigeBonusBps(state,'enterprise',T),2000)
 assert.equal(v4PrestigeBonusBps(state,'click',T+V4_RENAISSANCE_MS*5),0)
 assert.equal(v4PrestigeBonusBps(state,'dividend',T),0)
 const clicked=v8Click(state,T)
 assert.equal(v(clicked.game.balance)-v(state.game.balance),120n)
 assert.equal(v(clicked.stats.earnedBySource.clicks),120n)
 assert.equal(v(clicked.prestige.experienceCents),120n)
 assert.equal(v(clicked.game.lifetimeEarned)-v(state.game.lifetimeEarned),120n)
 assert.equal(clicked.fiscal.taxesDueCents,'0')
 assert.ok(validate(clicked).valid)
})
test('28 purchase during a cycle never spawns a new Renaissance until next Prestige',()=>{
 const original=rich()
 const a=prestige(original)
 const high=v8CreditIncome(a,'clicks',10n**25n)
 const purchased=v8BuyFameV4UpgradeMax(high,'fame-v4-28',0)
 assert.ok(purchased,'Fame earned after Prestige permits permanent purchase')
 assert.equal(purchased.ascension.run.fameV4Prestige?.renaissanceRankAtStart,0)
 assert.equal(v4PrestigeBonusBps(purchased,'click',T+1000),0)
 const withLevel=rich(28)
 assert.equal(v4PrestigeBonusBps(withLevel,'click',T+1000),0)
})
test('28 enterprise accrual splits exactly at 5m boundary, including offline replay',()=>{
 let a=prestige(rich(28))
 a=v8CreditIncome(a,'clicks',100_000_000n)
 const acquired=v8BuyEnterprise(a,'kiosque',T)
 assert.equal(acquired.ok,true)
 if(!acquired.ok)return
 const base={...acquired.state,ascension:{...acquired.state.ascension,run:{
  ...acquired.state.ascension.run,fameV4Prestige:undefined}}}
 const boundary=T+5*V4_RENAISSANCE_MS
 const boosted=v8AccrueEnterpriseUntil(acquired.state,boundary+60_000)
 const regular=v8AccrueEnterpriseUntil(base,boundary+60_000)
 assert.ok(v(boosted.stats.earnedBySource.enterprises)>v(regular.stats.earnedBySource.enterprises))
 const part=v8AccrueEnterpriseUntil(acquired.state,boundary)
 const split=v8AccrueEnterpriseUntil(part,boundary+60_000)
 assert.deepEqual(split,boosted)
 assert.ok(validate(boosted).valid,validate(boosted).reason)
})
test('28 offline Auto Click uses exact time segmentation, idempotent from 5m to 72h',()=>{
 let state=prestige(rich(28))
 state=v8CreditIncome(state,'clicks',1_000_000n)
 state=buyDollarAutoClick(state,T)!
 assert.ok(state)
 const end=T+FISCAL_PERIOD_MS
 const full=v8AutoClickFrame(state,end,false)
 const split=v8AutoClickFrame(v8AutoClickFrame(state,T+5*60_000,false),end,false)
 assert.deepEqual(full,split)
 // Rank 5 makes only the first 300 clicks +20%, never the remaining hours.
 assert.equal(v(full.stats.earnedBySource.clicks)-v(state.stats.earnedBySource.clicks),
   BigInt(FISCAL_PERIOD_MS/1000)*100n+300n*20n)
 assert.equal(v8AutoClickFrame(full,end,false),full)
 assert.ok(validate(full).valid,validate(full).reason)
})
test('29 deterministic one-time challenge claims: 5% only for 10m, no overlap or farming',()=>{
 let state=prestige(rich(29))
 assert.equal(V4_CHALLENGES.length,10)
 assert.equal(v4ClaimChallenge(state,1,T),null)
 state=v8ClickBatch(state,100n,T)
 const claimed=v4ClaimChallenge(state,1,T)
 assert.ok(claimed)
 assert.equal(claimed.ascension.run.fameV4Prestige?.claimedChallenges.join(','),'1')
 assert.equal(v4PrestigeBonusBps(claimed,'click',T),500)
 assert.equal(v4ClaimChallenge(claimed,1,T),null)
 assert.equal(v4ClaimChallenge(claimed,3,T),null)
 assert.equal(v4PrestigeBonusBps(claimed,'click',T+V4_CHALLENGE_BOOST_MS),0)
 const earned=v8Click(claimed,T)
 assert.equal(v(earned.stats.earnedBySource.clicks)-v(claimed.stats.earnedBySource.clicks),105n)
 const finished=v8Click(claimed,T+V4_CHALLENGE_BOOST_MS)
 assert.equal(v(finished.stats.earnedBySource.clicks)-v(claimed.stats.earnedBySource.clicks),100n)
 assert.ok(validate(claimed).valid)
})
test('29 enterprise challenge stays separate from source cash and tax, one active bonus',()=>{
 let state=prestige(rich(29))
 state=v8CreditIncome(state,'enterprises',100_000_000n)
 const first=v4ClaimChallenge(state,2,T)
 assert.ok(first)
 assert.equal(v4PrestigeBonusBps(first,'enterprise',T),500)
 assert.equal(v4PrestigeBonusBps(first,'click',T),0)
 assert.equal(first.game.balance,state.game.balance)
 assert.equal(first.prestige.experienceCents,state.prestige.experienceCents)
 assert.equal(first.fiscal.taxesDueCents,state.fiscal.taxesDueCents)
 assert.equal(v4ClaimChallenge(first,2,T),null)
 assert.equal(v4ClaimChallenge(first,4,T),null)
 assert.ok(validate(first).valid)
})
test('30 Trader discounts actual 50/100/150 bps fees without moving market prices, impacts MAX and cost basis',()=>{
 let state=rich(30)
 const chosen=v4SelectDestiny(state,'trader',T)!
 assert.ok(chosen)
 assert.equal(v4SelectDestiny(chosen,'industrial',T),null)
 const quote=quoteToExactFraction(100)!
 for(const feeBps of [50n,100n,150n]){
  const before=v4DiscountedTradeCost(state,quote,10_000n,4,feeBps,'buy')!
  const after=v4DiscountedTradeCost(chosen,quote,10_000n,4,feeBps,'buy')!
  assert.equal(after.feeCents,(before.feeCents*94n+50n)/100n)
  assert.equal(after.grossCents,before.grossCents)
  assert.equal(after.totalCents,after.grossCents+after.feeCents)
 }
 const max=v4MaximumBuyUnits(chosen,1000n,quote,4,50n)
 const standard=v4MaximumBuyUnits(state,1000n,quote,4,50n)
 assert.ok(max>=standard)
 const stock=getAsset('nvideo')!
 const bought=v8BuyTrade(chosen,'nvideo','100.0000')
 assert.equal(bought.ok,true)
 if(!bought.ok)return
 const baseline=v8BuyTrade(state,'nvideo','100.0000')
 assert.equal(baseline.ok,true)
 if(!baseline.ok)return
 assert.ok(bought.feeCents<baseline.feeCents)
 assert.equal(bought.state.trading.positions.nvideo.costBasis,(bought.grossCents+bought.feeCents).toString())
 const sold=v8SellTrade(bought.state,'nvideo','100.0000')
 assert.equal(sold.ok,true)
 if(!sold.ok)return
 assert.ok(sold.feeCents>0n)
 assert.equal(sold.state.trading.quotes.nvideo?.price,bought.state.trading.quotes.nvideo?.price)
 assert.equal(v(sold.state.stats.realizedLossesBySource.stocks)>=0n,true)
 assert.ok(v8EligiblePrestigeWorthCents(bought.state)>v8EligiblePrestigeWorthCents(baseline.state))
 assert.ok(validate(sold.state).valid,validate(sold.state).reason)
 assert.ok(stock.quantityDecimals>=0)
})
test('30 Industrial and Collector are exclusive additive bonuses, BigInt exact, no PP/Fame direct',()=>{
 const before=rich(30)
 const industrial=v4SelectDestiny(before,'industrial',T)!
 const collector=v4SelectDestiny(before,'collector',T)!
 assert.equal(v4PrestigeBonusBps(industrial,'enterprise',T),600)
 assert.equal(v4PrestigeBonusBps(industrial,'click',T),0)
 assert.equal(v4PrestigeBonusBps(collector,'enterprise',T),300)
 assert.equal(v4PrestigeBonusBps(collector,'click',T),300)
 assert.equal(v4PrestigeBonusBps(collector,'dividend',T),300)
 const clicked=v8Click(collector,T)
 assert.equal(v(clicked.game.balance)-v(collector.game.balance),103n)
 assert.equal(v(clicked.prestige.experienceCents)-v(collector.prestige.experienceCents),103n)
 assert.equal(v(collector.prestige.fameMicros),v(before.prestige.fameMicros))
 assert.equal(collector.ascension.progress.availablePoints,before.ascension.progress.availablePoints)
 assert.ok(validate(clicked).valid)
})
test('old V8 saves without Prestige registry migrate neutrally; next Prestige opens bonus once',()=>{
 const old=rich(28,29,30)
 assert.equal(old.ascension.run.fameV4Prestige,undefined)
 assert.equal(v4PrestigeBonusBps(old,'click',T),0)
 const exported=exportV8Save(old,T),imported=prepareV8SaveImport(exported,T)
 assert.equal(imported.ok,true,imported.reason)
 const selected=v4SelectDestiny(old,'collector',T)!
 assert.ok(validate(selected).valid,validate(selected).reason)
 const restored=prepareV8SaveImport(exportV8Save(selected,T),T)
 assert.equal(restored.ok,true,restored.reason)
 if(restored.ok)assert.deepEqual(restored.state,selected)
 const next=prestige(selected)
 assert.equal(next.ascension.run.fameV4Prestige?.specialization,null)
 assert.deepEqual(next.ascension.run.fameV4Prestige?.claimedChallenges,[])
 assert.equal(next.ascension.run.fameV4Prestige?.renaissanceRankAtStart,5)
 assert.equal(next.prestige.fameV4?.levels['fame-v4-30'],3)
 assert.ok(validate(next).valid)
})
test('V8 rejects forged Prestige clocks/cycles/boosts and invalid specialization without rewriting player save',()=>{
 let state=prestige(rich(28,29,30))
 state=v8ClickBatch(state,100n,T)
 state=v4ClaimChallenge(state,1,T)!
 state=v4SelectDestiny(state,'trader',T)!
 const run=state.ascension.run.fameV4Prestige!
 const forgery=(edit:Partial<typeof run>)=>({...state,ascension:{...state.ascension,run:{
  ...state.ascension.run,fameV4Prestige:{...run,...edit}}}})
 const samples=[
  forgery({cycleExact:'999999'}),
  forgery({renaissanceRankAtStart:7}),
  forgery({renaissanceStartedAt:T+1000}),
  forgery({claimedChallenges:[1,1]}),
  forgery({claimedChallenges:[10]}),
  forgery({specialization:'fake' as 'trader'}),
  forgery({challengeBoost:{slot:1,source:'click',startedAt:T+1,endsAt:T+1+V4_CHALLENGE_BOOST_MS}}),
 ]
 for(const fake of samples){
  assert.equal(validate(fake).valid,false)
  assert.equal(prepareV8SaveImport(JSON.stringify(fake),T).ok,false)
 }
 assert.ok(validate(state).valid,validate(state).reason)
})
test('new cycle erases claimed challenges and specialization but retains 28-30 purchases',()=>{
 let state=prestige(rich(28,29,30))
 state=v8ClickBatch(state,100n,T)
 state=v4ClaimChallenge(state,1,T)!
 state=v4SelectDestiny(state,'industrial',T)!
 const next=prestige(state,T)
 assert.equal(next.ascension.run.fameV4Prestige?.specialization,null)
 assert.deepEqual(next.ascension.run.fameV4Prestige?.claimedChallenges,[])
 assert.equal(v4PrestigeBonusBps(next,'click',T),2000)
 assert.equal(next.prestige.fameV4?.levels['fame-v4-28'],5)
 assert.equal(next.prestige.fameV4?.levels['fame-v4-29'],10)
 assert.equal(next.prestige.fameV4?.levels['fame-v4-30'],3)
 assert.ok(validate(next).valid,validate(next).reason)
})
