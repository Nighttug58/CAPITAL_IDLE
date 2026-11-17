import test from 'node:test'
import assert from 'node:assert/strict'
import {createV8CapitalState} from '../exact-state-v8.ts'
import {getExactLevelStartThreshold} from '../exact-levels.ts'
import {v8CreditIncome,v8BuyEnterpriseMax,v8BuyTrade,v8AccrueTax} from '../exact-runtime-v8.ts'
import {v8PerformPrestige,v8EligiblePrestigeWorthCents} from '../exact-prestige-v8.ts'
import {getAsset} from '../trading/catalog.ts'
import {validateExactV8State} from '../exact-save-validation.ts'
import {exportV8Save,prepareV8SaveImport,loadV8CapitalState,saveV8CapitalState,V8_STORAGE_KEY} from '../exact-persistence-v8.ts'
import {startingCapitalCents,STARTING_CAPITAL_TIERS} from './starting-capital-v1.ts'
import {v8BuyTranscendent,transcendentSpentThrough,pendingStartingCapitalCents} from './transcendent-v1.ts'
const AT=1_800_000_000_000
const decimals=(id:string)=>getAsset(id)?.quantityDecimals??null
function cycle(times=3){
  let state=createV8CapitalState(AT)
  for(let i=0;i<times;i++){
    state=v8CreditIncome(state,'clicks',10n**40n)
    const result=v8PerformPrestige(state,AT)
    assert.equal(result.ok,true)
    if(!result.ok)throw Error(result.reason)
    state=result.state
  }
  return state
}
function rankState(state:ReturnType<typeof createV8CapitalState>,level:number){
  const p=state.ascension.progress,section=p.transcendentV1!
  const cost=transcendentSpentThrough(level)!-transcendentSpentThrough(section.levels['starting-capital'])!
  assert.ok(BigInt(p.availablePoints)>=cost)
  return {...state,ascension:{...state.ascension,progress:{...p,
    transcendentV1:{version:1 as const,levels:{...section.levels,'starting-capital':level}},
    availablePoints:(BigInt(p.availablePoints)-cost).toString()}}}
}
function valid(s:unknown){
  const result=validateExactV8State(s,decimals)
  assert.equal(result.valid,true,result.reason)
}
function store(){
  const db=new Map<string,string>()
  return {db,storage:{getItem:(k:string)=>db.get(k)??null,setItem:(k:string,v:string)=>{db.set(k,v)}}}
}
test('Exact starting capital interpolation has correct 0..1000 tiers and no float drift',()=>{
  assert.equal(STARTING_CAPITAL_TIERS.length,8)
  for(const t of STARTING_CAPITAL_TIERS)assert.equal(startingCapitalCents(t.level),t.dollars*100n)
  for(const bad of [-1,1001,NaN,Infinity,0.1,Number.MAX_SAFE_INTEGER])
    assert.equal(startingCapitalCents(bad),null)
  let previous=-1n
  for(let n=0;n<=1000;n++){
    const v=startingCapitalCents(n)!
    assert.ok(v>previous,'non-increasing tier at level '+n)
    previous=v
  }
  const a=STARTING_CAPITAL_TIERS[2]!,b=STARTING_CAPITAL_TIERS[3]!,n=31
  assert.equal(startingCapitalCents(n),a.dollars*100n+
    (b.dollars-a.dollars)*100n*BigInt(n-a.level)/BigInt(b.level-a.level))
  assert.equal(startingCapitalCents(1000),100_000_000_000_000_000n)
})
test('Purchase consumes exactly 1000 PP but mints no cash before Prestige',()=>{
  const old=cycle()
  assert.equal(pendingStartingCapitalCents(old.ascension.progress),0n)
  const bought=v8BuyTranscendent(old,'starting-capital',0)!
  assert.ok(bought)
  assert.equal(bought.game.balance,old.game.balance)
  assert.equal(bought.game.lifetimeEarned,old.game.lifetimeEarned)
  assert.equal(bought.prestige.experienceCents,old.prestige.experienceCents)
  assert.equal(bought.prestige.fameMicros,old.prestige.fameMicros)
  assert.equal(BigInt(bought.ascension.progress.availablePoints),
    BigInt(old.ascension.progress.availablePoints)-1000n)
  assert.equal(v8BuyTranscendent(bought,'starting-capital',0),null)
  assert.equal(pendingStartingCapitalCents(bought.ascension.progress),1_000_000n)
  valid(bought)
  const p=v8PerformPrestige(v8CreditIncome(bought,'clicks',10n**40n),AT)
  assert.ok(p.ok)
  if(!p.ok)return
  const next=p.state
  assert.equal(next.game.balance,'1000000')
  assert.equal(next.game.lifetimeEarned,'0')
  assert.equal(next.prestige.experienceCents,'0')
  assert.equal(next.prestige.fameMicros,'0')
  assert.equal(next.stats.earnedBySource.clicks,'0')
  assert.equal(next.fiscal.taxesDueCents,'0')
  assert.equal(next.achievements.cycleGiftCents,'0')
  assert.equal(next.ascension.run.startingCapitalGrantedCents,'1000000')
  assert.equal(next.ascension.progress.history.at(-1)?.startingCapitalGrantedCents,'1000000')
  assert.equal(next.ascension.progress.history.at(-1)?.startingCapitalLevelAtCycle,1)
  assert.equal(next.ascension.progress.transcendentV1?.levels['starting-capital'],1)
  assert.equal(v8EligiblePrestigeWorthCents(next),0n)
  const again=v8PerformPrestige(next,AT)
  assert.equal(again.ok,false)
  if(!again.ok)assert.equal(again.reason,'insufficient-level')
  valid(next)
})
test('Portfolio or enterprise purchase from grant cannot generate free PP',()=>{
  const ranked=rankState(cycle(),100)
  valid(ranked)
  const res=v8PerformPrestige(v8CreditIncome(ranked,'clicks',10n**40n),AT)
  assert.ok(res.ok)
  if(!res.ok)return
  const state=res.state,grant=startingCapitalCents(100)!
  assert.equal(BigInt(state.game.balance),grant)
  assert.equal(v8EligiblePrestigeWorthCents(state),0n)
  // Kiosque requires player level 3. Earn only the XP needed to unlock it;
  // that genuine earning is eligible, but the invested grant is still excluded.
  const xpIncome=getExactLevelStartThreshold(3)*100n
  const unlocked=v8CreditIncome(state,'clicks',xpIncome)
  const business=v8BuyEnterpriseMax(unlocked,'kiosque',AT,0)
  assert.ok(business.ok)
  if(business.ok){
    assert.equal(v8EligiblePrestigeWorthCents(business.state),xpIncome)
    valid(business.state)
  }
  const trade=v8BuyTrade(state,'nvideo','1')
  assert.ok(trade.ok)
  if(trade.ok){
    assert.ok(v8EligiblePrestigeWorthCents(trade.state)<=0n)
    valid(trade.state)
  }
  const earned=v8CreditIncome(state,'clicks',100_000n)
  assert.equal(v8EligiblePrestigeWorthCents(earned),100_000n)
  assert.equal(earned.game.lifetimeEarned,'100000')
  valid(earned)
})
test('Prestige conditions and taxes do not count grant as income or PP base',()=>{
  const source=rankState(cycle(),250)
  const p=v8PerformPrestige(v8CreditIncome(source,'clicks',10n**40n),AT)
  assert.ok(p.ok)
  if(!p.ok)return
  const state=p.state,grant=startingCapitalCents(250)!
  assert.equal(BigInt(state.game.balance),grant)
  assert.equal(state.fiscal.taxesDueCents,'0')
  const low=v8CreditIncome(state,'clicks',getExactLevelStartThreshold(149)*100n)
  const rejected=v8PerformPrestige(low,AT)
  assert.equal(rejected.ok,false)
  if(!rejected.ok)assert.equal(rejected.reason,'insufficient-level')
  const organic=v8CreditIncome(state,'clicks',10n**40n)
  assert.equal(v8EligiblePrestigeWorthCents(organic),10n**40n)
  const taxed=v8AccrueTax(organic,'enterprises',10_000n)
  const next=v8PerformPrestige(taxed,AT)
  assert.ok(next.ok)
  if(!next.ok)return
  assert.equal(next.state.fiscal.taxesDueCents,'0')
  assert.equal(next.state.fiscal.periodStartedAt,AT)
  assert.equal(next.state.game.balance,grant.toString())
  assert.equal(next.state.ascension.run.startingCapitalGrantedCents,grant.toString())
  assert.equal(next.state.game.lifetimeEarned,'0')
  valid(next.state)
})
test('1000th level pays exactly 1e15 dollars, and level 1001 is forbidden',()=>{
  const s=rankState(cycle(),999)
  valid(s)
  const max=v8BuyTranscendent(s,'starting-capital',999)!
  assert.ok(max)
  assert.equal(v8BuyTranscendent(max,'starting-capital',1000),null)
  assert.equal(pendingStartingCapitalCents(max.ascension.progress),10n**17n)
  valid(max)
  const result=v8PerformPrestige(v8CreditIncome(max,'clicks',10n**40n),AT)
  assert.ok(result.ok)
  if(!result.ok)return
  assert.equal(result.state.game.balance,(10n**17n).toString())
  assert.equal(v8EligiblePrestigeWorthCents(result.state),0n)
  valid(result.state)
})
test('Pre-pass-5 V8 stays valid and idempotent, new receipts prevent forged grants',()=>{
  const old=JSON.parse(JSON.stringify(cycle()))
  delete old.ascension.run.startingCapitalGrantedCents
  for(const row of old.ascension.progress.history){
    delete row.startingCapitalGrantedCents
    delete row.startingCapitalLevelAtCycle
  }
  valid(old)
  const {db,storage}=store()
  db.set(V8_STORAGE_KEY,JSON.stringify(old))
  const loaded=loadV8CapitalState(storage,AT)
  assert.ok(loaded.ok)
  if(!loaded.ok)return
  assert.deepEqual(loaded.state,old)
  assert.equal(loaded.origin,'v8')
  assert.equal(db.get(V8_STORAGE_KEY),JSON.stringify(old))
  assert.equal(loadV8CapitalState(storage,AT).ok,true)
  const oldImport=prepareV8SaveImport(exportV8Save(old,AT),AT)
  assert.ok(oldImport.ok)
  if(oldImport.ok)assert.deepEqual(oldImport.state,old)
  const first=v8BuyTranscendent(cycle(),'starting-capital',0)!
  const p=v8PerformPrestige(v8CreditIncome(first,'clicks',10n**40n),AT)
  assert.ok(p.ok)
  if(!p.ok)return
  const state=p.state
  const exported=exportV8Save(state,AT)
  const imported=prepareV8SaveImport(exported,AT)
  assert.ok(imported.ok)
  if(imported.ok)assert.deepEqual(imported.state,state)
  assert.equal(saveV8CapitalState(storage,state),true)
  const reload=loadV8CapitalState(storage,AT)
  assert.ok(reload.ok)
  if(reload.ok)assert.deepEqual(reload.state,state)
  function reject(mutate:(s:any)=>void){
    const d=JSON.parse(exported)
    mutate(d.state)
    assert.equal(prepareV8SaveImport(JSON.stringify(d),AT).ok,false)
    assert.equal(saveV8CapitalState(storage,d.state),false)
    assert.equal(db.get(V8_STORAGE_KEY),JSON.stringify(state))
  }
  reject(s=>s.ascension.run.startingCapitalGrantedCents='1000001')
  reject(s=>s.ascension.run.startingCapitalGrantedCents='01')
  reject(s=>s.ascension.run.startingCapitalGrantedCents='-1')
  reject(s=>delete s.ascension.run.startingCapitalGrantedCents)
  reject(s=>s.ascension.progress.history.at(-1).startingCapitalGrantedCents='1000001')
  reject(s=>s.ascension.progress.history.at(-1).startingCapitalLevelAtCycle=2)
  reject(s=>delete s.ascension.progress.history.at(-1).startingCapitalLevelAtCycle)
  reject(s=>s.ascension.progress.history.at(-1).startingCapitalLevelAtCycle=1001)
  reject(s=>s.ascension.progress.transcendentV1.levels['starting-capital']=0)
  reject(s=>s.game.balance=(BigInt(s.game.balance)+1n).toString())
  const corrupt=JSON.parse(JSON.stringify(old))
  corrupt.ascension.run.startingCapitalGrantedCents='1000000'
  assert.equal(prepareV8SaveImport(JSON.stringify(corrupt),AT).ok,false)
})
