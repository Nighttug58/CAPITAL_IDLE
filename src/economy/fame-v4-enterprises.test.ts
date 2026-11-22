import test from 'node:test'
import assert from 'node:assert/strict'
import { createV8CapitalState,getExactAmount as v,type V8CapitalState } from '../exact-state-v8.ts'
import { v8CreditIncome,v8BuyEnterprise,v8BuyEnterpriseMax,
  v8AccrueEnterpriseUntil,v8AdvanceFiscalEconomy,quoteV8EnterpriseMax } from '../exact-runtime-v8.ts'
import { v8PerformPrestige,v8EligiblePrestigeWorthCents } from '../exact-prestige-v8.ts'
import { v8BuyFameV4UpgradeMax } from '../prestige/fame-v4-ledger.ts'
import { getEnterpriseUpgradeCostCentsExact } from './catalog.ts'
import { FISCAL_PERIOD_MS } from './state.ts'
import { getAsset } from '../trading/catalog.ts'
import { validateExactV8State } from '../exact-save-validation.ts'
import { exportV8Save,prepareV8SaveImport,loadV8CapitalState,saveV8CapitalState } from '../exact-persistence-v8.ts'
import { v4ChooseSynergy,v4ChooseEnterprise,v4StartContract,v4StartProject,
  v4UpgradeCost,v4UpgradeBatchCost,enterpriseV4BonusBps,enterpriseV4,
  V4_PROJECT_COSTS_CENTS,v4ContractEarlyExitWorth } from './fame-v4-enterprises.ts'
const NOW=1_800_000_000_000
const big=10n**32n
const valid=(state:V8CapitalState)=>validateExactV8State(state,id=>getAsset(id)?.quantityDecimals??null)
function setup(...powers:number[]):V8CapitalState{
 const start=createV8CapitalState(NOW),p=start.prestige,added=200_000n*1_000_000n
 let state:V8CapitalState={...start,
  game:{...start.game,balance:big.toString(),lifetimeEarned:big.toString()},
  enterprises:{...start.enterprises,owned:{
   kiosque:{level:20,investedCents:'20000000'},cafe:{level:20,investedCents:'30000000'},
   usine:{level:1000,investedCents:'500000000000'}}},
  prestige:{...p,fameMicros:(v(p.fameMicros)+added).toString(),
   lifetimeFameMicros:(v(p.lifetimeFameMicros)+added).toString(),
   levelFameMicros:(v(p.levelFameMicros)+added).toString(),
   cycleEarnedFameMicros:(v(p.cycleEarnedFameMicros)+added).toString(),
   cycleLevelFameMicros:(v(p.cycleLevelFameMicros)+added).toString()},
 }
 for(const num of powers){
  const id='fame-v4-'+String(num).padStart(2,'0')
  const next=v8BuyFameV4UpgradeMax(state,id,0)
  assert.ok(next,'Cannot fund Fame '+id)
  state=next
 }
 assert.ok(valid(state).valid,valid(state).reason)
 return state
}
test('08, 12, 13: unique synergy and +1/+3% bonuses additive, 30min cooldown exact',()=>{
 let s=setup(8,12,13)
 s=v4ChooseSynergy(s,'kiosque','cafe',NOW)!
 assert.ok(s)
 assert.equal(v4ChooseSynergy(s,'kiosque','kiosque',NOW),null)
 assert.equal(enterpriseV4BonusBps(s,'kiosque',NOW),1000)
 assert.equal(enterpriseV4BonusBps(s,'cafe',NOW),1000)
 s=v4ChooseEnterprise(s,'franchise','kiosque',NOW)!
 s=v4ChooseEnterprise(s,'board','kiosque',NOW)!
 assert.equal(enterpriseV4BonusBps(s,'kiosque',NOW),3500)
 assert.equal(v4ChooseEnterprise(s,'franchise','cafe',NOW),null)
 s=v8AccrueEnterpriseUntil(s,NOW+1_800_000)
 const switched=v4ChooseEnterprise(s,'franchise','cafe',NOW+1_800_000)
 assert.ok(switched)
 assert.equal(enterpriseV4BonusBps(switched!,'kiosque',NOW+1_800_000),2500)
 assert.equal(enterpriseV4BonusBps(switched!,'cafe',NOW+1_800_000),2000)
 assert.ok(valid(switched!).valid,valid(switched!).reason)
})
test('09 R&D: single exact cents, batch equivalent to all individual discounted costs at levels 1..300',()=>{
 const s=setup(9)
 for(const [from,to] of [[1,20],[19,21],[20,200],[20,300],[71,210]]){
  const expected=Array.from({length:to-from},(_,i)=>v4UpgradeCost(s,'kiosque',from+i)!)
    .reduce((a,b)=>a+b,0n)
  assert.equal(v4UpgradeBatchCost(s,'kiosque',from,to),expected)
 }
 assert.equal(v4UpgradeCost(s,'kiosque',20),getEnterpriseUpgradeCostCentsExact('kiosque',20)!*92n/100n)
 const without=setup()
 assert.equal(v4UpgradeCost(without,'kiosque',20),getEnterpriseUpgradeCostCentsExact('kiosque',20))
 assert.equal(v4UpgradeBatchCost(without,'kiosque',20,100),
  Array.from({length:80},(_,i)=>getEnterpriseUpgradeCostCentsExact('kiosque',20+i)!).reduce((a,b)=>a+b,0n))
 assert.equal(v4UpgradeBatchCost(s,'kiosque',20,500_000)>0n,true)
 const old=JSON.stringify(s)
 assert.equal(v4UpgradeBatchCost(s,'kiosque',100,99),null)
 assert.equal(JSON.stringify(s),old)
})
test('09: initial acquisition unaffected; MAX quote and costs fully discounted',()=>{
 let s=setup(9)
 const quote=quoteV8EnterpriseMax(s,'cafe')!
 assert.ok(quote.levelsBought>0)
 assert.equal(quote.costCents,v4UpgradeBatchCost(s,'cafe',20,quote.targetLevel))
 const bought=v8BuyEnterprise(s,'cafe',NOW,true)
 assert.ok(bought.ok)
 assert.equal(bought.costCents,v4UpgradeCost(s,'cafe',20))
 s=bought.state
 assert.ok(valid(s).valid,valid(s).reason)
 const q=v8BuyEnterpriseMax(s,'cafe',NOW,s.enterprises.owned.cafe.level)
 assert.ok(q.ok)
 assert.equal(q.costCents,quote.costCents-bought.costCents)
 assert.ok(valid(q.state).valid,valid(q.state).reason)
})
test('10 contract funds locked exactly, expiry once, positive profits taxable only and offline = split replay',()=>{
 let s=setup(10)
 s=v4StartContract(s,100_000_000_000n,120,NOW)!
 assert.ok(s)
 const contract=enterpriseV4(s).contracts[0]!
 assert.equal(v(s.game.balance),big-100_000_000_000n)
 assert.equal(v4ContractEarlyExitWorth(s),85_000_000_000n)
 assert.equal(v8EligiblePrestigeWorthCents(s)-v8EligiblePrestigeWorthCents(setup(10)),
   -15_000_000_000n)
 const end=NOW+120*60_000
 const once=v8AdvanceFiscalEconomy(s,end)
 const split=v8AdvanceFiscalEconomy(v8AdvanceFiscalEconomy(s,NOW+60*60_000),end)
 assert.deepEqual(once,split)
 const receipt=enterpriseV4(once).contractHistory.at(-1)!
 const paid=v(receipt.payoutCents),gain=v(receipt.profitCents)
 assert.equal(paid-gain,100_000_000_000n)
 assert.equal(gain,contract.success?5_000_000_000n:-15_000_000_000n)
 assert.equal(enterpriseV4(once).contracts.length,0)
 assert.equal(v(once.stats.earnedBySource.enterprises)-v(s.stats.earnedBySource.enterprises)>=
   (gain>0n?gain:0n),true)
 assert.deepEqual(v8AdvanceFiscalEconomy(once,end),once)
 assert.ok(valid(once).valid,valid(once).reason)
})
test('10 max active contracts and 11 project categories, 30min expiry and no repeat spending',()=>{
 let s=setup(10,11)
 for(let i=0;i<5;i++){
  const next=v4StartContract(s,100_000_000n,30,NOW)
  assert.ok(next)
  s=next
 }
 assert.equal(v4StartContract(s,100_000_000n,30,NOW),null)
 for(let tier=0;tier<3;tier++){
  const started=v4StartProject(s,tier,'small',NOW)
  assert.ok(started)
  s=started
 }
 assert.equal(enterpriseV4BonusBps(s,'kiosque',NOW),1500)
 assert.equal(v4StartProject(s,3,'small',NOW),null)
 s=v8AdvanceFiscalEconomy(s,NOW+1_800_000)
 assert.equal(enterpriseV4BonusBps(s,'kiosque',NOW+1_800_000),0)
 assert.equal(enterpriseV4(s).projects.length,0)
 assert.deepEqual(enterpriseV4(s).usedProjectTiers,[0,1,2])
 assert.equal(v4StartProject(s,1,'small',NOW+1_800_000),null)
 assert.equal(enterpriseV4(s).contracts.length,0)
 assert.equal(enterpriseV4(s).contractHistory.length,5)
 assert.ok(valid(s).valid,valid(s).reason)
})
test('11 1 AA is 10^21 dollars, project cost burns cash and does not mint XP/Fame',()=>{
 let s=setup(11)
 assert.equal(V4_PROJECT_COSTS_CENTS[4],10n**23n)
 const before=s,after=v4StartProject(s,4,'industry',NOW)
 assert.ok(after)
 assert.equal(v(after!.game.balance),v(before.game.balance)-10n**23n)
 assert.equal(after!.prestige.experienceCents,before.prestige.experienceCents)
 assert.equal(after!.prestige.lifetimeFameMicros,before.prestige.lifetimeFameMicros)
 assert.equal(after!.fiscal.taxesDueCents,before.fiscal.taxesDueCents)
 assert.equal(enterpriseV4BonusBps(after!,'usine',NOW),500)
 assert.ok(valid(after!).valid,valid(after!).reason)
})
test('V4 enterprise earnings exact BigInt, time slicing and fiscal 72h payment idempotent',()=>{
 let s=setup(8,11,12,13)
 s=v4ChooseSynergy(s,'kiosque','cafe',NOW)!
 s=v4ChooseEnterprise(s,'franchise','kiosque',NOW)!
 s=v4ChooseEnterprise(s,'board','kiosque',NOW)!
 s=v4StartProject(s,0,'small',NOW)!
 const end=NOW+FISCAL_PERIOD_MS+25_000
 const full=v8AdvanceFiscalEconomy(s,end)
 const split=v8AdvanceFiscalEconomy(v8AdvanceFiscalEconomy(v8AdvanceFiscalEconomy(s,NOW+1_800_000),
   NOW+FISCAL_PERIOD_MS),end)
 assert.equal(full.game.balance,split.game.balance)
 assert.equal(full.fiscal.taxesDueCents,split.fiscal.taxesDueCents)
 assert.equal(full.fiscal.taxesPaidCents,split.fiscal.taxesPaidCents)
 assert.equal(full.stats.earnedBySource.enterprises,split.stats.earnedBySource.enterprises)
 assert.equal(full.prestige.experienceCents,split.prestige.experienceCents)
 assert.ok(valid(full).valid,valid(full).reason)
 assert.deepEqual(v8AdvanceFiscalEconomy(full,end),full)
})
test('Prestige forces −15% contract loss before PP; retains Fame levels, clears all cycle choices',()=>{
 let s=setup(8,9,10,11,12,13)
 s=v8CreditIncome(s,'enterprises',10n**25n)
 s=v4ChooseSynergy(s,'kiosque','cafe',NOW)!
 s=v4ChooseEnterprise(s,'franchise','kiosque',NOW)!
 s=v4ChooseEnterprise(s,'board','kiosque',NOW)!
 s=v4StartContract(s,10n**14n,120,NOW)!
 s=v4StartProject(s,0,'small',NOW)!
 const preview=v8EligiblePrestigeWorthCents(s)
 const result=v8PerformPrestige(s,NOW)
 assert.ok(result.ok, result.reason)
 assert.equal(result.worthCents,preview)
 assert.equal(result.state.prestige.fameV4?.levels['fame-v4-10'],5)
 assert.equal(result.state.enterprises.fameV4Enterprise?.contracts.length,0)
 assert.equal(result.state.enterprises.fameV4Enterprise?.projects.length,0)
 assert.equal(result.state.enterprises.fameV4Enterprise?.synergy,null)
 assert.equal(result.state.enterprises.fameV4Enterprise?.board,null)
 assert.equal(result.state.enterprises.fameV4Enterprise?.franchise,null)
 assert.equal(result.state.enterprises.fameV4Enterprise?.usedProjectTiers.length,0)
 assert.equal(result.state.enterprises.fameV4Enterprise?.contractHistory.at(-1)?.forced,true)
 assert.ok(valid(result.state).valid,valid(result.state).reason)
})
test('Optional old V8 valid; corrupted tier, contract and ledger refused on import and storage',()=>{
 const base=setup(),state=v4StartContract(setup(10),10n**12n,120,NOW)!
 assert.ok(valid(base).valid,valid(base).reason)
 assert.ok(valid(state).valid,valid(state).reason)
 const imported=prepareV8SaveImport(exportV8Save(state,NOW),NOW)
 assert.ok(imported.ok,imported.reason)
 if(imported.ok)assert.deepEqual(imported.state,state)
 const map=new Map<string,string>(),storage={
  getItem:(key:string)=>map.get(key)??null,setItem:(key:string,val:string)=>{map.set(key,val)},
 }
 assert.equal(saveV8CapitalState(storage,state),true)
 const loaded=loadV8CapitalState(storage,NOW)
 assert.ok(loaded.ok)
 if(loaded.ok)assert.deepEqual(loaded.state.enterprises.fameV4Enterprise,state.enterprises.fameV4Enterprise)
 const forged={...state,enterprises:{...state.enterprises,fameV4Enterprise:{
  ...state.enterprises.fameV4Enterprise!,contracts:[{...state.enterprises.fameV4Enterprise!.contracts[0]!,
   principalCents:'9999999999999999999999999999999999999'}]}}}
 // Without a debit witness we still require canonical contract shape, and
 // reject dishonest payouts / expiry / unlocks rather than trusting amounts.
 const expired={...state,enterprises:{...state.enterprises,fameV4Enterprise:{
  ...state.enterprises.fameV4Enterprise!,contracts:[{...state.enterprises.fameV4Enterprise!.contracts[0]!,endsAt:NOW}]}}}
 assert.equal(valid(expired).valid,false)
 assert.equal(prepareV8SaveImport(JSON.stringify(expired),NOW).ok,false)
 const invalidProject={...state,enterprises:{...state.enterprises,fameV4Enterprise:{
  ...state.enterprises.fameV4Enterprise!,usedProjectTiers:[999]}}}
 assert.equal(valid(invalidProject).valid,false)
 assert.equal(valid(forged).valid,false)
})
