import test from 'node:test'
import assert from 'node:assert/strict'
import {createV8CapitalState,getExactAmount as v,type V8CapitalState} from '../exact-state-v8.ts'
import {v8BuyFameV4UpgradeMax} from './fame-v4-ledger.ts'
import {v8Click,v8ManualClick,v8ClaimLegendaryBanknote,v8AdvanceFiscalEconomy,
  v8ClickBatch,v8CreditIncome} from '../exact-runtime-v8.ts'
import {v8AutoClickFrame} from '../exact-autoclick-frame.ts'
import {buyDollarAutoClick} from '../dollar-autoclick-v8.ts'
import {v8PerformPrestige} from '../exact-prestige-v8.ts'
import {getAsset} from '../trading/catalog.ts'
import {validateExactV8State} from '../exact-save-validation.ts'
import {exportV8Save,prepareV8SaveImport,loadV8CapitalState,saveV8CapitalState} from '../exact-persistence-v8.ts'
import {v4InitializeLegendary,legendaryReadyAt,v4ActivateOvercharge,
  fameV4Clicks,v4OverchargeExtraClicks,LEGENDARY_COUNTS,
  OVERCHARGE_COOLDOWN_MS,OVERCHARGE_MS_PER_RANK} from './fame-v4-clicks.ts'
const NOW=1_800_000_000_000
const check=(s:V8CapitalState)=>validateExactV8State(s,id=>getAsset(id)?.quantityDecimals??null)
function rich(...powers:number[]):V8CapitalState{
 const base=createV8CapitalState(NOW),p=base.prestige
 const fame=180_000n*1_000_000n,cash=10n**35n
 let state:V8CapitalState={...base,
  game:{...base.game,balance:cash.toString(),lifetimeEarned:cash.toString()},
  prestige:{...p,fameMicros:(v(p.fameMicros)+fame).toString(),
   lifetimeFameMicros:(v(p.lifetimeFameMicros)+fame).toString(),
   levelFameMicros:(v(p.levelFameMicros)+fame).toString(),
   cycleEarnedFameMicros:(v(p.cycleEarnedFameMicros)+fame).toString(),
   cycleLevelFameMicros:(v(p.cycleLevelFameMicros)+fame).toString()},
 }
 for(const num of powers){
  const result=v8BuyFameV4UpgradeMax(state,'fame-v4-'+String(num).padStart(2,'0'),0)
  assert.ok(result,'fame '+num)
  state=result
 }
 assert.equal(check(state).valid,true,check(state).reason)
 return state
}
function settled(s:V8CapitalState,at:number){return v8AdvanceFiscalEconomy(s,at)}
function manual(s:V8CapitalState,at:number,active:number):V8CapitalState {
 const next=v8ManualClick(settled(s,at),at,active)
 assert.ok(next,'manual click must succeed')
 return next
}
test('19 frenzy: manual-only 10 clicks/3sec activates exact +25%, then expires after 3sec idle',()=>{
 let s=rich(19)
 const original=s
 for(let i=0;i<9;i++){
  const at=NOW+i*200,old=v(s.stats.earnedBySource.clicks)
  s=manual(s,at,i*200)
  assert.equal(v(s.stats.earnedBySource.clicks)-old,100n)
 }
 const before=v(s.stats.earnedBySource.clicks)
 s=manual(s,NOW+1800,1800)
 assert.equal(v(s.stats.earnedBySource.clicks)-before,125n)
 assert.equal(fameV4Clicks(s).manualTimestamps.length,10)
 assert.equal(fameV4Clicks(s).frenzyUntil,NOW+4800)
 const baseline=v8ClickBatch(settled(original,NOW+1800),10n)
 assert.equal(fameV4Clicks(baseline).manualTimestamps.length,0)
 s=manual(s,NOW+5000,5000)
 assert.equal(fameV4Clicks(s).frenzyUntil,0)
 assert.equal(v(s.stats.earnedBySource.clicks)-before,225n)
 assert.ok(check(s).valid,check(s).reason)
})
test('22 charged click: exactly one x20 reward after 15 seconds of ACTIVE play; no offline charging',()=>{
 let s=rich(22)
 s=manual(s,NOW,0)
 let prev=v(s.stats.earnedBySource.clicks)
 s=manual(s,NOW+20_000,0) // 20sec elapsed offline, zero active time
 assert.equal(v(s.stats.earnedBySource.clicks)-prev,100n)
 prev=v(s.stats.earnedBySource.clicks)
 s=manual(s,NOW+35_000,15_000)
 assert.equal(v(s.stats.earnedBySource.clicks)-prev,2000n)
 prev=v(s.stats.earnedBySource.clicks)
 s=manual(s,NOW+35_001,15_001)
 assert.equal(v(s.stats.earnedBySource.clicks)-prev,100n)
 assert.equal(fameV4Clicks(s).lastManualActiveMs,15_001)
 assert.ok(check(s).valid,check(s).reason)
})
test('23 chain bonus is deterministic, bounded to 3–5 ordinary clicks and never recursively invokes itself',()=>{
 let s=rich(23),triggered=0
 for(let i=0;i<300;i++){
  const old=s.stats.clickCount
  s=manual(s,NOW+i*10,i*10)
  const diff=s.stats.clickCount-old
  assert.ok([1,4,5,6].includes(diff),'chain bonus must be 0 or 3..5')
  if(diff>1)triggered++
 }
 assert.ok(triggered>=1,'5% rate should produce a seeded hit in 300 taps')
 assert.equal(fameV4Clicks(s).chainRolls,300)
 assert.ok(check(s).valid,check(s).reason)
})
test('20 legendary ticket: real-time cooldowns 15 to 5 min, normal 5 to 30 clicks and no offline bank',()=>{
 for(let rank=1;rank<=5;rank++)assert.ok(LEGENDARY_COUNTS[rank]>LEGENDARY_COUNTS[rank-1])
 let s=rich(20)
 assert.equal(legendaryReadyAt(s),null)
 s=v4InitializeLegendary(s,NOW)
 assert.equal(legendaryReadyAt(s),NOW+300_000)
 assert.equal(v8ClaimLegendaryBanknote(s,NOW+299_999),null)
 s=settled(s,NOW+24*60*60_000)
 const before=s.stats.clickCount
 const result=v8ClaimLegendaryBanknote(s,NOW+24*60*60_000)
 assert.ok(result)
 s=result.state
 assert.equal(result.count,30)
 assert.equal(s.stats.clickCount-before,30)
 assert.ok(result.gainCents>0n)
 assert.equal(v8ClaimLegendaryBanknote(s,NOW+24*60*60_000),null)
 assert.equal(v8ClaimLegendaryBanknote(s,NOW+24*60*60_000+299_999),null)
 assert.equal(legendaryReadyAt(s),NOW+24*60*60_000+300_000)
 assert.ok(check(s).valid,check(s).reason)
})
test('21 +50% Auto Click frequency only with active dollar Auto Click, split/offline replay idempotent',()=>{
 let s=rich(21)
 assert.equal(v4ActivateOvercharge(s,NOW),null)
 s=buyDollarAutoClick(s,NOW)!
 s=buyDollarAutoClick(s,NOW)!
 s=v4ActivateOvercharge(s,NOW)!
 assert.ok(s)
 assert.equal(fameV4Clicks(s).overcharge?.endsAt,NOW+20_000)
 const first=v8AutoClickFrame(s,NOW+20_000,false)
 assert.equal(first.stats.clickCount,60) // 40 basic + 20 surcharge
 const split=v8AutoClickFrame(v8AutoClickFrame(s,NOW+7000,false),NOW+20_000,false)
 assert.deepEqual(first,split)
 assert.equal(v4OverchargeExtraClicks(s,NOW+20_000,NOW+25_000),0n)
 assert.deepEqual(v8AutoClickFrame(first,NOW+20_000,true),first)
 assert.equal(v4ActivateOvercharge(first,NOW+20_000),null)
 const long=settled(first,NOW+OVERCHARGE_COOLDOWN_MS)
 assert.ok(v4ActivateOvercharge(long,NOW+OVERCHARGE_COOLDOWN_MS))
 assert.ok(check(first).valid,check(first).reason)
})
test('21 retains exact auto clicks and expiry when replayed via shared passive settlement',()=>{
 let s=rich(21)
 s=buyDollarAutoClick(s,NOW)!
 s=v4ActivateOvercharge(s,NOW)!
 assert.equal(v4OverchargeExtraClicks(s,NOW,NOW+OVERCHARGE_MS_PER_RANK*5),10n)
 const autoOnly=v8AutoClickFrame(s,NOW+20_000,false)
 const base=v8AutoClickFrame({...s,ascension:{...s.ascension,run:{
   ...s.ascension.run,fameV4Clicks:undefined}}},NOW+20_000,false)
 assert.equal(autoOnly.stats.clickCount-base.stats.clickCount,10)
 assert.equal(v(autoOnly.game.lifetimeEarned)-v(base.game.lifetimeEarned),1000n)
 assert.ok(check(autoOnly).valid,check(autoOnly).reason)
})
test('manual + chain credits XP, Fame and stats through exact V8 without taxes or separate bonus multipliers',()=>{
 let s=rich(19,22,23)
 s=manual(s,NOW,0)
 const earned=v(s.stats.earnedBySource.clicks)
 assert.equal(v(s.game.lifetimeEarned)-10n**35n,earned)
 assert.equal(v(s.prestige.experienceCents),earned)
 assert.equal(s.fiscal.taxesDueCents,'0')
 const old=rich()
 const regular=v8Click(old)
 assert.equal(v(regular.stats.earnedBySource.clicks),100n)
 assert.ok(check(s).valid,check(s).reason)
})
test('after Prestige, permanent Fame levels survive but frenzy/charge/legendary/surcharge/counters reset',()=>{
 let s=rich(19,20,21,22,23)
 s=buyDollarAutoClick(s,NOW)!
 s=v4InitializeLegendary(s,NOW)
 s=v4ActivateOvercharge(s,NOW)!
 s=manual(s,NOW,0)
 s=v8CreditIncome(s,'enterprises',10n**27n)
 const p=v8PerformPrestige(s,NOW)
 assert.equal(p.ok,true,p.reason)
 if(!p.ok)return
 assert.equal(p.state.ascension.run.fameV4Clicks,undefined)
 assert.equal(p.state.ascension.run.autoClickLevel,0)
 for(const n of [19,20,21,22,23])
  assert.equal(p.state.prestige.fameV4?.levels['fame-v4-'+n],10-(n===20||n===21?5:0))
 assert.ok(check(p.state).valid,check(p.state).reason)
})
test('optional V8 save, exact export/import, and forged clocks/counters rejected',()=>{
 const old=rich()
 assert.equal(old.ascension.run.fameV4Clicks,undefined)
 assert.ok(check(old).valid,check(old).reason)
 let s=manual(rich(19,20,21,22,23),NOW,0)
 s=buyDollarAutoClick(s,NOW)!
 s=v4InitializeLegendary(s,NOW)
 s=v4ActivateOvercharge(s,NOW)!
 const exported=exportV8Save(s,NOW)
 const imported=prepareV8SaveImport(exported,NOW)
 assert.equal(imported.ok,true,imported.reason)
 const map=new Map<string,string>()
 const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,val:string)=>{map.set(k,val)}}
 assert.equal(saveV8CapitalState(storage,s),true)
 const loaded=loadV8CapitalState(storage,NOW)
 assert.equal(loaded.ok,true,loaded.reason)
 if(loaded.ok)assert.deepEqual(loaded.state.ascension.run.fameV4Clicks,s.ascension.run.fameV4Clicks)
 const data=fameV4Clicks(s)
 const fake=(fields:Partial<typeof data>)=>({...s,ascension:{...s.ascension,
   run:{...s.ascension.run,fameV4Clicks:{...data,...fields}}}})
 const cases=[
  fake({manualTimestamps:[NOW+1]}),
  fake({frenzyUntil:NOW+2500}),
  fake({lastManualActiveMs:9999999}),
  fake({chainRolls:99999}),
  fake({legendaryAnchorAt:NOW+99999}),
  fake({overcharge:{startedAt:NOW,endsAt:NOW+50_000,readyAt:NOW+OVERCHARGE_COOLDOWN_MS}}),
 ]
 for(const item of cases){
  assert.equal(check(item).valid,false)
  assert.equal(prepareV8SaveImport(JSON.stringify(item),NOW).ok,false)
 }
})
