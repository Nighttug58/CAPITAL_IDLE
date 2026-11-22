import type { V8CapitalState } from './exact-state-v8.ts'
import {v8ClickBatch,v8AdvanceFiscalEconomy} from './exact-runtime-v8.ts'
import {getDollarAutoClickLevel} from './dollar-autoclick-v8.ts'
import {v4OverchargeExtraClicks,v4InitializeLegendary} from './prestige/fame-v4-clicks.ts'
import {v4PrestigeClickBoundaries} from './prestige/fame-v4-prestige.ts'

/** Real elapsed time, independent of foreground visibility and market replay.
 * Persist the reward and the cursor together; preserve partial seconds. */
export function v8AutoClickFrame(state:V8CapitalState,at:number,_foreground?:boolean):V8CapitalState {
  if(!Number.isSafeInteger(at)||at<state.ascension.run.startedAtRealMs)return state
  const level=getDollarAutoClickLevel(state)
  if(level<=0)return state
  const last=state.ascension.run.lastAutomationAtRealMs
  const from=last===undefined?at:Math.max(last,state.ascension.run.startedAtRealMs)
  if(at<from)return state
  const seconds=Math.floor((at-from)/1000)
  if(seconds===0 && last!==undefined)return state
  const end=from+seconds*1000
  // Split at transient Prestige and exhibition boundaries in whole-click
  // slots, not every elapsed second. The V4 bonus is evaluated at each tick
  // timestamp; e.g. a 3-minute Renaissance never multiplies all offline hours.
  const cuts=new Set<number>([0,seconds])
  for(const boundary of v4PrestigeClickBoundaries(state,from,end)){
    const ticksBefore=Math.max(0,Math.min(seconds,Math.floor((boundary-from-1)/1000)))
    cuts.add(ticksBefore)
  }
  const ranges=[...cuts].sort((a,b)=>a-b)
  let next=state
  for(let i=1;i<ranges.length;i++){
    const low=ranges[i-1]!,high=ranges[i]!
    if(high<=low)continue
    const fromAt=from+low*1000,untilAt=from+high*1000
    const ordinary=BigInt(high-low)*BigInt(level)
    const extra=v4OverchargeExtraClicks(state,fromAt,untilAt)
    next=v8ClickBatch(next,ordinary+extra,fromAt+1000)
  }
  return {...next,ascension:{...next.ascension,run:{...next.ascension.run,
    lastAutomationAtRealMs:end}}}
}

/** Shared passive-income settlement for boot, resume and purchases. */
export function v8SettlePassiveIncome(state:V8CapitalState,at:number):V8CapitalState {
  const settled=v8AdvanceFiscalEconomy(state,at)
  const result=v8AutoClickFrame(settled,at)
  return v4InitializeLegendary(result,at)
}
