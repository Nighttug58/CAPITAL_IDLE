import test from 'node:test'
import assert from 'node:assert/strict'
import { FAME_V4_CATALOG,FAME_V4_IDS,FAME_V4_TOTAL_LEVELS,FAME_V4_TOTAL_COST,
 createEmptyFameV4Levels,createEmptyFameV4Shop,fameV4NextCost,fameV4PurchasedCost } from './fame-v4-catalog.ts'
import { createV8CapitalState,getExactAmount as n } from '../exact-state-v8.ts'
import { migrateV8ToFameV4,v8BuyFameV4Upgrade } from './fame-v4-ledger.ts'
import { validateExactV8State } from '../exact-save-validation.ts'
import { getAsset } from '../trading/catalog.ts'
import { v8BuyFameUpgrade } from '../exact-runtime-v8.ts'
import { v8AbsoluteFameStatus } from './absolute-v8.ts'
import { loadV8CapitalState,V8_STORAGE_KEY,V8_FAME_V4_BACKUP_KEY,exportV8Save,prepareV8SaveImport } from '../exact-persistence-v8.ts'
const now=1_800_000_000_000
const isValid=(s:unknown)=>validateExactV8State(s,id=>getAsset(id)?.quantityDecimals??null).valid
test('Fame V4: 30 powers, 196 ranks, 178100 exact Fame, immutable catalogue',()=>{
 assert.equal(FAME_V4_CATALOG.length,30)
 assert.equal(FAME_V4_IDS.length,30)
 assert.equal(new Set(FAME_V4_IDS).size,30)
 assert.equal(FAME_V4_TOTAL_LEVELS,196)
 assert.equal(FAME_V4_TOTAL_COST,178100n)
 assert.ok(Object.isFrozen(FAME_V4_CATALOG)&&Object.isFrozen(FAME_V4_IDS))
 for(const item of FAME_V4_CATALOG){
   assert.ok(Object.isFrozen(item))
   assert.equal(fameV4NextCost(item.id,0),item.firstCost)
   assert.equal(fameV4NextCost(item.id,item.maxLevel-1),item.firstCost+BigInt(item.maxLevel-1)*item.stepCost)
   assert.equal(fameV4NextCost(item.id,item.maxLevel),null)
 }
 const levels=createEmptyFameV4Levels()
 assert.equal(fameV4PurchasedCost(levels),0n)
 for(const item of FAME_V4_CATALOG)levels[item.id]=item.maxLevel
 assert.equal(fameV4PurchasedCost(levels),178100n)
 assert.equal(fameV4PurchasedCost({...levels,'bad-key':1}),null)
 assert.equal(fameV4PurchasedCost({...levels,'fame-v4-01':11}),null)
 assert.equal(fameV4NextCost('bad-key',0),null)
})
test('Fame V4: zero-cost idempotent migration, import/export and backup',()=>{
 const current=createV8CapitalState(now)
 assert.deepEqual(current.prestige.fameV4,createEmptyFameV4Shop())
 assert.ok(isValid(current))
 const {fameV4,...oldPrestige}=current.prestige
 const old={...current,prestige:oldPrestige}
 assert.ok(isValid(old))
 assert.deepEqual(migrateV8ToFameV4(old),current)
 assert.equal(migrateV8ToFameV4(current),current)
 const data=new Map<string,string>([[V8_STORAGE_KEY,JSON.stringify(old)]])
 const store={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v)}}
 const migrated=loadV8CapitalState(store,now)
 assert.equal(migrated.ok,true)
 if(!migrated.ok)return
 assert.equal(migrated.origin,'migrated')
 assert.deepEqual(migrated.state,current)
 assert.equal(store.getItem(V8_FAME_V4_BACKUP_KEY),JSON.stringify(old))
 const again=loadV8CapitalState(store,now)
 assert.equal(again.ok,true)
 if(again.ok)assert.equal(again.origin,'v8')
 const reimport=prepareV8SaveImport(exportV8Save(current,now),now)
 assert.equal(reimport.ok,true)
 if(reimport.ok)assert.deepEqual(reimport.state,current)
})
test('Fame V4: atomic purchases and old Fame ledger coexist, tampering rejected',()=>{
 const state=createV8CapitalState(now),p=state.prestige
 const award=1000n*1_000_000n
 const rich={...state,prestige:{...p,
  fameMicros:(n(p.fameMicros)+award).toString(),
  lifetimeFameMicros:(n(p.lifetimeFameMicros)+award).toString(),
  levelFameMicros:(n(p.levelFameMicros)+award).toString(),
  cycleEarnedFameMicros:(n(p.cycleEarnedFameMicros)+award).toString(),
  cycleLevelFameMicros:(n(p.cycleLevelFameMicros)+award).toString(),
 }}
 assert.ok(isValid(rich))
 const bought=v8BuyFameV4Upgrade(rich,'fame-v4-01',0)
 assert.ok(bought)
 if(!bought)return
 assert.equal(bought.prestige.fameV4?.levels['fame-v4-01'],1)
 assert.equal(n(bought.prestige.fameV4!.spentMicros),180_000_000n)
 assert.ok(isValid(bought))
 assert.equal(v8BuyFameV4Upgrade(bought,'fame-v4-01',0),null)
 const oldBuy=v8BuyFameUpgrade(bought,'click',0)
 assert.ok(oldBuy)
 if(!oldBuy)return
 assert.ok(isValid(oldBuy))
 const absolute=v8AbsoluteFameStatus(oldBuy)
 assert.equal(absolute.unlocked,false)
 assert.equal(absolute.requiredLevels,120)
 const altered={...bought,prestige:{...bought.prestige,fameV4:{...bought.prestige.fameV4!,spentMicros:'0'}}}
 assert.equal(isValid(altered),false)
 assert.equal(prepareV8SaveImport(JSON.stringify(altered),now).ok,false)
})
