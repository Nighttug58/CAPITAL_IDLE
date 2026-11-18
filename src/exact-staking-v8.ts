/** V8 crypto staking in integer smallest token units, never Number units. */
import type { V8CapitalState,V8StakingEntry,V8Position } from './exact-state-v8.ts'
import { getExactAmount as v, withExactAmount as s } from './exact-state-v8.ts'
import { quantityStringToUnits, quoteToExactFraction } from './exact-trading.ts'
import { getAsset } from './trading/catalog.ts'
import { stakingBaseRate, STAKING_COMPOUND_MS, STAKING_OFFLINE_CAP_MS, STAKING_UNLOCK_MS } from './trading/staking.ts'
import {transcendentEconomicBps} from './ascension/transcendent-v1.ts'
import { collectionV3Snapshot } from './prestige/collections-v3.ts'

const PICO=1_000_000_000_000n
const HOUR_MS=3_600_000n
const emptyEntry=():V8StakingEntry=>({ locked:'0',unlocking:'0',unlockAt:null,
  awaitingCompound:'0',rewardHeld:'0',rewardLocked:'0',rewardUnlocking:'0',
  carryUnits:0,carryPicoUnits:'0',lifetimeRewards:'0' })
const min=(a:bigint,b:bigint)=>a<b?a:b
const max=(a:bigint,b:bigint)=>a>b?a:b

/** 24h offline cap and auto-compound each real 10min interval. */
export function v8SettleStaking(state:V8CapitalState,at:number):V8CapitalState {
  const source=state.trading.staking
  if(state.ascension.progress.upgradeLevels['crypto-staking']<1 ||
    !Object.keys(source.positions).length ||!Number.isSafeInteger(at)||at<=source.lastAccruedAt)return state
  const start=Math.max(source.lastAccruedAt,at-STAKING_OFFLINE_CAP_MS)
  const autoCompound=state.ascension.progress.upgradeLevels['auto-compound']>0
  const level=state.ascension.progress.upgradeLevels['staking-yield']
  const rentierBps=transcendentEconomicBps(state.ascension.progress,'rentier')+
    collectionV3Snapshot(state.prestige.ownedCollectionIds).museumIncomeBps
  const positions:{[key:string]:V8Position}={...state.trading.positions}
  const locks:{[key:string]:V8StakingEntry}={}
  for(const [id,old]of Object.entries(source.positions)){
    const asset=getAsset(id)
    const held=positions[id]
    if(!asset || !stakingBaseRate(id)||!held)return state
    let q=v(held.quantity)
    let previous=start
    let current={...old}
    // e.g. 0.04% per hour = 4 / 10 000; staking bonus +10%/level.
    const rate=quoteToExactFraction(stakingBaseRate(id))!
    // Classic staking +10% per level, Rentier +0.2% per level; additive
    // to the base reward, not compounded on holdings or principal.
    const denominator=rate.denominator*100n*HOUR_MS*10_000n
    const multiplier=rate.numerator*BigInt(10_000+level*1_000+rentierBps)
    let carry=current.carryPicoUnits===undefined?
      BigInt(Math.round(current.carryUnits*Number(PICO))):v(current.carryPicoUnits)
    while(previous<at){
      const boundary=(Math.floor(previous/STAKING_COMPOUND_MS)+1)*STAKING_COMPOUND_MS
      const end=Math.min(at,boundary)
      const delta=BigInt(end-previous)
      // numerator is in 10^-12 of a minimum tradable unit.
      const rawPico=v(current.locked)*multiplier*delta*PICO/denominator+carry
      const reward=rawPico/PICO
      carry=rawPico%PICO
      const minted=reward
      if(minted>0n){
        q+=minted
        current.lifetimeRewards=s(v(current.lifetimeRewards)+minted)
        current.rewardHeld=s(v(current.rewardHeld)+minted)
        if(autoCompound)current.awaitingCompound=s(v(current.awaitingCompound)+minted)
      }
      if(autoCompound && end===boundary && v(current.awaitingCompound)>0n){
        const compound=v(current.awaitingCompound)
        current.locked=s(v(current.locked)+compound)
        current.rewardLocked=s(v(current.rewardLocked)+compound)
        current.awaitingCompound='0'
      }
      previous=end
    }
    current.carryPicoUnits=s(carry)
    current.carryUnits=Number(carry)/Number(PICO)
    if(current.unlockAt!==null && at>=current.unlockAt){
      current.unlocking='0';current.rewardUnlocking='0';current.unlockAt=null
    }
    locks[id]=current
    positions[id]=q===v(held.quantity)?held:{...held,quantity:s(q)}
  }
  return {...state,trading:{...state.trading,positions,staking:{lastAccruedAt:at,positions:locks}}}
}

export type V8StakingResult = {ok:true;state:V8CapitalState;unlockAt:number|null} | {ok:false;reason:string}
export function v8ChangeStaking(state:V8CapitalState, action:'deposit'|'withdraw',
  id:string, quantity:string, at:number):V8StakingResult {
  if(!state.ascension.progress.upgradeLevels['crypto-staking'])return{ok:false,reason:'locked'}
  const asset=getAsset(id)
  if(!asset || !stakingBaseRate(id))return{ok:false,reason:'not-eligible'}
  const units=quantityStringToUnits(quantity,asset.quantityDecimals)
  if(units===null || units<=0n)return{ok:false,reason:'invalid-quantity'}
  if(!Number.isSafeInteger(at)||at<state.trading.staking.lastAccruedAt ||
    at<state.trading.dividendLastPaidAt || at<state.ascension.run.startedAtRealMs)
    return{ok:false,reason:'invalid-time'}
  const settled=v8SettleStaking(state,at)
  const position=settled.trading.positions[id]
  if(!position)return{ok:false,reason:'not-owned'}
  const entry=settled.trading.staking.positions[id]??emptyEntry()
  let next:V8StakingEntry
  if(action==='deposit'){
    const available=v(position.quantity)-v(entry.locked)-v(entry.unlocking)-v(entry.awaitingCompound)
    if(units>available)return{ok:false,reason:'insufficient-liquid'}
    const boughtLiquid=max(0n,v(position.quantity)-v(entry.rewardHeld)-
      (v(entry.locked)-v(entry.rewardLocked))-(v(entry.unlocking)-v(entry.rewardUnlocking)))
    const rewardPart=max(0n,units-boughtLiquid)
    next={...entry,locked:s(v(entry.locked)+units),rewardLocked:s(v(entry.rewardLocked)+rewardPart)}
  }else{
    if(v(entry.unlocking)>0n)return{ok:false,reason:'withdraw-pending'}
    if(units>v(entry.locked))return{ok:false,reason:'insufficient-staked'}
    const rewardPart=min(units,v(entry.rewardLocked))
    next={...entry,locked:s(v(entry.locked)-units),rewardLocked:s(v(entry.rewardLocked)-rewardPart),
      unlocking:s(units),rewardUnlocking:s(rewardPart),unlockAt:at+STAKING_UNLOCK_MS}
  }
  return {ok:true,unlockAt:next.unlockAt,state:{...settled,trading:{...settled.trading,
    staking:{lastAccruedAt:at,positions:{...settled.trading.staking.positions,[id]:next}}}}}
}
