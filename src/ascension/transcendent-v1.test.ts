import test from 'node:test'
import assert from 'node:assert/strict'
import { createV8CapitalState } from '../exact-state-v8.ts'
import { v8CreditIncome } from '../exact-runtime-v8.ts'
import { v8PerformPrestige } from '../exact-prestige-v8.ts'
import { v8MarketNewsEffects } from '../exact-market-v8.ts'
import { createEvent, getNewsEnvelope, getNewsPressure } from '../trading/news.ts'
import { createRandom } from '../trading/market.ts'
import { getAsset } from '../trading/catalog.ts'
import { validateExactV8State } from '../exact-save-validation.ts'
import { exportV8Save, prepareV8SaveImport, saveV8CapitalState, loadV8CapitalState, V8_STORAGE_KEY, V8_TRANSCENDENT_BACKUP_KEY } from '../exact-persistence-v8.ts'
import { buyNewsPower } from '../news-powers.ts'
import {
  TRANSCENDENT_IDS, TRANSCENDENT_NEWS_IDS, TRANSCENDENT_MAX_LEVEL,
  zeroTranscendentV1, transcendentNextCost, transcendentSpentThrough,
  transcendentSpent, v8BuyTranscendentNews, migrateTranscendentV1,
} from './transcendent-v1.ts'
const NOW=1_800_000_000_000
const decimals=(id:string)=>getAsset(id)?.quantityDecimals??null
function seeded(cycles=3) {
  let state=createV8CapitalState(NOW)
  for(let n=0;n<cycles;n++){
    state=v8CreditIncome(state,'clicks',10n**40n)
    const next=v8PerformPrestige(state,NOW)
    assert.ok(next.ok)
    state=next.state
  }
  return state
}
function store() {
  const entries=new Map<string,string>()
  const storage={
    getItem:(key:string)=>entries.get(key)??null,
    setItem:(key:string,value:string)=>{entries.set(key,value)},
  }
  return {entries,storage}
}
test('Transcendent schema: 10 canonical IDs, six core and 3 News branches enabled; quadratic costs exact',()=>{
  assert.equal(TRANSCENDENT_IDS.length,10)
  assert.equal(new Set(TRANSCENDENT_IDS).size,10)
  assert.equal(TRANSCENDENT_NEWS_IDS.length,3)
  assert.equal(TRANSCENDENT_MAX_LEVEL,1000)
  const zero=zeroTranscendentV1()
  assert.equal(zero.version,1)
  assert.equal(Object.keys(zero.levels).length,10)
  assert.equal(transcendentSpent(zero),0n)
  assert.equal(transcendentNextCost(0),1000n)
  assert.equal(transcendentNextCost(9),4060n)
  assert.equal(transcendentNextCost(99),123760n)
  assert.equal(transcendentNextCost(499),2615760n)
  assert.equal(transcendentNextCost(999),10230760n)
  assert.equal(transcendentNextCost(1000),null)
  assert.equal(transcendentNextCost(-1),null)
  assert.equal(transcendentSpentThrough(1000),3454210000n)
  assert.equal(transcendentSpentThrough(1000)!*10n,34542100000n)
  let sum=0n
  for(let n=0;n<1000;n++){
    sum+=transcendentNextCost(n)!
    assert.equal(sum,transcendentSpentThrough(n+1))
  }
  assert.equal(sum,3454210000n)
  assert.equal(transcendentSpent({...zero,version:2}),null)
  assert.equal(transcendentSpent({...zero,levels:{...zero.levels,empire:1}}),1000n)
  assert.equal(transcendentSpent({...zero,levels:{...zero.levels,'starting-capital':1}}),1000n)
  assert.equal(transcendentSpent({...zero,levels:{...zero.levels,'news-power':1001}}),null)
  assert.equal(transcendentSpent({...zero,levels:{...zero.levels,'news-power':-1}}),null)
  assert.equal(transcendentSpent({...zero,levels:{...zero.levels,'news-power':1.2}}),null)
  assert.equal(transcendentSpent({...zero,levels:{...zero.levels,unknown:0}}),null)
})
test('Advanced News purchases are atomic, rank-checked, preserve classic purchases and reject forged PP',()=>{
  let state=seeded()
  assert.equal(state.ascension.progress.prestigeCount,3)
  assert.equal(state.ascension.progress.shopVersion,2)
  assert.equal(transcendentSpent(state.ascension.progress.transcendentV1),0n)
  assert.equal(v8BuyTranscendentNews(state,'news-power',1),null)
  assert.equal(v8BuyTranscendentNews(state,'empire' as 'news-power',0),null)
  assert.equal(v8BuyTranscendentNews(state,'news-power',1000),null)
  const before=BigInt(state.ascension.progress.availablePoints)
  const previous=state
  state=v8BuyTranscendentNews(state,'news-power',0)!
  assert.ok(state)
  assert.equal(state.ascension.progress.transcendentV1?.levels['news-power'],1)
  assert.equal(BigInt(state.ascension.progress.availablePoints),before-1000n)
  assert.equal(state.ascension.progress.lifetimePoints,previous.ascension.progress.lifetimePoints)
  assert.equal(state.game,previous.game)
  assert.equal(v8BuyTranscendentNews(state,'news-power',0),null)
  assert.equal(validateExactV8State(state,decimals).valid,true)
  state=v8BuyTranscendentNews(state,'news-duration',0)!
  state=v8BuyTranscendentNews(state,'news-intensity',0)!
  assert.equal(validateExactV8State(state,decimals).valid,true)
  const exportText=exportV8Save(state,NOW)
  const imported=prepareV8SaveImport(exportText,NOW)
  assert.ok(imported.ok)
  assert.deepEqual(imported.state,state)
  const forged=JSON.parse(exportText)
  forged.state.ascension.progress.availablePoints=
    (BigInt(forged.state.ascension.progress.availablePoints)+1n).toString()
  assert.equal(prepareV8SaveImport(JSON.stringify(forged),NOW).ok,false)
  const forgedLevel=JSON.parse(exportText)
  forgedLevel.state.ascension.progress.transcendentV1.levels['news-power']=2
  assert.equal(prepareV8SaveImport(JSON.stringify(forgedLevel),NOW).ok,false)
  const futureLevel=JSON.parse(exportText)
  futureLevel.state.ascension.progress.transcendentV1.levels.heritage=1
  assert.equal(prepareV8SaveImport(JSON.stringify(futureLevel),NOW).ok,false)
  const checkpoint=v8PerformPrestige(v8CreditIncome(state,'clicks',10n**40n),NOW)
  assert.ok(checkpoint.ok)
  assert.equal(checkpoint.state.ascension.progress.transcendentV1?.levels['news-power'],1)
  assert.equal(validateExactV8State(checkpoint.state,decimals).valid,true)
})
test('Earlier Prestige cycles, insufficient PP and illegal future branches cannot buy',()=>{
  for(const cycle of [0,1,2]){
    const state=seeded(cycle)
    assert.equal(v8BuyTranscendentNews(state,'news-power',0),null)
  }
  const ready=seeded(3)
  const small={...ready,ascension:{...ready.ascension,progress:{
    ...ready.ascension.progress,availablePoints:'0'}}}
  assert.equal(v8BuyTranscendentNews(small,'news-power',0),null)
})
test('Legacy V8 loads, migrates once with backup, exports, imports idempotently without PP changes',()=>{
  const state=seeded(3)
  const old=JSON.parse(JSON.stringify(state))
  delete old.ascension.progress.transcendentV1
  // A genuinely pre-Transcendent V8 snapshot also predates the grant receipts.
  delete old.ascension.run.startingCapitalGrantedCents
  for (const receipt of old.ascension.progress.history) {
    delete receipt.startingCapitalLevelAtCycle
    delete receipt.startingCapitalGrantedCents
  }
  const original=JSON.stringify(old)
  const {entries,storage}=store()
  entries.set(V8_STORAGE_KEY,original)
  const loaded=loadV8CapitalState(storage,NOW)
  assert.ok(loaded.ok)
  assert.equal(loaded.origin,'migrated')
  assert.equal(loaded.state.ascension.progress.availablePoints,state.ascension.progress.availablePoints)
  assert.equal(loaded.state.ascension.progress.lifetimePoints,state.ascension.progress.lifetimePoints)
  assert.deepEqual(loaded.state.ascension.progress.transcendentV1,zeroTranscendentV1())
  assert.equal(entries.get(V8_TRANSCENDENT_BACKUP_KEY),original)
  const once=entries.get(V8_STORAGE_KEY)
  const again=loadV8CapitalState(storage,NOW)
  assert.ok(again.ok)
  assert.equal(again.origin,'v8')
  assert.equal(entries.get(V8_STORAGE_KEY),once)
  assert.equal(entries.get(V8_TRANSCENDENT_BACKUP_KEY),original)
  assert.strictEqual(migrateTranscendentV1(loaded.state),loaded.state)
  assert.equal(saveV8CapitalState(storage,loaded.state),true)
  const imported=prepareV8SaveImport(exportV8Save(old,NOW),NOW)
  assert.ok(imported.ok)
  assert.deepEqual(imported.state,loaded.state)
  const corrupt={...old,ascension:{...old.ascension,progress:{
    ...old.ascension.progress,transcendentV1:{version:1,levels:{'news-power':0}}
  }}}
  assert.equal(prepareV8SaveImport(JSON.stringify(corrupt),NOW).ok,false)
  entries.set(V8_STORAGE_KEY,JSON.stringify(corrupt))
  const failed=loadV8CapitalState(storage,NOW)
  assert.equal(failed.ok,false)
  assert.deepEqual(entries.get(V8_STORAGE_KEY),JSON.stringify(corrupt))
})
test('V8 engine: advanced force, intensity and duration affect positive and negative pressure symmetrically',()=>{
  let state=seeded(3)
  const levels=zeroTranscendentV1().levels
  const advanced={...state,ascension:{...state.ascension,progress:{
    ...state.ascension.progress,upgradeLevels:{
      ...state.ascension.progress.upgradeLevels,'news-duration':4,'news-impact':4,'market-frenzy':1,
    },transcendentV1:{version:1 as const,levels:{
      ...levels,'news-power':1000,'news-intensity':1000,'news-duration':1000,
    }},
    }},}
  const effective=v8MarketNewsEffects(advanced,NOW)
  assert.equal(effective.durationMultiplier,3)
  assert.equal(effective.impactMultiplier,4)
  assert.ok(Math.abs(effective.rampFraction-0.05)<1e-10)
  const frenzy={...advanced,ascension:{...advanced.ascension,run:{
    ...advanced.ascension.run,frenzyEndsAtRealMs:NOW+30_000,
  }}}
  assert.equal(v8MarketNewsEffects(frenzy,NOW).impactMultiplier,6)
  const event={id:'positive',templateId:'earnings-beat',impact:0.8,
    startedAt:NOW,endsAt:NOW+300_000,affectedAssetIds:['nvideo'],phase:'active' as const}
  const bad={...event,id:'negative',templateId:'earnings-miss',impact:-0.8}
  const before=getNewsEnvelope(event,NOW+15_000,0.2)
  const faster=getNewsEnvelope(event,NOW+15_000,effective.rampFraction)
  assert.ok(faster>before)
  assert.ok(Math.abs(faster-1)<1e-12,'the peak is reached at 5% of news lifetime')
  const baseUp=getNewsPressure([event],NOW+15_000,1,0.2)
  const ampUp=getNewsPressure([event],NOW+15_000,6,effective.rampFraction)
  const baseDown=getNewsPressure([bad],NOW+15_000,1,0.2)
  const ampDown=getNewsPressure([bad],NOW+15_000,6,effective.rampFraction)
  assert.ok(ampUp.price.nvideo!>baseUp.price.nvideo!)
  assert.ok(ampDown.price.nvideo!<baseDown.price.nvideo!)
  assert.ok(ampUp.dividend.nvideo!>baseUp.dividend.nvideo!)
  assert.ok(ampDown.dividend.nvideo!<baseDown.dividend.nvideo!)
  const rng=createRandom(42)
  const generated=createEvent(NOW,()=>rng.next(),[],{durationMultiplier:3})
  assert.ok(generated.endsAt-generated.startedAt>=900_000)
  assert.ok(generated.endsAt-generated.startedAt<=5_400_000)
  assert.ok(Number.isSafeInteger(generated.endsAt))
  assert.ok(v8MarketNewsEffects(state,NOW).impactMultiplier===1)
})
test('Manual news generate/end powers are both available exactly from Prestige 3',()=>{
  const low=seeded(2)
  const lowCash=v8CreditIncome(low,'clicks',10n**40n)
  assert.equal(buyNewsPower(lowCash,null,0,NOW),null)
  const ready=v8CreditIncome(seeded(3),'clicks',10n**40n)
  const created=buyNewsPower(ready,null,0,NOW)
  assert.ok(created)
  const id=created.trading.news.find(x=>x.id.startsWith('power-'))?.id
  assert.ok(id)
  const ended=buyNewsPower(created,id,1,NOW)
  assert.ok(ended)
  assert.equal(ended.newsPowers?.count,2)
  assert.equal(ended.trading.news.find(x=>x.id===id)?.manuallyEnded,true)
  assert.equal(validateExactV8State(ended,decimals).valid,true)
})
