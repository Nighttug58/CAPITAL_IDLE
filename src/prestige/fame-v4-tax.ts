/** Fame V4 fiscal powers 24–27. Cent-based, single-wallet, pure V8 transitions.
 * Optional registry: an old V8 save without it continues using the legacy tax ledger.
 */
import type {V8CapitalState, V8FiscalState, V8TaxBreakdown} from '../exact-state-v8.ts'
import type {TaxSource} from '../economy/state.ts'
import {FISCAL_PERIOD_MS} from '../economy/state.ts'

const SOURCES:readonly TaxSource[]=['enterprises','stocks','crypto','memecoins']
export const V4_TAX_INSTALLMENT_MS=12*60*60*1000
export const V4_TAX_EARLY_MIN_CENTS=100_000_000n
export const V4_TAX_LOYALTY_LEAD_MS=24*60*60*1000
const number=(text:string)=>BigInt(text)
const enc=(n:bigint)=>n.toString()
const rank=(state:V8CapitalState,id:number)=>state.prestige.fameV4?.levels[
  ('fame-v4-'+String(id).padStart(2,'0')) as keyof NonNullable<V8CapitalState['prestige']['fameV4']>['levels']
]??0
const emptyBreakdown=():V8TaxBreakdown=>({enterprises:'0',stocks:'0',crypto:'0',memecoins:'0'})

export interface V4TaxPlan {
  readonly startedAt:number
  readonly installments:number
  readonly paidCount:number
  readonly initialCents:string
  readonly remainingBySourceCents:V8TaxBreakdown
}
export interface FameV4TaxState {
  readonly version:1
  readonly lastQualifiedAt:number|null
  /** Qualification always targets one *new* 72h fiscal period. */
  readonly eligiblePeriodAt:number|null
  readonly discountsGrantedCents:string
  readonly managementFeesPaidCents:string
  readonly plan:V4TaxPlan|null
}
export function emptyFameV4Tax():FameV4TaxState {
  return {version:1,lastQualifiedAt:null,eligiblePeriodAt:null,
    discountsGrantedCents:'0',managementFeesPaidCents:'0',plan:null}
}
export function v4TaxState(state:V8CapitalState):FameV4TaxState {
  return state.fiscal.fameV4Tax??emptyFameV4Tax()
}
const sum=(v:V8TaxBreakdown)=>SOURCES.reduce((a,key)=>a+number(v[key]),0n)
const update=(state:V8CapitalState,fiscal:V8FiscalState):V8CapitalState=>({...state,fiscal})
export function v4ReservedTaxCents(state:V8CapitalState):bigint {
  const level=rank(state,24)
  return level>0 ? number(state.fiscal.taxesDueCents)*BigInt(Math.min(5,level)*20)/100n:0n
}
/** Reserve is only an unavailable portion of the existing cash, not a new asset. */
export function v4SpendableCents(state:V8CapitalState):bigint {
  const available=number(state.game.balance)-v4ReservedTaxCents(state)
  return available>0n?available:0n
}
export function v4CanSpend(state:V8CapitalState,cost:bigint):boolean {
  return cost>=0n&&v4SpendableCents(state)>=cost
}
export function v4PlanNextAt(state:V8CapitalState):number|null {
  const plan=state.fiscal.fameV4Tax?.plan
  return plan&&plan.paidCount<plan.installments
    ?plan.startedAt+plan.paidCount*V4_TAX_INSTALLMENT_MS:null
}
/** Debit a portion of EXISTING dueBySource. New taxable income stays due. */
function payPortion(state:V8CapitalState,bySource:V8TaxBreakdown):V8CapitalState {
  const amount=sum(bySource)
  const due:V8TaxBreakdown={...state.fiscal.dueBySourceCents}
  const paid:V8TaxBreakdown={...state.fiscal.paidBySourceCents}
  for(const key of SOURCES) {
    const part=number(bySource[key])
    if(part>number(due[key]))throw new RangeError('Fiscal plan exceeds tax due')
    due[key]=enc(number(due[key])-part)
    paid[key]=enc(number(paid[key])+part)
  }
  return update(state,{...state.fiscal,
    dueBySourceCents:due,paidBySourceCents:paid,
    taxesDueCents:enc(number(state.fiscal.taxesDueCents)-amount),
    taxesPaidCents:enc(number(state.fiscal.taxesPaidCents)+amount),
  })
}
/** 12h fixed instalments, deterministic even if offline replay skips many ticks. */
export function v4ApplyPlanInstallment(state:V8CapitalState,at:number):V8CapitalState {
  const plan=state.fiscal.fameV4Tax?.plan
  if(!plan||v4PlanNextAt(state)!==at)return state
  const data=v4TaxState(state)
  const remaining=sum(plan.remainingBySourceCents)
  const paid=number(plan.initialCents)-remaining
  const target=number(plan.initialCents)*BigInt(plan.paidCount+1)/BigInt(plan.installments)
  let needed=target-paid
  const portion=emptyBreakdown(),remainder={...plan.remainingBySourceCents}
  for(const key of SOURCES){
    const take=number(remainder[key])<needed?number(remainder[key]):needed
    portion[key]=enc(take)
    remainder[key]=enc(number(remainder[key])-take)
    needed-=take
  }
  if(needed!==0n)throw new RangeError('Invalid fiscal installment')
  const paidState=payPortion(state,portion)
  const amount=sum(portion)
  const nextCount=plan.paidCount+1
  const nextPlan=nextCount===plan.installments?null:{...plan,paidCount:nextCount,remainingBySourceCents:remainder}
  return {...paidState,game:{...paidState.game,balance:enc(number(state.game.balance)-amount)},
    fiscal:{...paidState.fiscal,fameV4Tax:{...data,plan:nextPlan}}}
}
export function v4StartTaxPlan(state:V8CapitalState,at:number):V8CapitalState|null {
  const level=rank(state,26),data=v4TaxState(state),due=number(state.fiscal.taxesDueCents)
  const installments=Math.min(6,level+1)
  if(level<1||data.plan||data.eligiblePeriodAt!==null||due<=0n||
    !Number.isSafeInteger(at)||at!==state.enterprises.lastAccruedAt||
    at<state.fiscal.periodStartedAt||
    at+(installments-1)*V4_TAX_INSTALLMENT_MS>state.fiscal.periodStartedAt+FISCAL_PERIOD_MS)return null
  const fee=(due+50n)/100n
  if(!v4CanSpend(state,fee))return null
  const plan:V4TaxPlan={startedAt:at,installments,paidCount:0,
    initialCents:enc(due),remainingBySourceCents:{...state.fiscal.dueBySourceCents}}
  const created={...state,game:{...state.game,balance:enc(number(state.game.balance)-fee)},
    fiscal:{...state.fiscal,fameV4Tax:{...data,plan,
      managementFeesPaidCents:enc(number(data.managementFeesPaidCents)+fee)}}}
  // The first installment is collected at activation, then one every 12h.
  return v4ApplyPlanInstallment(created,at)
}
/** Unified actual tax settlement. Preserves normal 72h anchor at Prestige. */
export function v4SettleFiscalTaxes(state:V8CapitalState,at:number,preserveAnchor=false):V8CapitalState {
  if(!Number.isSafeInteger(at)||at<state.fiscal.periodStartedAt)throw new RangeError('Invalid tax time')
  const prior=state.fiscal, old=state.fiscal.fameV4Tax
  const data=v4TaxState(state)
  const due=number(prior.taxesDueCents)
  // An installment plan cannot be combined with a future loyalty discount.
  const eligible=!preserveAnchor&&!data.plan&&data.eligiblePeriodAt===prior.periodStartedAt
  const discount=eligible ? due*BigInt(Math.min(rank(state,25),5))/100n:0n
  let remainingDiscount=discount
  const paid=emptyBreakdown(),discounted=emptyBreakdown()
  // Pro-rata floor, then exact leftover distribution without going negative.
  for(const key of SOURCES){
    const src=number(prior.dueBySourceCents[key])
    const share=due>0n?src*discount/due:0n
    discounted[key]=enc(share);remainingDiscount-=share
  }
  for(const key of SOURCES){
    if(remainingDiscount===0n)break
    const spare=number(prior.dueBySourceCents[key])-number(discounted[key])
    const extra=spare<remainingDiscount?spare:remainingDiscount
    discounted[key]=enc(number(discounted[key])+extra);remainingDiscount-=extra
  }
  if(remainingDiscount!==0n)throw new RangeError('Invalid fiscal discount')
  for(const key of SOURCES)paid[key]=enc(number(prior.paidBySourceCents[key])+
    number(prior.dueBySourceCents[key])-number(discounted[key]))
  const wallet=number(state.game.balance)-(due-discount)
  // Preserve an optional new fiscal receipt only if V4 tax functionality is used.
  const hasData=!!old||[24,25,26,27].some(id=>rank(state,id)>0)
  const nextData:FameV4TaxState={...data,eligiblePeriodAt:null,plan:null,
    discountsGrantedCents:enc(number(data.discountsGrantedCents)+discount)}
  return {...state,game:{...state.game,balance:enc(wallet)},fiscal:{...prior,
    periodStartedAt:preserveAnchor?prior.periodStartedAt:at,
    taxesDueCents:'0',dueBySourceCents:emptyBreakdown(),
    taxesPaidCents:enc(number(prior.taxesPaidCents)+due-discount),
    paidBySourceCents:paid,
    ...(hasData?{fameV4Tax:nextData}:{})}}
}
/** Early payment grants one next-period discount only with >= $1M paid at least
 * 24h before the deadline, at most once in any rolling 72h. Never retroactive.
 */
export function v4PayTaxEarly(state:V8CapitalState,at:number):V8CapitalState|null {
  const period=state.fiscal.periodStartedAt
  const due=number(state.fiscal.taxesDueCents)
  if(due<=0n||!Number.isSafeInteger(at)||at!==state.enterprises.lastAccruedAt||
    at<period||at>=period+FISCAL_PERIOD_MS)return null
  const data=v4TaxState(state),hadPlan=data.plan!==null
  const qualifying=rank(state,25)>0&&!hadPlan&&
    due>=V4_TAX_EARLY_MIN_CENTS&&
    period+FISCAL_PERIOD_MS-at>=V4_TAX_LOYALTY_LEAD_MS&&
    (data.lastQualifiedAt===null||at-data.lastQualifiedAt>=FISCAL_PERIOD_MS)
  const paid=v4SettleFiscalTaxes(state,at)
  if(!qualifying)return paid
  const updated=v4TaxState(paid)
  return {...paid,fiscal:{...paid.fiscal,fameV4Tax:{...updated,
    eligiblePeriodAt:at,lastQualifiedAt:at}}}
}
/** After Prestige, a started plan is fully collected by ordinary settlement;
 * pending reduction rights cannot outlive a Prestige cycle. */
export function v4PrestigeFiscal(state:V8CapitalState):V8CapitalState {
  const data=state.fiscal.fameV4Tax
  return data?{...state,fiscal:{...state.fiscal,fameV4Tax:{
    ...data,plan:null,eligiblePeriodAt:null,lastQualifiedAt:null}}}:state
}
export function v4FiscalReport(state:V8CapitalState){
  const data=v4TaxState(state)
  const income=state.stats.earnedBySource
  const gross=Object.values(income).reduce((total,amount)=>total+number(amount),0n)
  const losses=Object.values(state.stats.realizedLossesBySource)
    .reduce((total,amount)=>total+number(amount),0n)
  const paid=number(state.fiscal.taxesPaidCents),due=number(state.fiscal.taxesDueCents)
  const fees=number(data.managementFeesPaidCents)
  return {recordedIncomeCents:gross,recordedTradingLossCents:losses,
    recordedTaxCents:paid,estimatedNetCents:gross-losses-paid-fees,
    dueCents:due,feesCents:fees,discountCents:number(data.discountsGrantedCents),
    // Pure hypothetical next liability, clearly not a forecast of market movements.
    simulatedNextTaxCents:due*(100n-BigInt(Math.min(rank(state,25),5)))/100n}
}
