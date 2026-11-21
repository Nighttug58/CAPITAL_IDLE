import assert from 'node:assert/strict'
import test from 'node:test'
import {createV8CapitalState, type V8CapitalState} from '../exact-state-v8.ts'
import {v8CreditIncome} from '../exact-runtime-v8.ts'
import {v8PerformPrestige,v8EligiblePrestigeWorthCents} from '../exact-prestige-v8.ts'
import {getAsset} from '../trading/catalog.ts'
import {validateExactV8State} from '../exact-save-validation.ts'
import {
  loadV8CapitalState,exportV8Save,prepareV8SaveImport,V8_STORAGE_KEY,
  V8_TRANSCENDENT_V2_BACKUP_KEY,
} from '../exact-persistence-v8.ts'
import {
  TRANSCENDENT_IDS,zeroTranscendentV1,migrateTranscendentV1,transcendentSpent,
  transcendentSpentThrough,transcendentLegacySpentThrough,transcendentEconomicBps,
  transcendentHeritageBps,transcendentNewsModifiers,transcendentUltimateUnlocked,
  type TranscendentId,
} from './transcendent-v1.ts'
import {startingCapitalCents,startingCapitalCentsLegacy} from './starting-capital-v1.ts'
const AT=1_800_000_000_000
const decimals=(id:string)=>getAsset(id)?.quantityDecimals??null
const valid=(state:V8CapitalState)=>validateExactV8State(state,decimals)

function completedCycles(times=3):V8CapitalState {
  let state=createV8CapitalState(AT)
  for(let i=0;i<times;i++){
    const done=v8PerformPrestige(v8CreditIncome(state,'clicks',10n**40n),AT)
    assert.ok(done.ok)
    if(!done.ok)throw Error(done.reason)
    state=done.state
  }
  return state
}
function legacyState():V8CapitalState {
  const base=completedCycles()
  const levels={...zeroTranscendentV1().levels,empire:735,heritage:37,
    'starting-capital':251,'news-power':1000,xp:1}
  const old={version:1 as const,levels}
  const spent=transcendentSpent(old)!
  assert.ok(BigInt(base.ascension.progress.availablePoints)>=spent)
  const legacy:V8CapitalState={...base,ascension:{...base.ascension,progress:{
    ...base.ascension.progress,availablePoints:
      (BigInt(base.ascension.progress.availablePoints)-spent).toString(),
    transcendentV1:old,
    history:base.ascension.progress.history.map(item=>({
      ...item,formulaVersion:4 as const,
    })),
  }}}
  assert.equal(valid(legacy).valid,true,valid(legacy).reason)
  return legacy
}
function storage(initial:string) {
  const data=new Map<string,string>([[V8_STORAGE_KEY,initial]])
  return {data,getItem:(key:string)=>data.get(key)??null,
    setItem:(key:string,value:string)=>{data.set(key,value)}}
}
test('new 100-rank shop costs only 8,693 PP per branch (86,930 total)',()=>{
  assert.equal(zeroTranscendentV1().version,2)
  assert.equal(transcendentSpentThrough(1),5n)
  assert.equal(transcendentSpentThrough(100),8_693n)
  assert.equal(transcendentSpentThrough(101),null)
  assert.equal(transcendentSpentThrough(100)!*BigInt(TRANSCENDENT_IDS.length),86_930n)
  assert.equal(transcendentLegacySpentThrough(1000),3_454_210_000n)
  assert.equal(startingCapitalCents(100),startingCapitalCentsLegacy(1000))
  assert.equal(startingCapitalCents(1),startingCapitalCentsLegacy(10))
  assert.equal(startingCapitalCents(101),null)
})
test('V1 to V2 migrates 1,000 ranks to 100, refunds exactly once and preserves legacy receipts',()=>{
  const before=legacyState()
  const oldShop=before.ascension.progress.transcendentV1!
  assert.equal(oldShop.version,1)
  const after=migrateTranscendentV1(before)
  const next=after.ascension.progress.transcendentV1!
  assert.equal(next.version,2)
  assert.equal(next.levels.empire,74)
  assert.equal(next.levels.heritage,4)
  assert.equal(next.levels['starting-capital'],26)
  assert.equal(next.levels['news-power'],100)
  assert.equal(next.levels.xp,1)
  const refund=transcendentSpent(oldShop)!-transcendentSpent(next)!
  assert.ok(refund>0n)
  assert.equal(BigInt(after.ascension.progress.availablePoints),
    BigInt(before.ascension.progress.availablePoints)+refund)
  assert.equal(after.ascension.progress.lifetimePoints,before.ascension.progress.lifetimePoints)
  assert.deepEqual(after.ascension.progress.history,before.ascension.progress.history)
  assert.equal(after.game,before.game)
  assert.equal(valid(after).valid,true,valid(after).reason)
  assert.strictEqual(migrateTranscendentV1(after),after,'idempotent migration, no second refund')
  const imported=prepareV8SaveImport(exportV8Save(before,AT),AT)
  assert.ok(imported.ok)
  if(imported.ok)assert.deepEqual(imported.state,after)
  const db=storage(JSON.stringify(before))
  const loaded=loadV8CapitalState(db,AT)
  assert.ok(loaded.ok)
  if(!loaded.ok)return
  assert.equal(loaded.origin,'migrated')
  assert.deepEqual(loaded.state,after)
  assert.equal(db.data.get(V8_TRANSCENDENT_V2_BACKUP_KEY),JSON.stringify(before))
  const second=loadV8CapitalState(db,AT)
  assert.ok(second.ok)
  if(second.ok)assert.equal(second.origin,'v8')
  assert.equal(db.data.get(V8_TRANSCENDENT_V2_BACKUP_KEY),JSON.stringify(before))
  assert.equal(db.data.get(V8_STORAGE_KEY),JSON.stringify(after))
  const tampered=JSON.parse(JSON.stringify(before))
  tampered.ascension.progress.availablePoints=(BigInt(tampered.ascension.progress.availablePoints)+1n).toString()
  assert.equal(prepareV8SaveImport(JSON.stringify(tampered),AT).ok,false)
})
test('historical V4 starting-capital and Heritage receipts survive migration intact',()=>{
  const legacy=legacyState()
  const income=v8CreditIncome(legacy,'clicks',10n**40n)
  const completed=v8PerformPrestige(income,AT)
  assert.ok(completed.ok)
  if(!completed.ok)return
  const before=completed.state
  const record=before.ascension.progress.history.at(-1)!
  assert.equal(record.formulaVersion,4)
  assert.equal(record.heritageLevelAtCycle,37)
  assert.equal(record.startingCapitalLevelAtCycle,251)
  assert.equal(record.startingCapitalGrantedCents,startingCapitalCentsLegacy(251)!.toString())
  assert.equal(v8EligiblePrestigeWorthCents(before),0n)
  const migrated=migrateTranscendentV1(before)
  assert.equal(migrated.ascension.run.startingCapitalGrantedCents,
    before.ascension.run.startingCapitalGrantedCents)
  assert.deepEqual(migrated.ascension.progress.history,before.ascension.progress.history)
  assert.equal(valid(migrated).valid,true,valid(migrated).reason)
  const next=v8PerformPrestige(v8CreditIncome(migrated,'clicks',10n**40n),AT)
  assert.ok(next.ok)
  if(!next.ok)return
  assert.equal(next.state.ascension.progress.history.at(-1)?.formulaVersion,5)
  assert.equal(next.state.ascension.progress.history.at(-1)?.startingCapitalLevelAtCycle,26)
  assert.equal(valid(next.state).valid,true,valid(next.state).reason)
  const normalized=prepareV8SaveImport(exportV8Save(next.state,AT),AT)
  assert.ok(normalized.ok)
})
test('at rank 100 all old maximum effects are identical, not amplified',()=>{
  const base=completedCycles()
  const v2={version:2 as const,levels:Object.fromEntries(TRANSCENDENT_IDS.map(id=>[id,100])) as Record<TranscendentId,number>}
  const v1={version:1 as const,levels:Object.fromEntries(TRANSCENDENT_IDS.map(id=>[id,1000])) as Record<TranscendentId,number>}
  const p2={...base.ascension.progress,transcendentV1:v2}
  const p1={...base.ascension.progress,transcendentV1:v1}
  for(const id of ['empire','trading','rentier','xp','fame'] as const)
    assert.equal(transcendentEconomicBps(p2,id),transcendentEconomicBps(p1,id))
  assert.equal(transcendentHeritageBps(p2),transcendentHeritageBps(p1))
  assert.equal(startingCapitalCents(100),startingCapitalCentsLegacy(1000))
  assert.deepEqual(transcendentNewsModifiers(p2),transcendentNewsModifiers(p1))
  assert.equal(transcendentUltimateUnlocked(p2),true)
  assert.equal(transcendentUltimateUnlocked(p1),true)
})
