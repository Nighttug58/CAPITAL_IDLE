import type { V8CapitalState } from './exact-state-v8.ts'
import {v8ClickBatch,v8AdvanceFiscalEconomy} from './exact-runtime-v8.ts'
import {getDollarAutoClickLevel} from './dollar-autoclick-v8.ts'

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
  const next=v8ClickBatch(state,BigInt(seconds)*BigInt(level))
  return {...next,ascension:{...next.ascension,run:{...next.ascension.run,
    lastAutomationAtRealMs:from+seconds*1000}}}
}

/** Shared passive-income settlement for boot, resume and purchases. */
export function v8SettlePassiveIncome(state:V8CapitalState,at:number):V8CapitalState {
  return v8AutoClickFrame(v8AdvanceFiscalEconomy(state,at),at)
}
