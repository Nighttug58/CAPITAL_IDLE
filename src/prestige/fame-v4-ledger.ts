/** Pure V4 Fame ledger and purchase model. No V4 gameplay effects in pass 1. */
import { decodeExactInteger } from '../large-numbers.ts'
import { getVersionedPurchasedFameCost,getV9PurchasedFameCost } from './catalog.ts'
import { createEmptyFameV4Shop, fameV4NextCost, fameV4PurchasedCost,
 getFameV4Definition, type FameV4Id } from './fame-v4-catalog.ts'
import type { V8CapitalState } from '../exact-state-v8.ts'
export type FameV4PurchaseError =
 | 'unknown-boost' | 'stale-level' | 'max-level' | 'insufficient-fame'
 | 'invalid-state' | 'storage-error'
export type FameV4PurchaseResult =
 | {readonly ok:true} | {readonly ok:false; readonly error:FameV4PurchaseError}
export type FameV4MaxPurchaseResult =
 | {readonly ok:true; readonly levels:number; readonly costFame:bigint}
 | {readonly ok:false; readonly error:FameV4PurchaseError}
const MICROS=1_000_000n
/** Idempotent migration; use only after source V8 validation and V2 fame migration. */
export function migrateV8ToFameV4(state:V8CapitalState):V8CapitalState {
 if(state.prestige.fameV4!==undefined)return state
 if(state.prestige.xpCurveVersion!==4||state.prestige.fameShopLedgerVersion!==2)
  throw new RangeError('Fame V4 requires legacy V2 Fame ledger')
 return {...state,prestige:{...state.prestige,fameV4:createEmptyFameV4Shop()}}
}
/** Atomic upgrade prepared for Fame V4 UI: debits wallet and both Fame spending ledgers. */
export function v8BuyFameV4Upgrade(state:V8CapitalState,id:string,expectedLevel:number):V8CapitalState|null {
 const p=state.prestige
 const section=p.fameV4
 const item=getFameV4Definition(id)
 if(!section||section.version!==1||!item)return null
 const current=section.levels[item.id]
 const cost=fameV4NextCost(id,current)
 if(cost===null||current!==expectedLevel)return null
 const classic=state.version===9 ? getV9PurchasedFameCost(p.boosts) : getVersionedPurchasedFameCost(p.boosts,p.fameLegacyLevels!)
 const v4=fameV4PurchasedCost(section.levels)
 const fame=decodeExactInteger(p.fameMicros)
 const spent=decodeExactInteger(p.fameSpentMicros)
 const v4Spent=decodeExactInteger(section.spentMicros)
 const lifetime=decodeExactInteger(p.lifetimeFameMicros)
 const forfeited=decodeExactInteger(p.fameForfeitedMicros)
 if(classic===null||v4===null||fame===null||spent===null||v4Spent===null||
  lifetime===null||forfeited===null||v4Spent!==v4*MICROS||
  spent!==(classic+v4)*MICROS||lifetime!==fame+spent+forfeited||
  fame<cost*MICROS)return null
 return {...state,prestige:{...p,
   fameMicros:(fame-cost*MICROS).toString(),
   fameSpentMicros:(spent+cost*MICROS).toString(),
   fameV4:{version:1,levels:{...section.levels,[item.id]:current+1} as Record<FameV4Id,number>,
     spentMicros:(v4Spent+cost*MICROS).toString()},
 }}
}

/** Quote the largest affordable consecutive block of V4 ranks, with no state writes. */
export interface FameV4MaxQuote { readonly levels:number; readonly costFame:bigint }
export function quoteFameV4Max(state:V8CapitalState,id:string,expectedLevel:number):FameV4MaxQuote|null {
 const item=getFameV4Definition(id),section=state.prestige.fameV4
 if(!item||!section||section.version!==1||section.levels[item.id]!==expectedLevel||
  !Number.isSafeInteger(expectedLevel)||expectedLevel<0||expectedLevel>=item.maxLevel)return null
 const available=decodeExactInteger(state.prestige.fameMicros)
 if(available===null)return null
 const budget=available/MICROS
 const remaining=item.maxLevel-expectedLevel
 // O(remaining), max 15, and all arithmetic in BigInt.
 let spent=0n, levels=0
 for(let offset=0;offset<remaining;offset++){
  const price=fameV4NextCost(item.id,expectedLevel+offset)
  if(price===null||spent+price>budget)break
  spent+=price
  levels++
 }
 return levels>0?{levels,costFame:spent}:null
}
/** One exact V8 transaction, zero partial writes on failure or stale quotes. */
export function v8BuyFameV4UpgradeMax(state:V8CapitalState,id:string,expectedLevel:number):V8CapitalState|null {
 const quote=quoteFameV4Max(state,id,expectedLevel)
 if(!quote)return null
 const p=state.prestige,section=p.fameV4!
 const classic=state.version===9 ? getV9PurchasedFameCost(p.boosts) : getVersionedPurchasedFameCost(p.boosts,p.fameLegacyLevels!)
 const v4=fameV4PurchasedCost(section.levels)
 const fame=decodeExactInteger(p.fameMicros),spent=decodeExactInteger(p.fameSpentMicros)
 const v4Spent=decodeExactInteger(section.spentMicros)
 const lifetime=decodeExactInteger(p.lifetimeFameMicros),forfeited=decodeExactInteger(p.fameForfeitedMicros)
 const cost=quote.costFame*MICROS
 if(classic===null||v4===null||fame===null||spent===null||v4Spent===null||
  lifetime===null||forfeited===null||v4Spent!==v4*MICROS||
  spent!==(classic+v4)*MICROS||lifetime!==fame+spent+forfeited||cost>fame)return null
 const item=getFameV4Definition(id)!
 return {...state,prestige:{...p,
  fameMicros:(fame-cost).toString(),
  fameSpentMicros:(spent+cost).toString(),
  fameV4:{version:1,levels:{...section.levels,[item.id]:expectedLevel+quote.levels},
   spentMicros:(v4Spent+cost).toString()},
 }}
}
