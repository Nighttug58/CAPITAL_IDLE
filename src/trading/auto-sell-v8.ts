/** Per-asset news-triggered liquidation. Runs inside the exact V8 clock and
 * also on player-triggered news powers; never creates another market clock. */
import type { V8CapitalState } from '../exact-state-v8.ts'
import { getExactAmount as units } from '../exact-state-v8.ts'
import { getAsset } from './catalog.ts'
import { getNewsDirection } from './news.ts'
import { v8SellTrade } from '../exact-runtime-v8.ts'
import { formatDecimalUnits } from '../large-numbers.ts'

export type NewsAutoSellTrigger = 'greenEnd' | 'redStart'

export function setNewsAutoSellRule(
  state:V8CapitalState,assetId:string,trigger:NewsAutoSellTrigger,enabled:boolean,
):V8CapitalState|null {
  if(!getAsset(assetId)||!['greenEnd','redStart'].includes(trigger)||typeof enabled!=='boolean')return null
  const existing=state.trading.autoSellRules?.[assetId]??{greenEnd:false,redStart:false}
  if(existing[trigger]===enabled)return state
  const updated={...existing,[trigger]:enabled}
  const autoSellRules={...state.trading.autoSellRules}
  if(!updated.greenEnd&&!updated.redStart)delete autoSellRules[assetId]
  else autoSellRules[assetId]=updated
  return {...state,trading:{...state.trading,autoSellRules}}
}

/** Compare persisted news snapshots, not timers or UI watches. This guarantees
 * one liquidation per new trigger during live ticks and offline catch-up. */
export function applyNewsAutoSells(before:V8CapitalState,after:V8CapitalState,at:number):V8CapitalState {
  const rules=before.trading.autoSellRules
  if(!rules||!Object.keys(rules).length)return after
  const beforeEvents=new Map(before.trading.news.map(event=>[event.id,event]))
  const afterEvents=new Map(after.trading.news.map(event=>[event.id,event]))
  const eligible=new Set<string>()
  const previously=before.trading.dividendLastPaidAt

  for(const event of before.trading.news){
    const current=afterEvents.get(event.id)
    // Also catches an early close via the News powers modal.
    const endedAt=current?.endsAt??event.endsAt
    const wasLive=event.startedAt<=previously && event.endsAt>previously
    if(!wasLive || endedAt>at || getNewsDirection(current??event)!=='bullish')continue
    for(const id of event.affectedAssetIds)if(rules[id]?.greenEnd)eligible.add(id)
  }
  for(const event of after.trading.news){
    const earlier=beforeEvents.get(event.id)
    const justTurnedRed=getNewsDirection(event)==='bearish' &&
      (!earlier||getNewsDirection(earlier)!=='bearish')
    if(!justTurnedRed||event.startedAt>at||event.endsAt<=at)continue
    for(const id of event.affectedAssetIds)if(rules[id]?.redStart)eligible.add(id)
  }
  if(!eligible.size)return after

  let result=after
  for(const id of eligible){
    const asset=getAsset(id)
    const holding=result.trading.positions[id]
    if(!asset||!holding)continue
    const entry=result.trading.staking.positions[id]
    const reserved=entry?units(entry.locked)+units(entry.unlocking)+units(entry.awaitingCompound):0n
    const liquid=units(holding.quantity)-reserved
    if(liquid<=0n)continue
    // Reuse the only authoritative trading engine (fees, XP, Fame, taxes, cost basis).
    const order=v8SellTrade(result,id,formatDecimalUnits(liquid,asset.quantityDecimals,true))
    if(order.ok)result=order.state
  }
  return result
}
