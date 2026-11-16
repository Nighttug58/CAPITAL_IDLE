import test from 'node:test'
import assert from 'node:assert/strict'
import {createCapitalState} from './capital.ts'
import {createSaveExport} from './save-transfer.ts'
import {V8_STORAGE_KEY,V8_BACKUP_KEY,loadV8CapitalState,saveV8CapitalState,
  exportV8Save,prepareV8SaveImport} from './exact-persistence-v8.ts'
import {v8Click} from './exact-runtime-v8.ts'
import {getExactAmount as v,createV8CapitalState} from './exact-state-v8.ts'

const now=1_800_000_000_000
function fake(initial:Record<string,string>={}){
 const items=new Map(Object.entries(initial))
 return {items,getItem:(k:string)=>items.get(k)??null,setItem:(k:string,val:string)=>{items.set(k,val)}}
}

test('V7 localStorage migrates atomically to V8 and preserves original and backup',()=>{
 const original=createCapitalState({balance:1234.56,lifetimeEarned:2000,purchasedUpgrades:0},now)
 const raw=JSON.stringify(original)
 const storage=fake({'capital-idle-save-v7':raw})
 const loaded=loadV8CapitalState(storage,now)
 assert.equal(loaded.ok,true)
 if(!loaded.ok)return
 assert.equal(loaded.origin,'migrated')
 assert.equal(loaded.state.version,8)
 assert.equal(loaded.state.game.balance,'123456')
 assert.equal(storage.getItem('capital-idle-save-v7'),raw)
 assert.equal(storage.getItem(V8_BACKUP_KEY),raw)
 assert.equal(JSON.parse(storage.getItem(V8_STORAGE_KEY)!).game.balance,'123456')
 const second=loadV8CapitalState(storage,now)
 assert.equal(second.ok,true)
 if(second.ok)assert.equal(second.origin,'v8')
})

test('V8 save mutations > 1e100 reload exactly, import/export losslessly',()=>{
 const storage=fake()
 const created=loadV8CapitalState(storage,now)
 assert.equal(created.ok,true)
 if(!created.ok)return
 const gigantic=10n**102n
 const wealthy={...created.state,game:{...created.state.game,
   balance:gigantic.toString(),lifetimeEarned:gigantic.toString()}}
 const next=v8Click(wealthy)
 assert.equal(v(next.game.balance),gigantic+100n)
 assert.equal(saveV8CapitalState(storage,next),true)
 const recovered=loadV8CapitalState(storage,now)
 assert.equal(recovered.ok,true)
 if(!recovered.ok)return
 assert.equal(v(recovered.state.game.balance),gigantic+100n)
 const exported=exportV8Save(recovered.state,now)
 const imported=prepareV8SaveImport(exported,now)
 assert.equal(imported.ok,true)
 if(imported.ok)assert.deepEqual(imported.state,recovered.state)
})

test('Corrupted V8 never resurrects V7 and never replaces original bytes',()=>{
 const original=JSON.stringify(createCapitalState(undefined,now))
 const bad=JSON.stringify({version:8,game:{balance:'100'}})
 const storage=fake({[V8_STORAGE_KEY]:bad,'capital-idle-save-v7':original})
 const loaded=loadV8CapitalState(storage,now)
 assert.deepEqual(loaded,{ok:false,reason:'invalid-v8'})
 assert.equal(storage.getItem(V8_STORAGE_KEY),bad)
 assert.equal(storage.getItem('capital-idle-save-v7'),original)
})

test('Rejected old V7 data stays untouched; new file fails closed',()=>{
 const corrupt=JSON.stringify({...createCapitalState(undefined,now),game:{balance:1e80}})
 const storage=fake({'capital-idle-save-v7':corrupt})
 assert.deepEqual(loadV8CapitalState(storage,now),{ok:false,reason:'invalid-legacy'})
 assert.equal(storage.getItem(V8_STORAGE_KEY),null)
 assert.equal(storage.getItem('capital-idle-save-v7'),corrupt)
 assert.equal(prepareV8SaveImport('INVALID',now).ok,false)
 assert.equal(prepareV8SaveImport(JSON.stringify({version:8,game:{balance:'-1'}}),now).ok,false)
 const v7Export=createSaveExport(createCapitalState(undefined,now),now)
 const imported=prepareV8SaveImport(v7Export,now)
 assert.equal(imported.ok,true)
 if(imported.ok)assert.equal(imported.state.version,8)
})

test('V1, V2, V3 local saves migrate to V8 without deleting their original bytes',()=>{
 for(const version of [1,2,3]){
   const key=`capital-idle-save-v${version}`
   const before=JSON.stringify({balance:100,lifetimeEarned:200,purchasedUpgrades:0})
   const storage=fake({[key]:before})
   const result=loadV8CapitalState(storage,now)
   assert.equal(result.ok,true,`V${version} should migrate`)
   if(!result.ok)continue
   assert.equal(result.state.version,8)
   assert.equal(storage.getItem(key),before)
   assert.equal(storage.getItem(V8_STORAGE_KEY),JSON.stringify(result.state))
 }
})

test('Invalid early local save does not silently become a new V8 game',()=>{
 const original=JSON.stringify({balance:500,lifetimeEarned:10,purchasedUpgrades:10})
 const storage=fake({'capital-idle-save-v1':original})
 const result=loadV8CapitalState(storage,now)
 assert.deepEqual(result,{ok:false,reason:'invalid-legacy'})
 assert.equal(storage.getItem(V8_STORAGE_KEY),null)
 assert.equal(storage.getItem('capital-idle-save-v1'),original)
})


test('Active market quotes and news survive exact V8 save and reload',async()=>{
 const {v8AdvanceMarketSecond}=await import('./exact-market-v8.ts')
 const initial=createV8CapitalState(now)
 let current=initial
 for(let i=0;i<6;i++)current=v8AdvanceMarketSecond(current)
 assert.equal(Object.keys(current.trading.quotes).length,45)
 const storage=fake()
 assert.equal(saveV8CapitalState(storage,current),true)
 const result=loadV8CapitalState(storage,now+6000)
 assert.equal(result.ok,true)
 if(!result.ok)return
 assert.deepEqual(result.state.trading.quotes,current.trading.quotes)
 assert.deepEqual(result.state.trading.news,current.trading.news)
 assert.equal(result.state.trading.dividendLastPaidAt,now+6000)
})

test('Tampered V8 quote is rejected without modifying valid backups',async()=>{
 const {v8AdvanceMarketSecond}=await import('./exact-market-v8.ts')
 let state=createV8CapitalState(now)
 for(let i=0;i<6;i++)state=v8AdvanceMarketSecond(state)
 const tampered={...state,trading:{...state.trading,quotes:{...state.trading.quotes,
   nvideo:{...state.trading.quotes.nvideo!,price:-100}}}}
 const raw=JSON.stringify(tampered)
 const storage=fake({[V8_STORAGE_KEY]:raw,'capital-idle-save-v7':'original'})
 assert.deepEqual(loadV8CapitalState(storage,now+6000),{ok:false,reason:'invalid-v8'})
 assert.equal(storage.getItem(V8_STORAGE_KEY),raw)
 assert.equal(storage.getItem('capital-idle-save-v7'),'original')
})
