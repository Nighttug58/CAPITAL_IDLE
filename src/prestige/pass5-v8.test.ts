import test from 'node:test'
import assert from 'node:assert/strict'
import { createCapitalState } from '../capital.ts'
import { getLevelStartThreshold } from '../game.ts'
import { buyFameUpgrade } from './shop.ts'
import { getVersionedPurchasedFameCost, getV2NextFameBoostCost, TOTAL_V2_FAME_SHOP_COST,
  FAME_BOOST_IDS } from './catalog.ts'
import { projectValidatedV7ToExactV8 } from '../exact-save-v8.ts'
import { getAsset } from '../trading/catalog.ts'
import { migratePreV2V8Save } from '../fame-cycle-v8.ts'
import { validateExactV8State } from '../exact-save-validation.ts'
import { getExactLevel, getExactLevelProgress, rebaseV3ExperienceCents } from '../exact-levels.ts'
import { V8_BACKUP_KEY, V8_STORAGE_KEY, V8_FAME_REBALANCE_BACKUP_KEY, loadV8CapitalState,
  prepareV8SaveImport, saveV8CapitalState, exportV8Save } from '../exact-persistence-v8.ts'
import { v8BuyFameUpgrade, v8CreditIncome, v8BuyCollection } from '../exact-runtime-v8.ts'
import { getExactAmount as v, type V8CapitalState } from '../exact-state-v8.ts'

const now=1_800_000_000_000
const dec=(id:string)=>getAsset(id)?.quantityDecimals??null
function formerV8(): V8CapitalState {
  const dollars=getLevelStartThreshold(30)+Math.floor(
    (getLevelStartThreshold(31)-getLevelStartThreshold(30))*0.42)
  const base=createCapitalState({balance:dollars,lifetimeEarned:dollars,purchasedUpgrades:0},now)
  assert.equal(base.prestige.lastAwardedLevel,30)
  const bought=buyFameUpgrade(base,'click',0)
  assert.equal(bought.ok,true)
  if(!bought.ok)throw new Error('Legacy purchase failed')
  const converted=projectValidatedV7ToExactV8(bought.state,dec)
  assert.equal(validateExactV8State(converted,dec).valid,true)
  return converted as unknown as V8CapitalState
}
function store(initial:Record<string,string>={}) {
  const m=new Map(Object.entries(initial))
  return {getItem:(k:string)=>m.get(k)??null,setItem:(k:string,val:string)=>{m.set(k,val)}}
}

test('Fame V2 pricing keeps legacy tariff immutable and totals 167 710 Fame',()=>{
  assert.equal(TOTAL_V2_FAME_SHOP_COST,167_710)
  assert.equal(getV2NextFameBoostCost('click',0),260)
  assert.equal(getV2NextFameBoostCost('fame',0),350)
  assert.equal(getV2NextFameBoostCost('click',1),338)
  assert.equal(getV2NextFameBoostCost('click',19),2768)
  assert.equal(getV2NextFameBoostCost('fame',19),3333)
  assert.equal(getV2NextFameBoostCost('click',20),null)
  const full=Object.fromEntries(FAME_BOOST_IDS.map(id=>[id,20])) as Record<typeof FAME_BOOST_IDS[number],number>
  const empty=Object.fromEntries(FAME_BOOST_IDS.map(id=>[id,0])) as Record<typeof FAME_BOOST_IDS[number],number>
  assert.equal(getVersionedPurchasedFameCost(full,empty),167_710)
  assert.equal(getVersionedPurchasedFameCost(full,full),24_650)
  assert.equal(getVersionedPurchasedFameCost({...full,click:0},full),null)
})

test('old V8 level + fraction and spent Fame migrate once without rewards or repricing',()=>{
  const raw=formerV8()
  const serialized=JSON.stringify(raw)
  const oldExperience=v(raw.prestige.experienceCents)
  const oldFame=raw.prestige.fameMicros
  const upgraded=migratePreV2V8Save(raw)
  assert.equal(upgraded.prestige.xpCurveVersion,4)
  assert.equal(upgraded.prestige.fameShopLedgerVersion,2)
  assert.equal(upgraded.prestige.fameLegacyLevels.click,1)
  assert.equal(upgraded.prestige.fameSpentMicros,'52000000')
  assert.equal(upgraded.prestige.fameMicros,oldFame)
  assert.equal(upgraded.prestige.lifetimeFameMicros,raw.prestige.lifetimeFameMicros)
  assert.equal(upgraded.prestige.levelFameMicros,raw.prestige.levelFameMicros)
  assert.equal(v(upgraded.prestige.experienceCents),rebaseV3ExperienceCents(oldExperience))
  assert.equal(getExactLevel(v(upgraded.prestige.experienceCents)),30)
  const progress=getExactLevelProgress(v(upgraded.prestige.experienceCents))
  assert.ok(progress.fractionBasisPoints>=4100&&progress.fractionBasisPoints<=4300)
  assert.equal(migratePreV2V8Save(upgraded),upgraded)
  assert.equal(validateExactV8State(upgraded,dec).valid,true)
  assert.equal(JSON.stringify(raw),serialized)
})

test('existing purchased Fame boost keeps old price; next rank uses new price and strict ledger',()=>{
  const state=migratePreV2V8Save(formerV8())
  const oldFame=v(state.prestige.fameMicros)
  const bought=v8BuyFameUpgrade(state,'click',1)
  assert.ok(bought)
  if(!bought)return
  assert.equal(bought.prestige.boosts.click,2)
  assert.equal(bought.prestige.fameLegacyLevels.click,1)
  assert.equal(v(bought.prestige.fameMicros),oldFame-338_000_000n)
  assert.equal(v(bought.prestige.fameSpentMicros),390_000_000n)
  assert.equal(validateExactV8State(bought,dec).valid,true)
  assert.equal(v8BuyFameUpgrade(bought,'click',1),null)
  assert.equal(validateExactV8State({...bought,prestige:{...bought.prestige,fameSpentMicros:'52000000'}},dec).valid,false)
  assert.equal(validateExactV8State({...bought,prestige:{...bought.prestige,fameLegacyLevels:{...bought.prestige.fameLegacyLevels,click:2}}},dec).valid,false)
})

test('V8 on-disk migration is atomic, preserves original, reloading or import does not rebase again',()=>{
  const old=formerV8()
  const serialized=JSON.stringify(old)
  const saved=store({[V8_STORAGE_KEY]:serialized})
  const result=loadV8CapitalState(saved,now)
  assert.equal(result.ok,true)
  if(!result.ok)return
  assert.equal(result.origin,'migrated')
  assert.equal(saved.getItem(V8_FAME_REBALANCE_BACKUP_KEY),serialized)
  assert.equal(result.state.prestige.fameShopLedgerVersion,2)
  assert.equal(validateExactV8State(result.state,dec).valid,true)
  const next=loadV8CapitalState(saved,now)
  assert.equal(next.ok,true)
  if(next.ok)assert.deepEqual(next.state,result.state)
  assert.equal(saveV8CapitalState(saved,result.state),true)
  const exportText=exportV8Save(result.state,now)
  const imported=prepareV8SaveImport(exportText,now)
  assert.equal(imported.ok,true)
  if(imported.ok)assert.deepEqual(imported.state,result.state)
  const oldImport=prepareV8SaveImport(serialized,now)
  assert.equal(oldImport.ok,true)
  if(oldImport.ok)assert.deepEqual(oldImport.state,result.state)
  const forged={...old,prestige:{...old.prestige,fameMicros:'9999999999999'}}
  const badText=JSON.stringify(forged)
  const corrupted=store({[V8_STORAGE_KEY]:badText,[V8_BACKUP_KEY]:'old valid backup'})
  assert.equal(loadV8CapitalState(corrupted,now).ok,false)
  assert.equal(corrupted.getItem(V8_STORAGE_KEY),badText)
  assert.equal(corrupted.getItem(V8_BACKUP_KEY),'old valid backup')
})

test('replayed levels grant Fame again once per new cycle, without collection double-credit',()=>{
  const old=migratePreV2V8Save(formerV8())
  const priorFame=v(old.prestige.fameMicros)
  const { xpRebaseV4: _evidence, ...previousPrestige } = old.prestige
  void _evidence
  const again:V8CapitalState={...old,
    prestige:{...previousPrestige,experienceCents:'0',lastAwardedLevel:1,
      // This simulates the next-cycle counters prepared by the previous reset.
      cycleEarnedFameMicros:'0',cycleLevelFameMicros:'0',cycleCollectionFameMicros:'0'},
    ascension:{...old.ascension,progress:{...old.ascension.progress,highestFameAwardedLevel:30}}}
  const target=3
  const income=BigInt(getLevelStartThreshold(target))*5n*100n
  const rewarded=v8CreditIncome(again,'enterprises',income)
  assert.equal(rewarded.prestige.lastAwardedLevel,target)
  assert.equal(rewarded.ascension.progress.highestFameAwardedLevel,30)
  assert.equal(v(rewarded.prestige.fameMicros)-priorFame,5_000_000n)
  assert.equal(rewarded.prestige.cycleLevelFameMicros,'5000000')
  assert.equal(v8CreditIncome(rewarded,'enterprises',0n),rewarded)
  assert.equal(validateExactV8State(rewarded,dec).valid,true,validateExactV8State(rewarded,dec).reason)
  const collectionPurchase=v8BuyCollection(rewarded,'watches-01')
  assert.ok(collectionPurchase)
  if(!collectionPurchase)return
  assert.equal(collectionPurchase.prestige.cycleCollectionFameMicros,'30000000')
  assert.equal(v8BuyCollection(collectionPurchase,'watches-01'),null)
})

test('120 legacy Fame ranks and 50 permanent collections survive migration without paying again',async()=>{
  const { buyCollectionItem }=await import('./collections.ts')
  const { COLLECTION_SLOTS }=await import('./catalog.ts')
  const source=createCapitalState({balance:100_000_000_000,lifetimeEarned:100_000_000_000,purchasedUpgrades:0},now)
  let game=source
  for(const id of FAME_BOOST_IDS)for(let rank=0;rank<20;rank++){
    const bought=buyFameUpgrade(game,id,rank)
    assert.equal(bought.ok,true,`Fame Shop ${id}/${rank}`)
    if(!bought.ok)return
    game=bought.state
  }
  for(const item of COLLECTION_SLOTS){
    const bought=buyCollectionItem(game,item.id)
    assert.equal(bought.ok,true,`Collection ${item.id}`)
    if(!bought.ok)return
    game=bought.state
  }
  assert.equal(game.prestige.ownedCollectionIds.length,50)
  const sourceV8=projectValidatedV7ToExactV8(game,dec) as unknown as V8CapitalState
  assert.equal(validateExactV8State(sourceV8,dec).valid,true)
  const converted=migratePreV2V8Save(sourceV8)
  assert.equal(converted.prestige.fameSpentMicros,'24650000000')
  assert.equal(converted.prestige.fameMicros,sourceV8.prestige.fameMicros)
  assert.equal(converted.prestige.lifetimeFameMicros,sourceV8.prestige.lifetimeFameMicros)
  assert.equal(converted.prestige.ownedCollectionIds.length,50)
  assert.ok(FAME_BOOST_IDS.every(id=>converted.prestige.boosts[id]===20&&
    converted.prestige.fameLegacyLevels[id]===20))
  assert.equal(converted.prestige.fameShopLedgerVersion,2)
  assert.equal(validateExactV8State(converted,dec).valid,true)
  assert.equal(v8BuyCollection(converted, COLLECTION_SLOTS[0]!.id),null)
  assert.equal(saveV8CapitalState(store(),converted),true)
  assert.equal(prepareV8SaveImport(exportV8Save(converted,now),now).ok,true)
})


test('V8 rebalance fails closed on storage write errors without destroying the original save',()=>{
  const original=JSON.stringify(formerV8())
  const memory=store({[V8_STORAGE_KEY]:original})
  const broken={
    getItem:memory.getItem,
    setItem:(key:string,value:string)=>{
      if(key===V8_STORAGE_KEY)throw new Error('Simulated full storage')
      memory.setItem(key,value)
    },
  }
  assert.deepEqual(loadV8CapitalState(broken,now),{ok:false,reason:'write-failed'})
  assert.equal(memory.getItem(V8_STORAGE_KEY),original)
  assert.equal(memory.getItem(V8_FAME_REBALANCE_BACKUP_KEY),original)
})
