import test from 'node:test'
import assert from 'node:assert/strict'
import { createV8CapitalState,getExactAmount as v } from '../exact-state-v8.ts'
import { v8BuyTrade, v8SellTrade } from '../exact-runtime-v8.ts'
import { v8BuyFameV4UpgradeMax } from '../prestige/fame-v4-ledger.ts'
import { validateExactV8State } from '../exact-save-validation.ts'
import { prepareV8SaveImport, exportV8Save, loadV8CapitalState, saveV8CapitalState } from '../exact-persistence-v8.ts'
import { v8AdvanceMarketSecond } from '../exact-market-v8.ts'
import { getAsset } from './catalog.ts'
import { applyFameV4AutoSells,applyNewsAutoSells,setNewsAutoSellRule } from './auto-sell-v8.ts'
import { eligibleDiversifiedStocks,v4DividendBonusBps,
  fameV4Trend, setFameV4TrailingStop,setFameV4ProfitTarget,
  observeFameV4News,prestigeFameV4Trading } from './fame-v4-trading.ts'
import { makeOfflineReport } from '../offline-report-v8.ts'
import type { V8CapitalState } from '../exact-state-v8.ts'
import type { MarketNews } from './types.ts'
const NOW=1_800_000_000_000
const valid=(s:unknown)=>validateExactV8State(s,id=>getAsset(id)?.quantityDecimals??null)
function prepared(...ids:number[]):V8CapitalState{
 const base=createV8CapitalState(NOW),p=base.prestige
 const fame=100_000n*1_000_000n
 let state:V8CapitalState={...base,
  game:{...base.game,balance:'1000000000000000000',lifetimeEarned:'1000000000000000000'},
  prestige:{...p,fameMicros:(v(p.fameMicros)+fame).toString(),
   lifetimeFameMicros:(v(p.lifetimeFameMicros)+fame).toString(),
   levelFameMicros:(v(p.levelFameMicros)+fame).toString(),
   cycleEarnedFameMicros:(v(p.cycleEarnedFameMicros)+fame).toString(),
   cycleLevelFameMicros:(v(p.cycleLevelFameMicros)+fame).toString()},
 }
 for(const id of ids){
  const next=v8BuyFameV4UpgradeMax(state,'fame-v4-'+String(id).padStart(2,'0'),0)
  assert.ok(next,'Cannot fund unlocked Fame '+id)
  state=next
 }
 assert.ok(valid(state).valid,valid(state).reason)
 return state
}
function buy(state:V8CapitalState,id='nvideo',qty='10'):V8CapitalState{
 const r=v8BuyTrade(state,id,qty)
 assert.ok(r.ok)
 return r.state
}
function withQuote(state:V8CapitalState,id:string,price:number,at=NOW+1000):V8CapitalState{
 const asset=getAsset(id)!
 const previous=state.trading.quotes[id]??{price:asset.referencePrice,momentum:0,dividendYield:asset.initialDividendYield,updatedAt:NOW}
 return {...state,trading:{...state.trading,dividendLastPaidAt:at,
  quotes:{...state.trading.quotes,[id]:{...previous,price,updatedAt:at}}}}
}
test('01: observational trend varies by unlocked window and never changes economic data',()=>{
 const base=prepared(1)
 const id='nvideo',ref=getAsset(id)!.referencePrice
 const rows=Array.from({length:50},(_,i)=>({at:NOW-245000+i*5000,price:ref*(1+i/200)}))
 const state={...base,trading:{...base.trading,history:{...base.trading.history,[id]:rows}}}
 const old=JSON.stringify(state)
 const indicator=fameV4Trend(state,id)
 assert.ok(indicator)
 assert.equal(indicator.windowSeconds,300)
 assert.ok(indicator.variationPct>0)
 assert.equal(JSON.stringify(state),old)
 assert.equal(fameV4Trend(state,'invalid'),null)
})
test('03 and 05: fixed exact dividends gain capped V4 bonus without affecting market price',()=>{
 const withDividend=buy(prepared(3),'nvideo','100000')
 const baseline=buy(prepared(),'nvideo','100000')
 assert.equal(v4DividendBonusBps(withDividend),1500)
 assert.equal(v4DividendBonusBps(baseline),0)
 const a=v8AdvanceMarketSecond(baseline)
 const b=v8AdvanceMarketSecond(withDividend)
 assert.ok(v(b.stats.earnedBySource.dividends)>v(a.stats.earnedBySource.dividends))
 assert.equal(b.trading.quotes.nvideo?.price,a.trading.quotes.nvideo?.price)
 assert.ok(valid(b).valid,valid(b).reason)
 const diverse=buy(buy(prepared(5),'nvideo','100'),'mike','100')
 assert.equal(eligibleDiversifiedStocks(diverse),2)
 assert.equal(v4DividendBonusBps(diverse),100)
})
test('02: stop tracks its peak, closes liquid position exactly once and emits receipt',()=>{
 const state=buy(prepared(2))
 const configured=setFameV4TrailingStop(state,'nvideo',true,5)
 assert.ok(configured)
 const ref=getAsset('nvideo')!.referencePrice
 const raised=withQuote(configured!,'nvideo',ref*1.12)
 const peak=applyFameV4AutoSells(raised,NOW+1000)
 assert.equal(peak.trading.fameV4Trading?.stops.nvideo?.peakPrice,ref*1.12)
 assert.ok(peak.trading.positions.nvideo)
 const falling=withQuote(peak,'nvideo',ref*.95,NOW+2000)
 const sold=applyFameV4AutoSells(falling,NOW+2000)
 assert.equal(sold.trading.positions.nvideo,undefined)
 assert.equal(sold.trading.autoSellHistory?.at(-1)?.trigger,'trailingStop')
 assert.equal(sold.trading.fameV4Trading?.stops.nvideo?.enabled,false)
 assert.equal(sold.trading.fameV4Trading?.stops.nvideo?.peakPrice,null)
 assert.ok(valid(sold).valid,valid(sold).reason)
 assert.deepEqual(applyFameV4AutoSells(sold,NOW+2000),sold)
})
test('02: units locked in staking are not sold, including in offline clock replay',()=>{
 let state=buy(prepared(2),'nvideo','10')
 state=setFameV4TrailingStop(state,'nvideo',true,5)!
 const held=v(state.trading.positions.nvideo!.quantity),locked=held/2n
 const staked={...state,trading:{...state.trading,
   staking:{...state.trading.staking,positions:{...state.trading.staking.positions,
   nvideo:{locked:locked.toString(),unlocking:'0',unlockAt:null,awaitingCompound:'0',
     rewardHeld:'0',rewardLocked:'0',rewardUnlocking:'0',carryUnits:0,lifetimeRewards:'0',carryPicoUnits:'0'}}}}}
 const reduced=withQuote(staked,'nvideo',getAsset('nvideo')!.referencePrice*.5)
 const sold=applyFameV4AutoSells(reduced,NOW+1000)
 assert.equal(v(sold.trading.positions.nvideo!.quantity),locked)
 assert.equal(sold.trading.autoSellHistory?.[0]?.trigger,'trailingStop')
 assert.ok(valid(sold).valid,valid(sold).reason)
})
test('07: three configurable staged objectives respect percentage and available shares',()=>{
 let state=buy(prepared(7),'nvideo','20')
 state=setFameV4ProfitTarget(state,'nvideo',0,10,50)!
 state=setFameV4ProfitTarget(state,'nvideo',1,150,25)!
 assert.equal(state.trading.fameV4Trading?.targets.nvideo?.length,2)
 const trigger=withQuote(state,'nvideo',getAsset('nvideo')!.referencePrice*2)
 const after=applyFameV4AutoSells(trigger,NOW+1000)
 assert.equal(after.trading.autoSellHistory?.length,1)
 assert.equal(after.trading.autoSellHistory?.[0]?.trigger,'profitTarget')
 assert.equal(v(after.trading.positions.nvideo!.quantity),v(state.trading.positions.nvideo!.quantity)/2n)
 assert.equal(after.trading.fameV4Trading?.targets.nvideo?.[0]?.slot,1)
 assert.ok(v(after.fiscal.taxesDueCents)>0n)
 assert.ok(valid(after).valid,valid(after).reason)
 const repeat=applyFameV4AutoSells(after,NOW+1000)
 assert.deepEqual(repeat.trading.autoSellHistory,after.trading.autoSellHistory)
})
test('07: reject unauthorized quantities and invalid targets without touching state',()=>{
 const state=prepared(7)
 const old=JSON.stringify(state)
 assert.equal(setFameV4ProfitTarget(state,'nvideo',0,0,25),null)
 assert.equal(setFameV4ProfitTarget(state,'nvideo',4,20,25),null)
 assert.equal(setFameV4ProfitTarget(state,'nvideo',0,10001,25),null)
 assert.equal(setFameV4ProfitTarget(state,'nvideo',0,25,42),null)
 assert.equal(JSON.stringify(state),old)
 assert.equal(setFameV4TrailingStop(prepared(),'nvideo',true,25),null)
})
test('news sell has priority over stop & target, receipts are included in offline report',()=>{
 let state=buy(prepared(2,7),'nvideo','12')
 state=setFameV4TrailingStop(state,'nvideo',true,5)!
 state=setFameV4ProfitTarget(state,'nvideo',0,5,100)!
 state=setNewsAutoSellRule(state,'nvideo','greenEnd',true)!
 const bullish:MarketNews={id:'news-green-v4',templateId:'chip-breakthrough',
   startedAt:NOW-1000,endsAt:NOW+1000,affectedAssetIds:['nvideo'],impact:1,phase:'active'}
 const before={...state,trading:{...state.trading,news:[bullish]}}
 const after={...before,trading:{...before.trading,dividendLastPaidAt:NOW+1000}}
 const completed=applyFameV4AutoSells(applyNewsAutoSells(before,after,NOW+1000),NOW+1000)
 assert.equal(completed.trading.positions.nvideo,undefined)
 assert.equal(completed.trading.autoSellHistory?.length,1)
 assert.equal(completed.trading.autoSellHistory?.[0]?.trigger,'greenEnd')
 const report=makeOfflineReport(before,completed,NOW+1000)
 assert.equal(report.autoSales.length,1)
 assert.equal(report.autoSales[0]?.trigger,'greenEnd')
 assert.ok(valid(completed).valid,valid(completed).reason)
})
test('06: news ledger captures actual observations and closes once, keeps last 100 records',()=>{
 let state=prepared(6)
 for(let i=0;i<105;i++){
  const at=NOW+i*3000
  const event:MarketNews={id:'news-log-'+i,templateId:'chip-breakthrough',
    startedAt:at,endsAt:at+2000,affectedAssetIds:['nvideo'],impact:.5,phase:'active'}
  const after={...state,trading:{...state.trading,dividendLastPaidAt:at,news:[event]}}
  state=observeFameV4News(state,after,at)
  const end={...state,trading:{...state.trading,dividendLastPaidAt:at+2000,news:[event]}}
  state=observeFameV4News(state,end,at+2000)
 }
 const records=state.trading.fameV4Trading!.newsLog
 assert.equal(records.length,100)
 assert.equal(records[0]?.id,'news-log-5')
 assert.equal(records.at(-1)?.id,'news-log-104')
 assert.ok(records.every(r=>r.closedAt!==undefined&&r.endPrices?.nvideo!==undefined))
 assert.ok(valid(state).valid,valid(state).reason)
})
test('V4 strict validation, exact import/export and Prestige preserve settings without reusing open targets',()=>{
 let state=buy(prepared(2,6,7))
 state=setFameV4TrailingStop(state,'nvideo',true,10)!
 state=setFameV4ProfitTarget(state,'nvideo',0,10,50)!
 assert.ok(valid(state).valid,valid(state).reason)
 const imported=prepareV8SaveImport(exportV8Save(state,NOW),NOW)
 assert.equal(imported.ok,true)
 if(imported.ok)assert.deepEqual(imported.state,state)
 const mem=new Map<string,string>(),storage={
   getItem:(key:string)=>mem.get(key)??null,setItem:(key:string,data:string)=>{mem.set(key,data)},
 }
 assert.equal(saveV8CapitalState(storage,state),true)
 const loaded=loadV8CapitalState(storage,NOW)
 assert.equal(loaded.ok,true)
 if(loaded.ok)assert.deepEqual(loaded.state.trading.fameV4Trading,state.trading.fameV4Trading)
 const cleared=prestigeFameV4Trading(state.trading.fameV4Trading)
 assert.equal(cleared?.stops.nvideo?.peakPrice,null)
 assert.equal(Object.keys(cleared!.targets).length,0)
 const badStop={...state,trading:{...state.trading,fameV4Trading:{...state.trading.fameV4Trading!,
   stops:{nvideo:{enabled:true,drawdownPct:1,peakPrice:-5}}}}}
 assert.equal(valid(badStop).valid,false)
 const badTarget={...state,trading:{...state.trading,fameV4Trading:{...state.trading.fameV4Trading!,
   targets:{nvideo:[{slot:10,gainPct:100,portionPct:100}]}}}}
 assert.equal(valid(badTarget).valid,false)
 const badRecord={...state,trading:{...state.trading,fameV4Trading:{...state.trading.fameV4Trading!,
   newsLog:[{id:'forged',templateId:'bad',startedAt:NOW,endsAt:NOW+1000,recordedAt:NOW,direction:'bullish',startPrices:{nvideo:1}}]}}}
 assert.equal(valid(badRecord).valid,false)
 assert.equal(prepareV8SaveImport(JSON.stringify(badStop),NOW).ok,false)
})
