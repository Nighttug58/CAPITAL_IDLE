import test from 'node:test'
import assert from 'node:assert/strict'
import {createV9CapitalState,getExactAmount as v} from './exact-state-v8.ts'
import {V9_STORAGE_KEY,loadV9CapitalState,saveV9CapitalState,exportV9Save,prepareV9SaveImport} from './exact-persistence-v8.ts'
import {v8BuyFameUpgrade,v8BuyPrestigeUpgrade,v8CreditIncome} from './exact-runtime-v8.ts'
import {v8BuyFameV4Upgrade,v8BuyFameV4UpgradeMax} from './prestige/fame-v4-ledger.ts'
import {v8PerformPrestige} from './exact-prestige-v8.ts'
import {validateExactV8State} from './exact-save-validation.ts'
import {getAsset} from './trading/catalog.ts'
const NOW=1_800_000_000_000
const storage=(initial:Record<string,string>={})=>{
 const db=new Map(Object.entries(initial))
 return {db,getItem:(key:string)=>db.get(key)??null,
   setItem:(key:string,value:string)=>{db.set(key,value)}}
}
const valid=(s:unknown)=>validateExactV8State(s,id=>getAsset(id)?.quantityDecimals??null)
function withFame(amount:bigint){
 const state=createV9CapitalState(NOW),p=state.prestige,award=amount*1_000_000n
 return {...state,prestige:{...p,
  fameMicros:(v(p.fameMicros)+award).toString(),
  lifetimeFameMicros:(v(p.lifetimeFameMicros)+award).toString(),
  levelFameMicros:(v(p.levelFameMicros)+award).toString(),
  cycleEarnedFameMicros:(v(p.cycleEarnedFameMicros)+award).toString(),
  cycleLevelFameMicros:(v(p.cycleLevelFameMicros)+award).toString()}}
}
test('V9 fresh start ignores all old keys and preserves their original bytes',()=>{
 const previous=Object.fromEntries(Array.from({length:8},(_,i)=>[`capital-idle-save-v${i+1}`,JSON.stringify({version:i+1,balance:'99999'})]))
 const disk=storage(previous),result=loadV9CapitalState(disk,NOW)
 assert.equal(result.ok,true)
 if(!result.ok)return
 assert.equal(result.origin,'new')
 assert.equal(result.state.version,9)
 assert.equal(result.state.prestige.fameLegacyLevels,undefined)
 assert.equal(result.state.ascension.progress.legacyRanks,undefined)
 assert.equal(result.state.prestige.fameV4?.version,1)
 assert.deepEqual(Object.fromEntries(Object.keys(previous).map(key=>[key,disk.getItem(key)])),previous)
 assert.equal(JSON.parse(disk.getItem(V9_STORAGE_KEY)!).version,9)
 assert.equal(valid(result.state).valid,true,valid(result.state).reason)
 assert.deepEqual(loadV9CapitalState(disk,NOW),{ok:true,state:result.state,origin:'v9'})
})
test('V9 never upgrades V8 imports or accepts legacy purchase metadata',()=>{
 const state=createV9CapitalState(NOW)
 for(const old of [1,2,3,4,5,6,7,8]){
  assert.equal(prepareV9SaveImport(JSON.stringify({...state,version:old}),NOW).ok,false)
 }
 const legacy={...state,prestige:{...state.prestige,fameLegacyLevels:{...state.prestige.boosts}}}
 const ppLegacy={...state,ascension:{...state.ascension,progress:{...state.ascension.progress,legacyRanks:state.ascension.progress.upgradeLevels}}}
 assert.equal(valid(legacy).valid,false)
 assert.equal(valid(ppLegacy).valid,false)
 assert.equal(saveV9CapitalState(storage(),legacy),false)
 assert.equal(saveV9CapitalState(storage(),ppLegacy),false)
})
test('V9 corrupted save fails closed; no silent reset or resurrection',()=>{
 const bytes=JSON.stringify({version:9,game:{balance:'999999'}})
 const disk=storage({[V9_STORAGE_KEY]:bytes,'capital-idle-save-v8':JSON.stringify(createV9CapitalState(NOW))})
 assert.deepEqual(loadV9CapitalState(disk,NOW),{ok:false,reason:'invalid-v9'})
 assert.equal(disk.getItem(V9_STORAGE_KEY),bytes)
 assert.equal(prepareV9SaveImport(bytes,NOW).ok,false)
 assert.equal(prepareV9SaveImport('{no',NOW).ok,false)
})
test('V9 exact Fame purchases and Prestige remain valid after reload/import',()=>{
 const initial=withFame(25_000n)
 const classic=v8BuyFameUpgrade(initial,'click',0)
 assert.ok(classic)
 if(!classic)return
 const v4=v8BuyFameV4Upgrade(classic,'fame-v4-01',0)
 assert.ok(v4)
 if(!v4)return
 const max=v8BuyFameV4UpgradeMax(v4,'fame-v4-02',0)
 assert.ok(max)
 if(!max)return
 assert.equal(v4.prestige.fameLegacyLevels,undefined)
 assert.equal(v4.prestige.fameShopLedgerVersion,undefined)
 assert.equal(valid(max).valid,true,valid(max).reason)
 const earned=v8CreditIncome(max,'clicks',10n**40n)
 const result=v8PerformPrestige(earned,NOW)
 assert.ok(result.ok,result.ok?'':result.reason)
 if(!result.ok)return
 const next=v8BuyPrestigeUpgrade(result.state,'crypto-staking',0)
 assert.ok(next)
 if(!next)return
 assert.equal(next.prestige.fameV4?.levels['fame-v4-01'],1)
 assert.equal(next.ascension.progress.legacyRanks,undefined)
 assert.equal(valid(next).valid,true,valid(next).reason)
 const disk=storage()
 assert.equal(saveV9CapitalState(disk,next),true)
 assert.deepEqual(loadV9CapitalState(disk,NOW),{ok:true,state:next,origin:'v9'})
 const exported=exportV9Save(next,NOW)
 const imported=prepareV9SaveImport(exported,NOW)
 assert.equal(imported.ok,true)
 if(imported.ok)assert.deepEqual(imported.state,next)
})
test('V9 handles 10^100 cents and never corrupts on failed storage writes',()=>{
 const game=createV9CapitalState(NOW)
 const whale={...game,game:{...game.game,balance:(10n**100n).toString(),lifetimeEarned:(10n**100n).toString()}}
 const disk=storage()
 assert.equal(saveV9CapitalState(disk,whale),true)
 assert.equal(loadV9CapitalState(disk,NOW).ok,true)
 const before=disk.getItem(V9_STORAGE_KEY)
 const failure={getItem:(key:string)=>disk.getItem(key),setItem:(_:string,__:string)=>{throw Error('quota')}}
 assert.equal(saveV9CapitalState(failure,game),false)
 assert.equal(disk.getItem(V9_STORAGE_KEY),before)
 const silent={getItem:(key:string)=>disk.getItem(key),setItem:(_:string,__:string)=>{}}
 assert.equal(saveV9CapitalState(silent,game),false)
 assert.equal(disk.getItem(V9_STORAGE_KEY),before)
})
