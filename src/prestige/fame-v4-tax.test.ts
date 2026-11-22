import test from 'node:test'
import assert from 'node:assert/strict'
import {createV8CapitalState,getExactAmount as v,type V8CapitalState} from '../exact-state-v8.ts'
import {v8BuyFameV4UpgradeMax} from './fame-v4-ledger.ts'
import {v8AccrueTax,v8AdvanceFiscalEconomy,v8PayTaxes,v8UpgradeClick,v8BuyTrade,v8CreditIncome} from '../exact-runtime-v8.ts'
import {v8PerformPrestige} from '../exact-prestige-v8.ts'
import {validateExactV8State} from '../exact-save-validation.ts'
import {getAsset} from '../trading/catalog.ts'
import {prepareV8SaveImport,exportV8Save} from '../exact-persistence-v8.ts'
import {FISCAL_PERIOD_MS} from '../economy/state.ts'
import {v4ReservedTaxCents,v4SpendableCents,v4StartTaxPlan,v4PayTaxEarly,
  v4PlanNextAt,v4FiscalReport,V4_TAX_INSTALLMENT_MS} from './fame-v4-tax.ts'

const T=1_800_000_000_000
const check=(state:V8CapitalState)=>validateExactV8State(state,id=>getAsset(id)?.quantityDecimals??null)
function rich(...powers:number[]):V8CapitalState {
 const base=createV8CapitalState(T),p=base.prestige
 const fame=180_000n*1_000_000n,cash=10n**38n
 let state:V8CapitalState={...base,
  game:{...base.game,balance:cash.toString(),lifetimeEarned:cash.toString()},
  prestige:{...p,
   fameMicros:(v(p.fameMicros)+fame).toString(),
   lifetimeFameMicros:(v(p.lifetimeFameMicros)+fame).toString(),
   levelFameMicros:(v(p.levelFameMicros)+fame).toString(),
   cycleEarnedFameMicros:(v(p.cycleEarnedFameMicros)+fame).toString(),
   cycleLevelFameMicros:(v(p.cycleLevelFameMicros)+fame).toString()},
 }
 for(const id of powers){
  const next=v8BuyFameV4UpgradeMax(state,'fame-v4-'+String(id).padStart(2,'0'),0)
  assert.ok(next)
  state=next
 }
 assert.equal(check(state).valid,true,check(state).reason)
 return state
}
function owing(state:V8CapitalState,cents:bigint):V8CapitalState {
 const next=v8AccrueTax(state,'stocks',cents)
 assert.ok(v(next.fiscal.taxesDueCents)>0n)
 return next
}
test('24 reserves 20 percent per rank, without second wallet or duplicate tax; rebases each due',()=>{
 let state=owing(rich(24),2_000_000n)
 const original=v(state.game.balance), due=v(state.fiscal.taxesDueCents)
 assert.equal(v4ReservedTaxCents(state),due)
 assert.equal(v4SpendableCents(state),original-due)
 assert.equal(v(state.game.balance),original)
 const onlyReserved={...state,game:{...state.game,balance:due.toString()}}
 assert.equal(v4SpendableCents(onlyReserved),0n)
 assert.equal(v8UpgradeClick(onlyReserved),null)
 assert.equal(v8BuyTrade(onlyReserved,'nvideo','1').ok,false)
 state=v8PayTaxes(state,T)
 assert.equal(v(state.game.balance),original-due)
 assert.equal(v4ReservedTaxCents(state),0n)
 assert.equal(state.fiscal.taxesDueCents,'0')
 assert.equal(check(state).valid,true,check(state).reason)
})
test('25 loyalty requires $1M at >=24h before due, one qualification per 72h, then 5% discount exactly once',()=>{
 let state=owing(rich(25),10_000_000_000n)
 const firstDue=v(state.fiscal.taxesDueCents)
 assert.ok(firstDue>=100_000_000n)
 const at=T+24*60*60*1000
 const paid=v4PayTaxEarly(v8AdvanceFiscalEconomy(state,at),at)
 assert.ok(paid)
 assert.equal(paid.fiscal.fameV4Tax?.eligiblePeriodAt,at)
 assert.equal(v(paid.fiscal.taxesPaidCents),firstDue)
 assert.equal(check(paid).valid,true,check(paid).reason)
 const nextDebt=owing(paid,2_000_000_000n)
 const secondDue=v(nextDebt.fiscal.taxesDueCents)
 const expectedDiscount=secondDue*5n/100n
 const atDeadline=at+FISCAL_PERIOD_MS
 const finished=v8AdvanceFiscalEconomy(nextDebt,atDeadline)
 assert.equal(v(finished.fiscal.taxesPaidCents),firstDue+secondDue-expectedDiscount)
 assert.equal(v(finished.fiscal.fameV4Tax!.discountsGrantedCents),expectedDiscount)
 assert.equal(finished.fiscal.fameV4Tax!.eligiblePeriodAt,null)
 assert.deepEqual(v8AdvanceFiscalEconomy(finished,atDeadline),finished)
 assert.equal(check(finished).valid,true,check(finished).reason)
})
test('25 does not grant premature or small early payments and never discounts on the qualifying payment',()=>{
 let state=owing(rich(25),100_000_000n)
 const at=T+FISCAL_PERIOD_MS-60*60*1000
 const paid=v4PayTaxEarly(v8AdvanceFiscalEconomy(state,at),at)!
 assert.equal(paid.fiscal.fameV4Tax?.eligiblePeriodAt??null,null)
 assert.equal(paid.fiscal.fameV4Tax?.discountsGrantedCents??'0','0')
 assert.ok(check(paid).valid)
})
test('26 plans split exact 1% fee once and installments deterministic across replay while new income remains due',()=>{
 let state=owing(rich(26),10_000_000_001n)
 const due=v(state.fiscal.taxesDueCents),wallet=v(state.game.balance)
 const start=T
 const plan=v4StartTaxPlan(state,start)
 assert.ok(plan)
 assert.equal(v(plan.game.balance),wallet-(due+50n)/100n-due/6n)
 assert.equal(v(plan.fiscal.fameV4Tax!.managementFeesPaidCents),(due+50n)/100n)
 assert.equal(plan.fiscal.fameV4Tax!.plan?.installments,6)
 assert.equal(plan.fiscal.fameV4Tax!.plan?.paidCount,1)
 assert.equal(v4StartTaxPlan(plan,start),null)
 const withNew=v8AccrueTax(plan,'crypto',234_567n)
 const nextAt=v4PlanNextAt(withNew)!
 assert.equal(nextAt,T+V4_TAX_INSTALLMENT_MS)
 const once=v8AdvanceFiscalEconomy(withNew,nextAt)
 const twice=v8AdvanceFiscalEconomy(withNew,T+FISCAL_PERIOD_MS)
 let split=withNew
 for(let i=1;i<=6;i++)split=v8AdvanceFiscalEconomy(split,T+i*V4_TAX_INSTALLMENT_MS)
 assert.deepEqual(twice,split)
 assert.equal(v(once.fiscal.taxesDueCents),v(withNew.fiscal.taxesDueCents)-(due*2n/6n-due/6n))
 assert.equal(v(twice.fiscal.taxesPaidCents),due+(v(withNew.fiscal.taxesDueCents)-(due-due/6n)))
 assert.equal(twice.fiscal.taxesDueCents,'0')
 assert.equal(twice.fiscal.fameV4Tax?.plan,null)
 assert.equal(check(twice).valid,true,check(twice).reason)
})
test('26 preserves debt into negative cash and blocks deadline-overrunning plans',()=>{
 let state=owing(rich(26),100_000_000n)
 state=v8AdvanceFiscalEconomy(state,T+60*60*60*1000)
 assert.equal(v4StartTaxPlan(state,T+60*60*60*1000),null)
 const raw=rich(26)
 const still=owing(raw,100_000_000n)
 const withPlan=v4StartTaxPlan(still,T)!
 const cash='0'
 const negative={...withPlan,game:{...withPlan.game,balance:cash}}
 const settled=v8AdvanceFiscalEconomy(negative,T+FISCAL_PERIOD_MS)
 assert.ok(v(settled.game.balance)<0n)
 assert.equal(settled.fiscal.taxesDueCents,'0')
})
test('27 reporting is pure and preserves exact BigInt sums, imports and V8 validations',()=>{
 let state=owing(rich(24,25,26,27),10_000_000n)
 const prior=JSON.stringify(state)
 const report=v4FiscalReport(state)
 assert.equal(JSON.stringify(state),prior)
 assert.equal(report.dueCents,v(state.fiscal.taxesDueCents))
 assert.ok(report.recordedIncomeCents>=0n)
 assert.ok(check(state).valid,check(state).reason)
 const imported=prepareV8SaveImport(exportV8Save(state,T),T)
 assert.equal(imported.ok,true,imported.reason)
 if(imported.ok)assert.deepEqual(imported.state,state)
 const forged={...state,fiscal:{...state.fiscal,fameV4Tax:{version:1,lastQualifiedAt:null,
  eligiblePeriodAt:null,discountsGrantedCents:'-1',managementFeesPaidCents:'0',plan:null}}}
 assert.equal(check(forged).valid,false)
 assert.equal(prepareV8SaveImport(JSON.stringify(forged),T).ok,false)
})
test('all outstanding installments and debt are paid before Prestige, without diluting PP',()=>{
 let state=owing(rich(24,26),12_345_678n)
 const due=v(state.fiscal.taxesDueCents)
 state=v4StartTaxPlan(state,T)!
 state=v8CreditIncome(state,'enterprises',10n**27n)
 const result=v8PerformPrestige(state,T)
 assert.equal(result.ok,true,result.reason)
 if(!result.ok)return
 assert.equal(result.state.fiscal.taxesDueCents,'0')
 assert.equal(result.state.fiscal.fameV4Tax?.plan,null)
 assert.ok(v(result.state.fiscal.taxesPaidCents)>=due)
 assert.equal(result.state.prestige.fameV4?.levels['fame-v4-24'],5)
 assert.equal(result.state.prestige.fameV4?.levels['fame-v4-26'],5)
 assert.ok(check(result.state).valid,check(result.state).reason)
})
