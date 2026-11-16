import type { V8CapitalState } from './exact-state-v8.ts'
import {v8Click} from './exact-runtime-v8.ts'
import {getDollarAutoClickLevel} from './dollar-autoclick-v8.ts'
export function v8AutoClickFrame(state:V8CapitalState,at:number,foreground:boolean):V8CapitalState{
 if(!foreground||!Number.isSafeInteger(at)||at<state.ascension.run.startedAtRealMs||
   at<state.trading.dividendLastPaidAt||at<state.enterprises.lastAccruedAt||
   at-state.trading.dividendLastPaidAt>=1000||at-state.enterprises.lastAccruedAt>=1000)return state
 const clickLevel=getDollarAutoClickLevel(state)
 const autoclick=clickLevel>0
 if(!autoclick)return state
 let updated=state
 const seconds=Math.floor(at/1000)*1000
 const lastClick=state.ascension.run.lastAutomationAtRealMs
 if(autoclick && (lastClick===undefined || seconds>lastClick)){
   // Never simulate missed real seconds. In a continuously visible session,
   // earn exactly one batch of [rank] ordinary clicks each elapsed second.
   if(lastClick!==undefined && seconds-lastClick===1000 &&
       state.stats.clickCount<=Number.MAX_SAFE_INTEGER-clickLevel){
     for(let n=0;n<clickLevel;n++)updated=v8Click(updated)
   }
   updated={...updated,ascension:{...updated.ascension,run:{...updated.ascension.run,
     lastAutomationAtRealMs:seconds}}}
 }
 return updated
}
