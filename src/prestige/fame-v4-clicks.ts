/** Fame V4 click powers 19–23: isolated manual state and exact real-time guards.
 * A manual click is the ONLY path that can progress Frenzy, Charged or Chain.
 * No money or XP is credited in this file; exact runtime owns all rewards.
 */
import type {V8CapitalState} from '../exact-state-v8.ts'
import {fameV4Level} from '../trading/fame-v4-trading.ts'
import {getDollarAutoClickLevel} from '../dollar-autoclick-v8.ts'

export const FRENZY_WINDOW_MS=3000
export const CHARGED_IDLE_MS=15_000
export const LEGENDARY_COUNTS=[0,5,10,15,20,30] as const
export const LEGENDARY_INTERVALS_MS=[0,900_000,750_000,600_000,450_000,300_000] as const
export const OVERCHARGE_COOLDOWN_MS=900_000
export const OVERCHARGE_MS_PER_RANK=4000
export interface FameV4Overcharge {
  startedAt:number
  endsAt:number
  readyAt:number
}
export interface FameV4ClickState {
  version:1
  manualTimestamps:number[]
  lastManualAt:number|null
  lastManualActiveMs:number|null
  frenzyUntil:number
  legendaryAnchorAt:number|null
  overcharge:FameV4Overcharge|null
  chainSeed:number
  chainRolls:number
}
export function emptyFameV4Clicks():FameV4ClickState {
  return {version:1,manualTimestamps:[],lastManualAt:null,lastManualActiveMs:null,
    frenzyUntil:0,legendaryAnchorAt:null,overcharge:null,chainSeed:0,chainRolls:0}
}
export function fameV4Clicks(state:V8CapitalState):FameV4ClickState{
  return state.ascension.run.fameV4Clicks??emptyFameV4Clicks()
}
const rank=(s:V8CapitalState,n:number)=>fameV4Level(s,n)
const update=(state:V8CapitalState,data:FameV4ClickState):V8CapitalState=>({
  ...state,ascension:{...state.ascension,run:{...state.ascension.run,fameV4Clicks:data}}
})
const safeAt=(state:V8CapitalState,at:number):boolean=>
  Number.isSafeInteger(at)&&at>=state.ascension.run.startedAtRealMs&&
  at>=state.enterprises.lastAccruedAt
/** When an already-owned legendary power appears in an older save, first
 * observation starts its cooldown; it never pays accumulated offline items.
 */
export function v4InitializeLegendary(state:V8CapitalState,at:number):V8CapitalState{
  if(rank(state,20)<1||!safeAt(state,at))return state
  const data=fameV4Clicks(state)
  return data.legendaryAnchorAt===null?
    update(state,{...data,legendaryAnchorAt:at}):state
}
export function legendaryReadyAt(state:V8CapitalState):number|null{
  const r=rank(state,20),anchor=state.ascension.run.fameV4Clicks?.legendaryAnchorAt
  if(r<1||anchor===null||anchor===undefined)return null
  const result=anchor+LEGENDARY_INTERVALS_MS[r]!
  return Number.isSafeInteger(result)?result:null
}
export function v4LegendaryRewardClicks(state:V8CapitalState,at:number):
  {state:V8CapitalState;count:number}|null{
  if(!safeAt(state,at))return null
  const due=legendaryReadyAt(state)
  const r=rank(state,20)
  if(due===null||at<due||r<1)return null
  const data=fameV4Clicks(state)
  return {state:update(state,{...data,legendaryAnchorAt:at}),count:LEGENDARY_COUNTS[r]!}
}
/** Explicit foreground-only activation. Cannot manufacture an Auto Click at
 * rank zero. Do not repay a cooldown, regardless of refresh or Prestige.
 */
export function v4ActivateOvercharge(state:V8CapitalState,at:number):V8CapitalState|null{
  const r=rank(state,21),data=fameV4Clicks(state)
  if(r<1||getDollarAutoClickLevel(state)<1||!safeAt(state,at)||
    (data.overcharge!==null&&at<data.overcharge.readyAt))return null
  const endsAt=at+r*OVERCHARGE_MS_PER_RANK,readyAt=at+OVERCHARGE_COOLDOWN_MS
  if(!Number.isSafeInteger(endsAt)||!Number.isSafeInteger(readyAt))return null
  return update(state,{...data,overcharge:{startedAt:at,endsAt,readyAt}})
}
/** +50% Auto Click frequency. Exact integer count from a half-rate pulse
 * anchored at activation; subtracting cumulative floors makes split/combined
 * replay equivalent even across sub-second cursors and offline reloads.
 */
export function v4OverchargeExtraClicks(state:V8CapitalState,from:number,to:number):bigint{
  const e=state.ascension.run.fameV4Clicks?.overcharge
  const level=getDollarAutoClickLevel(state)
  if(!e||rank(state,21)<1||level<1||to<=from)return 0n
  const a=Math.max(e.startedAt,Math.min(e.endsAt,from))
  const b=Math.max(e.startedAt,Math.min(e.endsAt,to))
  if(b<=a)return 0n
  return BigInt(b-e.startedAt)*BigInt(level)/2000n-
    BigInt(a-e.startedAt)*BigInt(level)/2000n
}
function nextSeed(seed:number):number{
  let x=(seed>>>0)||0x9e3779b9
  x^=x<<13
  x^=x>>>17
  x^=x<<5
  return x>>>0
}
export interface FameV4ManualPlan {
  state:V8CapitalState
  manualMultiplierBps:number
  chainBonusClicks:number
  frenzyActive:boolean
  charged:boolean
}
/** activeMs counts *foreground* play only. It does not advance while closed,
 * hidden or offline, so Charged Click cannot accumulate a hidden charge.
 */
export function v4PrepareManualClick(state:V8CapitalState,at:number,activeMs:number):FameV4ManualPlan|null{
  if(!safeAt(state,at)||!Number.isSafeInteger(activeMs)||activeMs<state.stats.activePlayMs)return null
  const data=fameV4Clicks(state)
  if(data.lastManualAt!==null&&at<data.lastManualAt)return null
  if(data.lastManualActiveMs!==null&&activeMs<data.lastManualActiveMs)return null
  const frenzyRank=rank(state,19),chargeRank=rank(state,22),chainRank=rank(state,23)
  const window=frenzyRank>0?[
    ...data.manualTimestamps.filter(x=>x>=at-FRENZY_WINDOW_MS&&x<=at),at].slice(-10):[]
  const streak=frenzyRank>0&&window.length>=10
  const frenzyUntil=streak?at+FRENZY_WINDOW_MS:
    data.frenzyUntil>at&&data.lastManualAt!==null&&at-data.lastManualAt<=FRENZY_WINDOW_MS
      ?at+FRENZY_WINDOW_MS:0
  if(!Number.isSafeInteger(frenzyUntil))return null
  const frenzyActive=frenzyRank>0&&frenzyUntil>at
  const charged=chargeRank>0&&data.lastManualActiveMs!==null&&
    activeMs-data.lastManualActiveMs>=CHARGED_IDLE_MS
  const multiplier=charged?Math.min(20,2*chargeRank):1
  let seed=data.chainSeed||((state.trading.seed^at)>>>0)||0x9e3779b9
  let bonusClicks=0
  if(chainRank>0){
    seed=nextSeed(seed)
    if(seed%10_000<chainRank*50){
      seed=nextSeed(seed)
      bonusClicks=3+seed%3
    }
  }
  const updated=update(state,{
    ...data,manualTimestamps:window,lastManualAt:at,lastManualActiveMs:activeMs,
    frenzyUntil,chainSeed:seed,chainRolls:data.chainRolls+(chainRank>0?1:0),
  })
  return {state:updated,manualMultiplierBps:multiplier*10_000+
    (frenzyActive?frenzyRank*250:0),chainBonusClicks:bonusClicks,
    frenzyActive,charged}
}
