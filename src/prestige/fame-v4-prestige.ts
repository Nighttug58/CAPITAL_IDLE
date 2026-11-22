/** Fame Shop V4 pass 8: deterministic, cycle-scoped Prestige powers.
 * The optional V8 run registry never creates an additional wallet or source
 * of Fame/XP/PP. All bonuses modify the existing source once, in basis points.
 */
import type {V8CapitalState} from '../exact-state-v8.ts'
import {getExactAmount as v} from '../exact-state-v8.ts'
import {exactTradeCost,type ExactFraction,type ExactTradeCost} from '../exact-trading.ts'
import {fameV4Level} from '../trading/fame-v4-trading.ts'

export const V4_RENAISSANCE_MS=60_000
export const V4_CHALLENGE_BOOST_MS=600_000
export type V4PrestigeSource='click'|'enterprise'|'dividend'
export type V4Destiny='trader'|'industrial'|'collector'
export type V4ChallengeSource='click'|'enterprise'

export interface V4ChallengeBoost {
  readonly slot:number
  readonly source:V4ChallengeSource
  readonly startedAt:number
  readonly endsAt:number
}
export interface FameV4PrestigeRun {
  readonly version:1
  readonly cycleExact:string
  readonly renaissanceRankAtStart:number
  /** This timestamp witnesses a new Prestige; absent in pre-pass-8 saves. */
  readonly renaissanceStartedAt:number|null
  readonly claimedChallenges:readonly number[]
  readonly challengeBoost:V4ChallengeBoost|null
  readonly specialization:V4Destiny|null
}
export interface V4ChallengeDefinition {
  readonly slot:number
  readonly source:V4ChallengeSource
  readonly target:bigint
  readonly description:string
}
export const V4_CHALLENGES:readonly V4ChallengeDefinition[]=Object.freeze([
  {slot:1,source:'click',target:100n,description:'Effectuer 100 clics sur ce cycle'},
  {slot:2,source:'enterprise',target:100_000_000n,description:'Gagner 1 M$ via les entreprises'},
  {slot:3,source:'click',target:250n,description:'Effectuer 250 clics sur ce cycle'},
  {slot:4,source:'enterprise',target:1_000_000_000n,description:'Gagner 10 M$ via les entreprises'},
  {slot:5,source:'click',target:500n,description:'Effectuer 500 clics sur ce cycle'},
  {slot:6,source:'enterprise',target:10_000_000_000n,description:'Gagner 100 M$ via les entreprises'},
  {slot:7,source:'click',target:1_000n,description:'Effectuer 1 000 clics sur ce cycle'},
  {slot:8,source:'enterprise',target:100_000_000_000n,description:'Gagner 1 B$ via les entreprises'},
  {slot:9,source:'click',target:2_500n,description:'Effectuer 2 500 clics sur ce cycle'},
  {slot:10,source:'enterprise',target:1_000_000_000_000n,description:'Gagner 10 B$ via les entreprises'},
])
const validAt=(state:V8CapitalState,at:number)=>
  Number.isSafeInteger(at)&&at>=state.ascension.run.startedAtRealMs&&
  at===state.enterprises.lastAccruedAt
const cycle=(state:V8CapitalState)=>
  state.ascension.progress.prestigeCountExact??String(state.ascension.progress.prestigeCount)

/** Pre-pass-8 snapshots never retroactively receive the opening Renaissance.
 * The new registry is initialized on the first explicit player action.
 */
export function v4PrestigeRun(state:V8CapitalState):FameV4PrestigeRun {
  return state.ascension.run.fameV4Prestige??{
    version:1,cycleExact:cycle(state),renaissanceRankAtStart:0,
    renaissanceStartedAt:null,claimedChallenges:[],challengeBoost:null,specialization:null,
  }
}
export function v4NewPrestigeRun(state:V8CapitalState,at:number,nextCycleExact:bigint):FameV4PrestigeRun {
  const rank=Math.min(5,fameV4Level(state,28))
  return {version:1,cycleExact:nextCycleExact.toString(),renaissanceRankAtStart:rank,
    renaissanceStartedAt:rank>0?at:null,claimedChallenges:[],challengeBoost:null,specialization:null}
}
export function v4ChallengeProgress(state:V8CapitalState,slot:number):bigint|null {
  const definition=V4_CHALLENGES[slot-1]
  if(!definition||definition.slot!==slot||fameV4Level(state,29)<slot)return null
  return definition.source==='click'?BigInt(state.stats.clickCount):
    v(state.stats.earnedBySource.enterprises)
}
export function v4ClaimChallenge(state:V8CapitalState,slot:number,at:number):V8CapitalState|null {
  if(!validAt(state,at))return null
  const definition=V4_CHALLENGES[slot-1],data=v4PrestigeRun(state)
  if(!definition||definition.slot!==slot||fameV4Level(state,29)<slot||
    data.claimedChallenges.includes(slot)||(data.challengeBoost&&data.challengeBoost.endsAt>at)||
    (v4ChallengeProgress(state,slot)??0n)<definition.target||
    !Number.isSafeInteger(at+V4_CHALLENGE_BOOST_MS))return null
  const challengeBoost:V4ChallengeBoost={
    slot,source:definition.source,startedAt:at,endsAt:at+V4_CHALLENGE_BOOST_MS,
  }
  const next:FameV4PrestigeRun={...data,claimedChallenges:[...data.claimedChallenges,slot].sort((a,b)=>a-b),
    challengeBoost}
  return {...state,ascension:{...state.ascension,run:{...state.ascension.run,fameV4Prestige:next}}}
}
export function v4SelectDestiny(state:V8CapitalState,destiny:V4Destiny,at:number):V8CapitalState|null {
  const data=v4PrestigeRun(state)
  if(!validAt(state,at)||fameV4Level(state,30)<1||
    !(['trader','industrial','collector'] as readonly string[]).includes(destiny)||
    data.specialization!==null)return null
  return {...state,ascension:{...state.ascension,run:{...state.ascension.run,
    fameV4Prestige:{...data,specialization:destiny}}}}
}
export function v4PrestigeBonusBps(state:V8CapitalState,source:V4PrestigeSource,at:number):number {
  const data=state.ascension.run.fameV4Prestige
  if(!data)return 0
  let bps=0
  const rank=data.renaissanceRankAtStart
  if((source==='click'||source==='enterprise')&&rank>0&&
    data.renaissanceStartedAt!==null&&
    at>=data.renaissanceStartedAt&&
    at<data.renaissanceStartedAt+rank*V4_RENAISSANCE_MS)bps+=2000
  const boost=data.challengeBoost
  if(boost&&(source===boost.source)&&at>=boost.startedAt&&at<boost.endsAt)bps+=500
  const destinyRank=fameV4Level(state,30)
  if(data.specialization==='industrial'&&source==='enterprise')bps+=destinyRank*200
  if(data.specialization==='collector')bps+=destinyRank*100
  return bps
}
/** Event boundaries prevent applying transient enterprise multipliers to an
 * entire offline interval. A permanent specialization has no expiry.
 */
export function v4NextPrestigeEvent(state:V8CapitalState,from:number,to:number):number {
  const data=state.ascension.run.fameV4Prestige
  if(!data)return to
  let end=to
  const renaissanceEnd=data.renaissanceStartedAt===null?null:
    data.renaissanceStartedAt+data.renaissanceRankAtStart*V4_RENAISSANCE_MS
  const challenge=data.challengeBoost
  for(const boundary of [renaissanceEnd,challenge?.startedAt??null,challenge?.endsAt??null])
    if(boundary!==null&&boundary>from&&boundary<end)end=boundary
  return end
}
export function v4PrestigeClickBoundaries(state:V8CapitalState,from:number,to:number):number[] {
  const data=state.ascension.run.fameV4Prestige
  const exhibition=state.prestige.fameV4Collections?.exhibition
  const candidates=[data?.renaissanceStartedAt??null,
    data?.renaissanceStartedAt!==null&&data?.renaissanceStartedAt!==undefined
      ?data.renaissanceStartedAt+data.renaissanceRankAtStart*V4_RENAISSANCE_MS:null,
    data?.challengeBoost?.startedAt??null,data?.challengeBoost?.endsAt??null,
    exhibition?.startedAt??null,exhibition?.endsAt??null]
  return candidates.filter((n):n is number=>n!==null&&n>from&&n<=to)
}
/** Trader reduces the actual charged fee, not the market quote or cost basis
 * already paid in a previous cycle. Fee remains at least one cent on trades.
 */
export function v4DiscountedTradeCost(
  state:V8CapitalState,quote:ExactFraction,units:bigint,decimals:number,
  feeBps:bigint,side:'buy'|'sell',
):ExactTradeCost|null {
  const raw=exactTradeCost(quote,units,decimals,feeBps,side)
  if(!raw)return null
  const data=state.ascension.run.fameV4Prestige
  const rank=data?.specialization==='trader'?fameV4Level(state,30):0
  if(rank<=0||raw.feeCents===0n)return raw
  const base=raw.feeCents
  const discounted=(base*BigInt(100-Math.min(3,rank)*2)+50n)/100n
  const fee=discounted<1n?1n:discounted
  return {...raw,feeCents:fee,
    totalCents:side==='buy'?raw.grossCents+fee:0n,
    proceedsCents:side==='sell'?raw.grossCents-fee:0n}
}
/** Maximum affordable quantity uses the exact *effective* fee after discount.
 * A conservative old-fee quote would silently short-change MAX orders.
 */
export function v4MaximumBuyUnits(
  state:V8CapitalState,cash:bigint,quote:ExactFraction,decimals:number,feeBps:bigint,
):bigint {
  if(cash<=0n||quote.numerator<=0n||quote.denominator<=0n||
    !Number.isSafeInteger(decimals)||decimals<0||decimals>100)return 0n
  const scale=10n**BigInt(decimals)
  let low=0n, high=cash*quote.denominator*scale/(quote.numerator*100n)
  while(low<high){
    const mid=low+(high-low+1n)/2n
    const value=v4DiscountedTradeCost(state,quote,mid,decimals,feeBps,'buy')
    if(value&&value.totalCents<=cash)low=mid
    else high=mid-1n
  }
  return low
}
