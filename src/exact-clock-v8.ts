/** Single timer for the active V8 runtime. Never advances monetary state with
 * V7 Number functions; batch replay remains bounded for mobile responsiveness. */
import type { V8CapitalState } from './exact-state-v8.ts'
import {v8AdvanceFiscalEconomy} from './exact-runtime-v8.ts'
import {v8SettleStaking} from './exact-staking-v8.ts'
import {v8AdvanceMarketSecond} from './exact-market-v8.ts'
import {v8AutomationFrame} from './exact-automation-v8.ts'

const SAVE_INTERVAL_MS=5000
const REPLAY_PAUSE_MS=16
const MAX_CATCH_UP_SECONDS=256
const MARKET_HISTORY_MS=3_600_000

export interface V8RuntimeOptions {
 getState:()=>V8CapitalState
 setState:(state:V8CapitalState)=>void
 persist:()=>boolean|void
 now?:()=>number
 schedule?:(cb:()=>void,delay:number)=>ReturnType<typeof setTimeout>
 cancel?:(handle:ReturnType<typeof setTimeout>)=>void
 isForeground?:()=>boolean
}

export function catchUpV8(state:V8CapitalState,now:number,maxSeconds=MAX_CATCH_UP_SECONDS){
 const last=state.trading.dividendLastPaidAt
 if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(last)||now<=last)
   return{state,processedSeconds:0,pendingSeconds:0}
 const available=Math.floor((now-last)/1000)
 const budget=Number.isFinite(maxSeconds)?Math.max(0,Math.min(MAX_CATCH_UP_SECONDS,Math.floor(maxSeconds))):0
 const count=Math.min(available,budget)
 if(count===0)return{state,processedSeconds:0,pendingSeconds:available}
 let updated=state
 let processedSeconds=0
 const cutoff=now-MARKET_HISTORY_MS
 for(let i=0;i<count;i++){
   const nextSecond=updated.trading.dividendLastPaidAt+1000
   const result=v8AdvanceMarketSecond(updated,nextSecond>cutoff)
   if(result===updated)break
   updated=result
   processedSeconds++
 }
 return{state:updated,processedSeconds,pendingSeconds:available-processedSeconds}
}

export function createV8MarketRuntime(options:V8RuntimeOptions){
 const now=options.now??Date.now
 const schedule=options.schedule??((callback,ms)=>setTimeout(callback,ms))
 const cancel=options.cancel??clearTimeout
 let started=false,paused=false,processing=false,dirty=false,lastPersistedAt=0
 let timer:ReturnType<typeof setTimeout>|null=null
 const clear=()=>{if(timer!==null){cancel(timer);timer=null}}
 function saveIfDirty(force=false){
   if(!dirty)return
   const timestamp=now()
   if(!force&&timestamp-lastPersistedAt<SAVE_INTERVAL_MS)return
   try{if(options.persist()===false)return}catch{return}
   lastPersistedAt=timestamp;dirty=false
 }
 function process(){
   if(!started||paused||processing)return
   clear();processing=true
   try{
     const timestamp=now()
     const current=options.getState()
     const business=v8AdvanceFiscalEconomy(current,timestamp)
     const staked=v8SettleStaking(business,timestamp)
     const replay=catchUpV8(staked,timestamp)
     const final=replay.pendingSeconds===0?
       v8AutomationFrame(replay.state,timestamp,options.isForeground?.()??true):replay.state
     if(final!==current){options.setState(final);dirty=true}
     saveIfDirty(replay.pendingSeconds===0)
     if(!started||paused)return
     const delay=replay.pendingSeconds>0?REPLAY_PAUSE_MS:
       Math.max(50,Math.min(1000,final.trading.dividendLastPaidAt+1000-timestamp))
     timer=schedule(process,delay)
   }finally{processing=false}
 }
 function start(){if(started)return;started=true;paused=false;process()}
 function pause(){if(!started||paused)return;paused=true;clear();saveIfDirty(true)}
 function resume(){if(!started||!paused)return;paused=false;process()}
 function wake(){if(started&&!paused)process()}
 function stop(){if(!started)return;started=false;paused=false;clear();saveIfDirty(true)}
 return{start,pause,resume,wake,stop}
}
