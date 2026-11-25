import test from 'node:test'
import assert from 'node:assert/strict'
import { createV8CapitalState,getExactAmount as v,type V8CapitalState } from '../exact-state-v8.ts'
import { v8BuyFameV4UpgradeMax } from './fame-v4-ledger.ts'
import { CURRENT_COLLECTION_SLOTS } from './catalog.ts'
import { collectionV3Snapshot } from './collections-v3.ts'
import { v8BuyCollection,v8BuyCollectionsMax,v8CollectionMaxQuote,v8CreditIncome,
  v8AccrueEnterpriseUntil,v8AdvanceFiscalEconomy,v8Click } from '../exact-runtime-v8.ts'
import { v8AdvanceMarketSecond } from '../exact-market-v8.ts'
import { v8PerformPrestige } from '../exact-prestige-v8.ts'
import { getAsset } from '../trading/catalog.ts'
import { validateExactV8State } from '../exact-save-validation.ts'
import { exportV8Save,prepareV8SaveImport,saveV8CapitalState,loadV8CapitalState } from '../exact-persistence-v8.ts'
import { FISCAL_PERIOD_MS } from '../economy/state.ts'
import { v4RestoreCostCents,v4RestoreCollection,v4BuyMuseumWing,v4StartExhibition,
  v4CollectionsBonusBps,v4ExhibitionCostCents,v4ExhibitionWealthCents,
  v4RefreshPrivateOffers,v4CollectionPriceCents,v4PrivateDiscountBps,
  v4MuseumMissingCost,fameV4Collections,V4_WING_COSTS_CENTS,
  V4_EXHIBITION_DURATION_MS, V4_EXHIBITION_COOLDOWN_MS,V4_PRIVATE_OFFER_MS } from './collections-v4.ts'
const NOW=1_800_000_000_000
const wealth=10n**35n
const valid=(state:V8CapitalState)=>validateExactV8State(state,id=>getAsset(id)?.quantityDecimals??null)
function seed(...ranks:number[]):V8CapitalState {
 const base=createV8CapitalState(NOW),p=base.prestige,fame=120_000n*1_000_000n
 let state:V8CapitalState={...base,game:{...base.game,balance:wealth.toString(),lifetimeEarned:wealth.toString()},
  enterprises:{...base.enterprises,owned:{kiosque:{level:1000,investedCents:'10000000000'}}},
  prestige:{...p,fameMicros:(v(p.fameMicros)+fame).toString(),
    lifetimeFameMicros:(v(p.lifetimeFameMicros)+fame).toString(),
    levelFameMicros:(v(p.levelFameMicros)+fame).toString(),
    cycleEarnedFameMicros:(v(p.cycleEarnedFameMicros)+fame).toString(),
    cycleLevelFameMicros:(v(p.cycleLevelFameMicros)+fame).toString()}}
 for(const num of ranks){
  const bought=v8BuyFameV4UpgradeMax(state,'fame-v4-'+String(num).padStart(2,'0'),0)
  assert.ok(bought,'Fame upgrade '+num)
  state=bought
 }
 assert.ok(valid(state).valid,valid(state).reason)
 return state
}
function collect(state:V8CapitalState,count:number):V8CapitalState {
 let next=state
 for(let i=0;i<count;i++){
  const added=v8BuyCollection(next,CURRENT_COLLECTION_SLOTS[i]!.id)
  assert.ok(added,'Catalog acquisition '+i)
  next=added
 }
 return next
}
test('15: restorations cost exactly 20% rounded-up, respect owned and unique cap, never grant Fame twice',()=>{
 let state=collect(seed(15),3)
 const id=CURRENT_COLLECTION_SLOTS[0]!.id,old=state
 const cost=v4RestoreCostCents(id)!
 state=v4RestoreCollection(state,id,NOW)!
 assert.ok(state)
 assert.equal(v(old.game.balance)-v(state.game.balance),cost)
 assert.equal(state.prestige.fameMicros,old.prestige.fameMicros)
 assert.equal(state.prestige.lifetimeFameMicros,old.prestige.lifetimeFameMicros)
 assert.equal(state.prestige.experienceCents,old.prestige.experienceCents)
 assert.equal(v4RestoreCollection(state,id,NOW),null)
 assert.equal(v4RestoreCollection(state,CURRENT_COLLECTION_SLOTS[10]!.id,NOW),null)
 assert.equal(v4CollectionsBonusBps(state,'click',NOW),25)
 assert.equal(v4CollectionsBonusBps(state,'dividend',NOW),25)
 assert.equal(v4CollectionsBonusBps(state,'enterprise',NOW),25)
 const once=v4RestoreCollection(state,CURRENT_COLLECTION_SLOTS[1]!.id,NOW)!
 assert.equal(fameV4Collections(once).restoredIds.length,2)
 const third=v4RestoreCollection(once,CURRENT_COLLECTION_SLOTS[2]!.id,NOW)
 assert.ok(third,'Rang 10 permet bien 20 restaurations')
 let capped=collect(seed(15),21)
 for(let i=0;i<20;i++){
  const restored=v4RestoreCollection(capped,CURRENT_COLLECTION_SLOTS[i]!.id,NOW)
  assert.ok(restored,'Restoration #'+(i+1))
  capped=restored
 }
 assert.equal(fameV4Collections(capped).restoredIds.length,20)
 assert.equal(v4RestoreCollection(capped,CURRENT_COLLECTION_SLOTS[20]!.id,NOW),null)
 assert.equal(valid(capped).valid,true,valid(capped).reason)
 assert.equal(valid(third!).valid,true,valid(third!).reason)
})
test('18: permanent museum wings cost exact BigInt and never enter the 100 objects',()=>{
 let state=seed(18)
 const bought=[...V4_WING_COSTS_CENTS]
 for(let tier=0;tier<5;tier++){
  const old=state
  const updated=v4BuyMuseumWing(state,tier,NOW)
  assert.ok(updated)
  state=updated
  assert.equal(v(old.game.balance)-v(state.game.balance),bought[tier])
  assert.equal(state.prestige.ownedCollectionIds.length,0)
  assert.equal(old.prestige.lifetimeFameMicros,state.prestige.lifetimeFameMicros)
  assert.equal(v4BuyMuseumWing(state,tier,NOW),null)
 }
 assert.equal(v4CollectionsBonusBps(state,'enterprise',NOW),250)
 assert.equal(v4CollectionsBonusBps(state,'dividend',NOW),250)
 assert.equal(v4CollectionsBonusBps(state,'click',NOW),0)
 assert.equal(fameV4Collections(state).permanentSpentCents,bought.reduce((a,b)=>a+b,0n).toString())
 assert.ok(valid(state).valid,valid(state).reason)
})
test('14: exhibitions use exact net worth, enforce three objects, cooldown and expiry, no XP or Fame',()=>{
 let state=seed(14)
 assert.equal(v4StartExhibition(state,NOW),null)
 state=collect(state,3)
 const cost=v4ExhibitionCostCents(state)!
 assert.ok(cost>=100_000_000n)
 const before=state
 state=v4StartExhibition(state,NOW)!
 assert.ok(state)
 assert.equal(v(before.game.balance)-v(state.game.balance),cost)
 assert.equal(state.prestige.fameMicros,before.prestige.fameMicros)
 assert.equal(state.prestige.experienceCents,before.prestige.experienceCents)
 assert.equal(v4CollectionsBonusBps(state,'enterprise',NOW),500)
 assert.equal(v4CollectionsBonusBps(state,'dividend',NOW),500)
 assert.equal(v4CollectionsBonusBps(state,'click',NOW),0)
 assert.equal(v4CollectionsBonusBps(state,'enterprise',NOW+V4_EXHIBITION_DURATION_MS),0)
 assert.equal(v4StartExhibition(state,NOW),null)
 assert.equal(fameV4Collections(state).exhibition?.cooldownUntil,NOW+V4_EXHIBITION_COOLDOWN_MS)
 state=v8AdvanceFiscalEconomy(state,NOW+V4_EXHIBITION_COOLDOWN_MS)
 assert.ok(v4StartExhibition(state,NOW+V4_EXHIBITION_COOLDOWN_MS))
 assert.ok(valid(state).valid,valid(state).reason)
 const broke={...state,game:{...state.game,balance:'0'}}
 assert.equal(v4StartExhibition(broke,NOW+V4_EXHIBITION_COOLDOWN_MS),null)
})
test('exhibition boost splits offline enterprise incomes at 30 min and does not dilute 72h taxes',()=>{
 let state=collect(seed(14,15,18),4)
 state=v4RestoreCollection(state,CURRENT_COLLECTION_SLOTS[0]!.id,NOW)!
 state=v4BuyMuseumWing(state,0,NOW)!
 state=v4StartExhibition(state,NOW)!
 const full=v8AdvanceFiscalEconomy(state,NOW+FISCAL_PERIOD_MS+30_000)
 const split=v8AdvanceFiscalEconomy(v8AdvanceFiscalEconomy(
  v8AdvanceFiscalEconomy(state,NOW+V4_EXHIBITION_DURATION_MS),
   NOW+FISCAL_PERIOD_MS),NOW+FISCAL_PERIOD_MS+30_000)
 assert.equal(full.game.balance,split.game.balance)
 assert.equal(full.game.lifetimeEarned,split.game.lifetimeEarned)
 assert.equal(full.stats.earnedBySource.enterprises,split.stats.earnedBySource.enterprises)
 assert.equal(full.fiscal.taxesDueCents,split.fiscal.taxesDueCents)
 assert.equal(full.fiscal.taxesPaidCents,split.fiscal.taxesPaidCents)
 assert.equal(full.prestige.experienceCents,split.prestige.experienceCents)
 assert.deepEqual(v8AdvanceFiscalEconomy(full,NOW+FISCAL_PERIOD_MS+30_000),full)
 assert.ok(valid(full).valid,valid(full).reason)
})
test('collection bonus boosts click rewards but does not double XP or historical museum count',()=>{
 const owned=collect(seed(15),1)
 const upgraded=v4RestoreCollection(owned,CURRENT_COLLECTION_SLOTS[0]!.id,NOW)!
 const a=v8Click(owned),b=v8Click(upgraded)
 assert.ok(v(b.stats.earnedBySource.clicks)>v(a.stats.earnedBySource.clicks)||
   v(b.prestige.clickCarryBps.toString())!==v(a.prestige.clickCarryBps.toString()))
 assert.equal(upgraded.prestige.ownedCollectionIds.length,owned.prestige.ownedCollectionIds.length)
 assert.equal(upgraded.prestige.collectionFameMicros,owned.prestige.collectionFameMicros)
})
test('17: deterministic 24h private offers persist, discount once, no new Fame and never double buy',()=>{
 const owned=collect(seed(17),2)
 let state=v4RefreshPrivateOffers(owned,NOW)
 assert.equal(fameV4Collections(state).offers?.items.length,5)
 assert.deepEqual(v4RefreshPrivateOffers(state,NOW+2_000),state)
 const offer=fameV4Collections(state).offers!.items.find(item=>!item.used&&v4PrivateDiscountBps(state,item.itemId,NOW)>0)
 assert.ok(offer,'At least one unconsumed private offer remains after buying two items')
 const price=v4CollectionPriceCents(state,offer.itemId)!
 const base=BigInt(CURRENT_COLLECTION_SLOTS.find(x=>x.id===offer.itemId)!.priceCents)
 assert.equal(price,base*95n/100n)
 const before=state
 state=v8BuyCollection(state,offer.itemId)!
 assert.equal(v(before.game.balance)-v(state.game.balance),price)
 assert.equal(v4PrivateDiscountBps(state,offer.itemId,NOW),0)
 assert.equal(fameV4Collections(state).offers?.items.find(x=>x.itemId===offer.itemId)?.used,true)
 assert.equal(v8BuyCollection(state,offer.itemId),null)
 const next=NOW+V4_PRIVATE_OFFER_MS
 const refreshed=v8AdvanceFiscalEconomy(state,next)
 assert.equal(fameV4Collections(refreshed).offers?.generatedAt,next)
 assert.ok(valid(refreshed).valid,valid(refreshed).reason)
})
test('17: COLLECTION MAX applies discounted quote and consumes each offer atomically',()=>{
 const base=seed(17)
 const withOffers=v4RefreshPrivateOffers(base,NOW)
 const quote=v8CollectionMaxQuote(withOffers)
 assert.equal(quote.ids.length,100)
 const bought=v8BuyCollectionsMax(withOffers)!
 assert.equal(bought.costCents,quote.costCents)
 assert.equal(v(withOffers.game.balance)-v(bought.state.game.balance),quote.costCents)
 assert.equal(bought.state.prestige.ownedCollectionIds.length,100)
 assert.equal(collectionV3Snapshot(bought.state.prestige.ownedCollectionIds).museumComplete,true)
 assert.equal(v8BuyCollectionsMax(bought.state),null)
 assert.equal(v4MuseumMissingCost(bought.state).missing,0)
 assert.equal(v4CollectionsBonusBps(bought.state,'enterprise',NOW),0)
 assert.ok(valid(bought.state).valid,valid(bought.state).reason)
})
test('Prestige retains restored pieces, wings and private offers; resets exhibition only',()=>{
 let state=collect(seed(14,15,17,18),4)
 state=v4RestoreCollection(state,CURRENT_COLLECTION_SLOTS[0]!.id,NOW)!
 state=v4BuyMuseumWing(state,0,NOW)!
 state=v4StartExhibition(state,NOW)!
 state=v4RefreshPrivateOffers(state,NOW)
 state=v8CreditIncome(state,'enterprises',10n**28n)
 const previous=state.prestige.fameV4Collections!
 const prestige=v8PerformPrestige(state,NOW)
 assert.equal(prestige.ok,true,prestige.reason)
 if(!prestige.ok)return
 const after=prestige.state
 assert.deepEqual(after.prestige.fameV4Collections?.restoredIds,previous.restoredIds)
 assert.deepEqual(after.prestige.fameV4Collections?.wingTiers,previous.wingTiers)
 assert.deepEqual(after.prestige.fameV4Collections?.offers,previous.offers)
 assert.equal(after.prestige.fameV4Collections?.exhibition,null)
 assert.equal(v4CollectionsBonusBps(after,'click',NOW),25)
 assert.equal(v4CollectionsBonusBps(after,'enterprise',NOW),75)
 assert.equal(after.prestige.fameV4?.levels['fame-v4-18'],5)
 assert.equal(after.prestige.ownedCollectionIds.length,4)
 assert.ok(valid(after).valid,valid(after).reason)
})
test('strict old V8 compatibility, bounded registries, exact import/export and corruption rejection',()=>{
 const old=seed()
 assert.equal(old.prestige.fameV4Collections,undefined)
 assert.ok(valid(old).valid,valid(old).reason)
 let state=collect(seed(15,17,18),3)
 state=v4RestoreCollection(state,CURRENT_COLLECTION_SLOTS[0]!.id,NOW)!
 state=v4BuyMuseumWing(state,0,NOW)!
 state=v4RefreshPrivateOffers(state,NOW)
 const exported=exportV8Save(state,NOW)
 const imported=prepareV8SaveImport(exported,NOW)
 assert.equal(imported.ok,true,imported.reason)
 if(imported.ok)assert.deepEqual(imported.state,state)
 const memory=new Map<string,string>(),storage={
  getItem:(id:string)=>memory.get(id)??null,setItem:(id:string,txt:string)=>{memory.set(id,txt)},
 }
 assert.equal(saveV8CapitalState(storage,state),true)
 const loaded=loadV8CapitalState(storage,NOW)
 assert.equal(loaded.ok,true,loaded.reason)
 if(loaded.ok)assert.deepEqual(loaded.state.prestige.fameV4Collections,state.prestige.fameV4Collections)
 const section=state.prestige.fameV4Collections!
 const fake=(alter:Partial<typeof section>)=>({...state,prestige:{...state.prestige,
   fameV4Collections:{...section,...alter}}})
 for(const x of [
  fake({restoredIds:[...section.restoredIds,...section.restoredIds]}),
  fake({wingTiers:[0,0]}),
  fake({permanentSpentCents:'0'}),
  fake({offers:{generatedAt:NOW,expiresAt:NOW+100,items:[]}}),
  fake({offers:{generatedAt:NOW+5000,expiresAt:NOW+V4_PRIVATE_OFFER_MS+5000,items:[]}}),
 ]){
  assert.equal(valid(x).valid,false)
  assert.equal(prepareV8SaveImport(JSON.stringify(x),NOW).ok,false)
 }
})
