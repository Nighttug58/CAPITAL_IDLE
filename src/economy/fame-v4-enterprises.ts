/** Fame Shop V4 – enterprise powers 08–13. Pure exact-state domain logic.
 * All cash is integer cents (BigInt), never a monetary Number.
 * Timed work is settled only by the enterprise/fiscal authority.
 */
import type { V8CapitalState } from '../exact-state-v8.ts'
import { getExactAmount as v, withExactAmount as s } from '../exact-state-v8.ts'
import { getEnterprise, ENTERPRISES, getEnterpriseUpgradeCostCentsExact } from './catalog.ts'
import type { EnterpriseCategory } from './catalog.ts'
import { fameV4Level } from '../trading/fame-v4-trading.ts'
import { v8CreditIncome, v8AccrueTax } from '../exact-runtime-v8.ts'

const COOLDOWN_MS = 30 * 60_000
export const V4_PROJECT_DURATION_MS = 30 * 60_000
export const V4_CONTRACT_MIN_STAKE_CENTS = 100_000_000n
export const V4_PROJECT_COSTS_CENTS: readonly bigint[] = Object.freeze([
  10n**12n, // 10 B $
  10n**14n, // 1 T $
  10n**16n, // 100 T $
  10n**18n, // 10 Q $
  10n**23n, // 1 AA $
])
export const V4_CONTRACT_DURATIONS_MINUTES = [30,60,90,120] as const
type Duration = typeof V4_CONTRACT_DURATIONS_MINUTES[number]
export interface V4EnterpriseChoice {id:string;chosenAt:number}
export interface V4EnterpriseProject {tier:number;category:EnterpriseCategory;startedAt:number;endsAt:number}
export interface V4EnterpriseContract {
  id:number;principalCents:string;startedAt:number;endsAt:number;seedAtStart:number;success:boolean;successBps:number
}
export interface V4EnterpriseReceipt {
  id:number;at:number;principalCents:string;payoutCents:string;profitCents:string;forced:boolean
}
export interface FameV4EnterpriseState {
  version:1
  synergy:[string,string]|null
  franchise:V4EnterpriseChoice|null
  board:V4EnterpriseChoice|null
  projects:V4EnterpriseProject[]
  usedProjectTiers:number[]
  contracts:V4EnterpriseContract[]
  nextContractId:number
  contractHistory:V4EnterpriseReceipt[]
}
export function emptyFameV4Enterprise():FameV4EnterpriseState {
  return {version:1,synergy:null,franchise:null,board:null,
    projects:[],usedProjectTiers:[],contracts:[],nextContractId:1,contractHistory:[]}
}
export function enterpriseV4(state:V8CapitalState):FameV4EnterpriseState{
  return state.enterprises.fameV4Enterprise??emptyFameV4Enterprise()
}
export function nextV4EnterpriseEventTime(state:V8CapitalState,from:number,to:number):number {
  let next=to
  const data=state.enterprises.fameV4Enterprise
  if(!data)return next
  for(const project of data.projects)if(project.endsAt>from&&project.endsAt<next)next=project.endsAt
  for(const contract of data.contracts)if(contract.endsAt>from&&contract.endsAt<next)next=contract.endsAt
  return next
}
export function enterpriseV4BonusBps(state:V8CapitalState,id:string,at:number):number{
  const data=state.enterprises.fameV4Enterprise
  if(!data)return 0
  const item=getEnterprise(id)
  if(!item||!state.enterprises.owned[id])return 0
  let bps=0
  if(data.synergy?.includes(id))bps+=100*fameV4Level(state,8)
  if(data.franchise?.id===id)bps+=100*fameV4Level(state,12)
  if(data.board?.id===id)bps+=300*fameV4Level(state,13)
  bps+=Math.min(1500,data.projects.filter(p=>p.category===item.category&&p.startedAt<=at&&p.endsAt>at).length*500)
  return Math.min(10_000,bps)
}
function validNow(state:V8CapitalState,at:number):boolean {
  return Number.isSafeInteger(at)&&at===state.enterprises.lastAccruedAt &&
    at>=state.fiscal.periodStartedAt
}
function holding(state:V8CapitalState,id:string):boolean{
  return !!state.enterprises.owned[id] && !!getEnterprise(id)
}
/** One unique pairing. Both businesses must already be owned. */
export function v4ChooseSynergy(state:V8CapitalState,a:string,b:string,at:number):V8CapitalState|null{
  if(fameV4Level(state,8)<1||!validNow(state,at)||a===b||!holding(state,a)||!holding(state,b))return null
  const data=enterpriseV4(state)
  if(data.synergy?.[0]===a&&data.synergy[1]===b)return state
  return {...state,enterprises:{...state.enterprises,fameV4Enterprise:{...data,synergy:[a,b]}}}
}
export function v4ChooseEnterprise(state:V8CapitalState,kind:'franchise'|'board',id:string,at:number):V8CapitalState|null{
  const rank=fameV4Level(state,kind==='franchise'?12:13)
  if(rank===0||!validNow(state,at)||!holding(state,id))return null
  const data=enterpriseV4(state),previous=data[kind]
  if(previous?.id===id)return state
  if(previous&&at-previous.chosenAt<COOLDOWN_MS)return null
  return {...state,enterprises:{...state.enterprises,fameV4Enterprise:{
    ...data,[kind]:{id,chosenAt:at}}}}
}
/** Flat 0.8% per Fame rank on FUTURE upgrades, not initial acquisitions. */
export function v4UpgradeCost(state:V8CapitalState,id:string,level:number):bigint|null{
  const base=getEnterpriseUpgradeCostCentsExact(id,level)
  if(base===null)return null
  return base*BigInt(10_000-80*fameV4Level(state,9))/10_000n
}
/** floor_sum(n,m,a,b) = Σ floor((a*i+b)/m), O(log m), all BigInt. */
function floorSum(n:bigint,m:bigint,a:bigint,b:bigint):bigint{
  let answer=0n
  while(true){
    if(a>=m){answer+=n*(n-1n)/2n*(a/m);a%=m}
    if(b>=m){answer+=n*(b/m);b%=m}
    const y=a*n+b
    if(y<m)return answer
    n=y/m;b=y%m
    const tmp=m;m=a;a=tmp
  }
}
/** MAX quote exactly equals sum of individual discounted integer-cent prices.
 * Legacy first 20 ranks are small; linear period-20 curve uses floor_sum.
 */
export function v4UpgradeBatchCost(state:V8CapitalState,id:string,from:number,to:number):bigint|null{
  if(!getEnterprise(id)||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||
    from<1||to<from||to>=Number.MAX_SAFE_INTEGER)return null
  const discount=BigInt(10_000-80*fameV4Level(state,9))
  let sum=0n
  for(let i=from;i<Math.min(to,20);i++){
    const cost=getEnterpriseUpgradeCostCentsExact(id,i)
    if(cost===null)return null
    sum+=cost*discount/10_000n
  }
  if(to<=20)return sum
  const anchor=getEnterpriseUpgradeCostCentsExact(id,20)
  if(anchor===null)return null
  const first=Math.max(20,from)
  // A period-20 residue r has cost ceil(anchor*(20+r)/20)+q*anchor.
  for(let r=0;r<20;r++){
    const residue=20+r
    const firstQ=first<=residue?0:Math.floor((first-residue+19)/20)
    const lastQ=Math.floor((to-1-residue)/20)
    if(lastQ<firstQ)continue
    const n=BigInt(lastQ-firstQ+1)
    const a=anchor*discount
    const b=(anchor*(20n+BigInt(r))+19n)/20n*discount+a*BigInt(firstQ)
    sum+=floorSum(n,10_000n,a,b)
  }
  return sum
}
export function v4StartContract(state:V8CapitalState,stakeCents:bigint,minutes:Duration,at:number):V8CapitalState|null{
  const rank=fameV4Level(state,10),data=enterpriseV4(state)
  if(rank<1||!validNow(state,at)||!V4_CONTRACT_DURATIONS_MINUTES.includes(minutes)||
    stakeCents<V4_CONTRACT_MIN_STAKE_CENTS||v(state.game.balance)<stakeCents||
    data.contracts.length>=rank||!Number.isSafeInteger(data.nextContractId)||
    data.nextContractId>=Number.MAX_SAFE_INTEGER)return null
  const endsAt=at+minutes*60_000
  if(!Number.isSafeInteger(endsAt))return null
  const id=data.nextContractId
  // Stable 75% success probability, locked at purchase and independent of later ticks.
  const sequence=(BigInt(state.trading.seed)*1_103_515_245n+
    BigInt(id)*2_654_435_761n+BigInt(at)+stakeCents)%10_000n
  const success=sequence<7500n
  const successBps=minutes===30?0:minutes===60?200:minutes===90?300:500
  const contract:V4EnterpriseContract={id,principalCents:s(stakeCents),startedAt:at,endsAt,
    seedAtStart:state.trading.seed,success,successBps}
  return {...state,game:{...state.game,balance:s(v(state.game.balance)-stakeCents)},
    enterprises:{...state.enterprises,fameV4Enterprise:{...data,
      nextContractId:id+1,contracts:[...data.contracts,contract]}}}
}
export function v4StartProject(state:V8CapitalState,tier:number,category:EnterpriseCategory,at:number):V8CapitalState|null{
  const data=enterpriseV4(state),rank=fameV4Level(state,11)
  const cost=V4_PROJECT_COSTS_CENTS[tier]
  const endsAt=at+V4_PROJECT_DURATION_MS
  if(!Number.isSafeInteger(tier)||tier<0||tier>=rank||cost===undefined||
    !validNow(state,at)||!Number.isSafeInteger(endsAt)||
    !['small','local','services','industry','major'].includes(category)||
    data.usedProjectTiers.includes(tier)||v(state.game.balance)<cost ||
    !ENTERPRISES.some(item=>item.category===category&&state.enterprises.owned[item.id]))return null
  const active=data.projects.filter(p=>p.endsAt>at&&p.category===category)
  if(active.length>=3)return null
  const project:V4EnterpriseProject={tier,category,startedAt:at,endsAt}
  return {...state,game:{...state.game,balance:s(v(state.game.balance)-cost)},
    enterprises:{...state.enterprises,fameV4Enterprise:{...data,
      projects:[...data.projects,project],usedProjectTiers:[...data.usedProjectTiers,tier].sort((a,b)=>a-b)}}}
}
function closeContract(state:V8CapitalState,contract:V4EnterpriseContract,at:number,forced:boolean):V8CapitalState{
  const principal=v(contract.principalCents)
  const payout=forced||!contract.success?principal*85n/100n:
    principal*(10_000n+BigInt(contract.successBps))/10_000n
  const profit=payout-principal
  let next={...state,game:{...state.game,balance:s(v(state.game.balance)+payout)}}
  // Principal was debited at start, so only positive PROFIT is a new
  // enterprise earning, XP/Fame source and tax base.
  if(profit>0n){
    next=v8CreditIncome({...next,game:{...next.game,balance:s(v(next.game.balance)-profit)}},
      'enterprises',profit)
    next=v8AccrueTax(next,'enterprises',profit)
  }
  const data=enterpriseV4(next)
  const receipt:V4EnterpriseReceipt={id:contract.id,at,principalCents:s(principal),
    payoutCents:s(payout),profitCents:s(profit),forced}
  return {...next,enterprises:{...next.enterprises,fameV4Enterprise:{...data,
    contracts:data.contracts.filter(c=>c.id!==contract.id),
    contractHistory:[...data.contractHistory,receipt].slice(-20)}}}
}
/** Settle due contracts once at this timestamp, and expire projects. */
export function v4SettleTimedEnterprise(state:V8CapitalState,at:number):V8CapitalState{
  const data=state.enterprises.fameV4Enterprise
  if(!data)return state
  let next=state
  for(const contract of [...data.contracts].sort((a,b)=>a.endsAt-b.endsAt||a.id-b.id)){
    if(contract.endsAt<=at)next=closeContract(next,contract,at,false)
  }
  const current=next.enterprises.fameV4Enterprise!
  if(!current.projects.some(p=>p.endsAt<=at))return next
  return {...next,enterprises:{...next.enterprises,fameV4Enterprise:{
    ...current,projects:current.projects.filter(p=>p.endsAt>at)}}}
}
/** Forced early exit is always a 15% loss, never success or extra PP. */
export function v4ForceContractsBeforePrestige(state:V8CapitalState,at:number):V8CapitalState{
  let next=state
  for(const contract of [...(state.enterprises.fameV4Enterprise?.contracts??[])])
    next=closeContract(next,contract,at,true)
  return next
}
export function v4PrestigeEnterpriseData(state:V8CapitalState):FameV4EnterpriseState|undefined {
  const data=state.enterprises.fameV4Enterprise
  if(!data)return undefined
  return {...emptyFameV4Enterprise(),contractHistory:data.contractHistory}
}
/** This principal has been removed from cash already: count the guaranteed
 * early-exit 85% recovery ONCE in eligible-worth previews.
 */
export function v4ContractEarlyExitWorth(state:V8CapitalState):bigint{
  return (state.enterprises.fameV4Enterprise?.contracts??[]).reduce((sum,c)=>
    sum+v(c.principalCents)*85n/100n,0n)
}

export type FameV4EnterpriseCommand =
 | {kind:'synergy';first:string;second:string}
 | {kind:'assign';role:'franchise'|'board';id:string}
 | {kind:'contract';principalCents:string;minutes:30|60|90|120}
 | {kind:'project';tier:number;category:EnterpriseCategory}
