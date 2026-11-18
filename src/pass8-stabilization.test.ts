import assert from 'node:assert/strict'
import test from 'node:test'
import { performance } from 'node:perf_hooks'
import { createCapitalState } from './capital.ts'
import { createSaveExport } from './save-transfer.ts'
import { createV8CapitalState } from './exact-state-v8.ts'
import { getAsset } from './trading/catalog.ts'
import { getNewsDirection } from './trading/news.ts'
import { v8AdvanceMarketSecond } from './exact-market-v8.ts'
import { v8PerformPrestige, v8PrestigeRewardPreview, v8EligiblePrestigeWorthCents } from './exact-prestige-v8.ts'
import { v8AbsoluteFameStatus, FAME_FACTOR_SCALE, formatFameFactor } from './prestige/absolute-v8.ts'
import { v8ExactRewardRate, v8ScaleRewardUnits } from './prestige/exact-bonuses-v8.ts'
import { collectionV3Snapshot } from './prestige/collections-v3.ts'
import { CURRENT_COLLECTION_SLOTS } from './prestige/catalog.ts'
import { transcendentSpent, zeroTranscendentV1, TRANSCENDENT_MAIN_IDS,
  transcendentReserveRatio } from './ascension/transcendent-v1.ts'
import { v8CreditIncome, quoteV8ClickMax, v8UpgradeClickMax, quoteV8EnterpriseMax,
  v8BuyEnterpriseMax, v8BuyTrade, v8SellTrade, v8BuyCollection,
  v8BuyFameUpgrade, v8PayTaxes, v8AccrueTax, v8Click } from './exact-runtime-v8.ts'
import { exportV8Save, prepareV8SaveImport, loadV8CapitalState,
  saveV8CapitalState, V8_STORAGE_KEY } from './exact-persistence-v8.ts'
import { validateExactV8State } from './exact-save-validation.ts'

const AT=1_800_000_000_000
const decimals=(id:string)=>getAsset(id)?.quantityDecimals??null
const assertValid=(s:unknown)=>{const v=validateExactV8State(s,decimals); assert.equal(v.valid,true,v.reason)}
const store=(initial:Record<string,string>={})=>{
  const map=new Map(Object.entries(initial))
  return {map,getItem:(key:string)=>map.get(key)??null,
    setItem:(key:string,value:string)=>{map.set(key,value)}}
}
const earned=(cents=10n**32n)=>v8CreditIncome(createV8CapitalState(AT),'clicks',cents)

test('Pass 8 matrix: fresh V8, old V8 without Transcendent, old V7, and exact 10^100 balance',()=>{
  const newSave=createV8CapitalState(AT)
  const all=[
    {name:'fresh',payload:exportV8Save(newSave,AT),expected:8},
    {name:'pre-transcendent-V8',payload:JSON.stringify({...newSave,
      ascension:{...newSave.ascension,progress:{...newSave.ascension.progress,transcendentV1:undefined}}}),expected:8},
    {name:'historical-V7',payload:createSaveExport(createCapitalState(undefined,AT),AT),expected:7},
    {name:'huge-V8',payload:exportV8Save({...newSave,game:{...newSave.game,
      balance:(10n**100n).toString(),lifetimeEarned:(10n**100n).toString()}},AT),expected:8},
  ] as const
  for(const row of all){
    const imported=prepareV8SaveImport(row.payload,AT)
    assert.equal(imported.ok,true,row.name)
    if(!imported.ok)continue
    assert.equal(imported.sourceVersion,row.expected,row.name)
    assert.equal(imported.state.version,8)
    assert.ok(imported.state.ascension.progress.transcendentV1,row.name)
    assertValid(imported.state)
    const round=prepareV8SaveImport(exportV8Save(imported.state,AT),AT)
    assert.ok(round.ok,row.name)
    if(round.ok)assert.deepEqual(round.state,imported.state,row.name)
  }
})

test('Pass 8 no silent reset, no old-save resurrection, and write failure preserves bytes',()=>{
  const before=JSON.stringify(createV8CapitalState(AT))
  const backup=JSON.stringify(createCapitalState(undefined,AT))
  const damaged=JSON.stringify({version:8,prestige:{fameMicros:'999'}})
  const bad=store({[V8_STORAGE_KEY]:damaged,'capital-idle-save-v7':backup})
  assert.deepEqual(loadV8CapitalState(bad,AT),{ok:false,reason:'invalid-v8'})
  assert.equal(bad.getItem(V8_STORAGE_KEY),damaged)
  assert.equal(bad.getItem('capital-idle-save-v7'),backup)
  const unavailable={getItem:(_:string)=>before,setItem:(_:string,__:string)=>{throw Error('QuotaExceeded')}}
  assert.equal(saveV8CapitalState(unavailable,earned()),false)
  assert.equal(unavailable.getItem(V8_STORAGE_KEY),before)
  const rejecting={getItem:(_:string)=>before,setItem:(_:string,__:string)=>{}}
  assert.equal(saveV8CapitalState(rejecting,earned()),false)
  assert.equal(rejecting.getItem(V8_STORAGE_KEY),before)
  for(const wrong of ['not-json','{"version":99}','{"format":"CAPITAL_IDLE_SAVE","state":{}}'])
    assert.equal(prepareV8SaveImport(wrong,AT).ok,false,wrong)
})

test('Pass 8 real sequence MAX click → enterprise → trade → news → collections → Fame → Prestige → V8 reload',()=>{
  let state=earned(10n**36n)
  const legacy=JSON.stringify(state)
  const clickQuote=quoteV8ClickMax(state)
  assert.ok(clickQuote)
  const maxed=v8UpgradeClickMax(state,state.game.purchasedUpgrades)
  assert.ok(maxed)
  if(maxed)state=maxed
  assert.equal(state.game.purchasedUpgrades,999)
  const enterprise=quoteV8EnterpriseMax(state,'kiosque')
  assert.ok(enterprise)
  // The batch level is constrained by the quote; no enumeration of levels.
  const boughtCompany=v8BuyEnterpriseMax(state,'kiosque',AT,0)
  assert.ok(boughtCompany.ok)
  if(boughtCompany.ok)state=boughtCompany.state
  const trade=v8BuyTrade(state,'nvideo','5')
  assert.ok(trade.ok)
  if(trade.ok)state=trade.state
  assert.equal(v8BuyTrade({...state,game:{...state.game,balance:'-1'}},'nvideo','1').ok,false)
  for(let i=0;i<6;i++)state=v8AdvanceMarketSecond(state,AT+(i+1)*1000)
  assert.ok(state.trading.news.some(x=>x.endsAt>AT+6000&&
    getNewsDirection(x)!=='neutral'),'A green/red News exists without waiting for normal cadence')
  const item=CURRENT_COLLECTION_SLOTS[0]!
  const collected=v8BuyCollection(state,item.id)
  assert.ok(collected)
  if(collected)state=collected
  assert.equal(v8BuyCollection(state,item.id),null,'one acquisition per canonical item')
  const shop=v8BuyFameUpgrade(state,'click',0)
  assert.ok(shop,'Fame should be earned through high XP')
  if(shop)state=shop
  assertValid(state)
  const before=JSON.stringify(state)
  const prestige=v8PerformPrestige(state,AT+6000)
  assert.ok(prestige.ok,prestige.ok?'ok':prestige.reason)
  if(!prestige.ok)return
  assert.equal(prestige.state.prestige.fameMicros,'0')
  assert.equal(prestige.state.prestige.ownedCollectionIds.length,1)
  assert.equal(prestige.state.ascension.progress.prestigeCount,1)
  assert.ok(prestige.earnedPoints>0n)
  assert.equal(JSON.stringify(state),before,'Prestige is an immutable transition')
  assert.equal(JSON.parse(legacy).ascension.progress.prestigeCount,0)
  assertValid(prestige.state)
  const storage=store()
  assert.equal(saveV8CapitalState(storage,prestige.state),true)
  const loaded=loadV8CapitalState(storage,AT+6000)
  assert.ok(loaded.ok)
  if(loaded.ok)assert.deepEqual(loaded.state,prestige.state)
})

test('Pass 8 taxes create debt, cannot provide purchase credit and may make cash negative',()=>{
  const fresh=createV8CapitalState(AT)
  const indebted=v8AccrueTax(fresh,'enterprises',10n**12n)
  assert.ok(BigInt(indebted.fiscal.taxesDueCents)>0n)
  const paid=v8PayTaxes(indebted,AT)
  assert.ok(BigInt(paid.game.balance)<0n)
  assert.equal(paid.fiscal.taxesDueCents,'0')
  assert.equal(quoteV8ClickMax(paid),null)
  assert.equal(quoteV8EnterpriseMax(paid,'kiosque'),null)
  assert.equal(v8BuyTrade(paid,'nvideo','1').ok,false)
  assert.equal(v8BuyCollection(paid,CURRENT_COLLECTION_SLOTS[0]!.id),null)
  assertValid(paid)
})

test('Pass 8 complete 100 collections and 7×1000 Transcendent: PP and cash boundaries do not feed bonuses',()=>{
  const base=earned(10n**40n)
  let state=base
  for(const item of CURRENT_COLLECTION_SLOTS){
    const bought=v8BuyCollection(state,item.id)
    assert.ok(bought,item.id)
    if(bought)state=bought
  }
  const museum=collectionV3Snapshot(state.prestige.ownedCollectionIds)
  assert.equal(museum.owned,100)
  assert.equal(museum.museumComplete,true)
  const section=zeroTranscendentV1()
  const all={version:1 as const,levels:{...section.levels,
    ...Object.fromEntries(TRANSCENDENT_MAIN_IDS.map(id=>[id,1000]))}}
  const advancedSpent=transcendentSpent(all)
  assert.ok(advancedSpent)
  if(advancedSpent===null)return
  const reserve=10n**100n
  const progress={...state.ascension.progress,prestigeCount:101,
    highestFameAwardedLevel:Math.max(100,state.ascension.progress.highestFameAwardedLevel),
    history:[],transcendentV1:all,
    availablePoints:reserve.toString(),lifetimePoints:(reserve+advancedSpent).toString()}
  state={...state,ascension:{...state.ascension,progress}}
  assertValid(state)
  const firstPreview=v8PrestigeRewardPreview(state,v8EligiblePrestigeWorthCents(state),150)
  assert.equal(firstPreview.museumCompleteAtCycle,true)
  assert.equal(firstPreview.bonusBps,22_500)
  assert.equal(firstPreview.earned,firstPreview.base*22_500n/10_000n)
  const price=transcendentReserveRatio(progress)
  assert.equal(price.unlocked,true)
  assert.ok(price.numerator*2n<price.denominator*3n)
  const rate=v8ExactRewardRate(state,'enterprise')
  assert.ok(v8ScaleRewardUnits(10n**100n,rate)>10n**100n)
  const fame=state.prestige.fameMicros
  const output=v8PerformPrestige(state,AT)
  assert.ok(output.ok,output.ok?'ok':output.reason)
  if(!output.ok)return
  assert.equal(output.state.prestige.ownedCollectionIds.length,100)
  assert.equal(output.state.prestige.collectionFameMicros,state.prestige.collectionFameMicros)
  assert.equal(output.state.prestige.fameMicros,'0')
  assert.equal(output.state.prestige.fameForfeitedMicros,
    (BigInt(state.prestige.fameForfeitedMicros)+BigInt(fame)).toString())
  assert.equal(output.state.ascension.progress.prestigeCount,102)
  assert.equal(output.state.ascension.progress.history.at(-1)?.museumCompleteAtCycle,true)
  assert.equal(output.state.ascension.run.startingCapitalGrantedCents,
    output.state.game.balance)
  assertValid(output.state)
})

test('Pass 8 high-number factor presentation rounds across integer boundaries without invalid digits',()=>{
  const scale=FAME_FACTOR_SCALE
  assert.equal(formatFameFactor(2n*scale-1n),'2')
  assert.equal(formatFameFactor(scale-1n),'1')
  assert.equal(formatFameFactor(1_000n*scale),'1\'000')
  assert.equal(formatFameFactor(101n*scale/100n),'1.01')
  const state=earned()
  assert.ok(v8AbsoluteFameStatus(state).factorUnits>=scale)
})

test('Pass 8 micro-benchmarks remain bounded under 100 collections, 10×1000 and 10^100 wallet',()=>{
  const state=earned(10n**23n)
  const all=zeroTranscendentV1()
  const max={...all,levels:{...all.levels,...Object.fromEntries(
    TRANSCENDENT_MAIN_IDS.map(id=>[id,1000])),
    'news-power':1000,'news-intensity':1000,'news-duration':1000}}
  const runtime={...state,prestige:{...state.prestige,ownedCollectionIds:
      CURRENT_COLLECTION_SLOTS.map(item=>item.id)},
    ascension:{...state.ascension,progress:{...state.ascension.progress,
      transcendentV1:max,prestigeCount:101,availablePoints:(10n**100n).toString()}}}
  const measure=(label:string,fn:()=>void,count:number,limitMs:number)=>{
    const t0=performance.now()
    for(let i=0;i<count;i++)fn()
    const ms=performance.now()-t0
    console.log('[PASS8 PERF]',label,count,'iterations',ms.toFixed(1),'ms')
    assert.ok(ms<limitMs,label+' exceeded '+limitMs+'ms ('+ms.toFixed(1)+'ms)')
  }
  const ids=runtime.prestige.ownedCollectionIds
  assert.equal(collectionV3Snapshot(ids),collectionV3Snapshot(ids),'snapshot cached by array identity')
  measure('collection 100 and exact bonus',()=>{
    collectionV3Snapshot(ids)
    v8ExactRewardRate(runtime,'enterprise')
    v8ScaleRewardUnits(10n**100n,v8ExactRewardRate(runtime,'xp'))
  },200,12_000)
  measure('MAX click quote O(log N)',()=>{quoteV8ClickMax(state)},200,12_000)
  measure('MAX enterprise quote',()=>{quoteV8EnterpriseMax(state,'kiosque')},50,12_000)
  measure('V8 click 10^100 PP',()=>{v8Click(runtime)},40,12_000)
  assert.equal(JSON.stringify(runtime).includes('Infinity'),false)
})
