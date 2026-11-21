/** Per-asset news-triggered liquidation. Runs inside the exact V8 clock and
 * also on player-triggered news powers; never creates another market clock. */
import type { V8CapitalState, V8AutoSellReceipt } from '../exact-state-v8.ts'
import { getExactAmount as units } from '../exact-state-v8.ts'
import { getAsset } from './catalog.ts'
import { getNewsDirection } from './news.ts'
import { v8SellTrade } from '../exact-runtime-v8.ts'
import { formatDecimalUnits } from '../large-numbers.ts'
import { fameV4Level, minTrailingDrawdown } from './fame-v4-trading.ts'

export type NewsAutoSellTrigger = 'greenEnd' | 'redStart'
/** A closed position cannot be reopened by the market clock, so 96 recent
 * receipts cover the whole 45-asset portfolio of an offline session. */
export const MAX_AUTO_SELL_HISTORY=96

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
  const eligible=new Map<string,NewsAutoSellTrigger>()
  const previously=before.trading.dividendLastPaidAt

  for(const event of before.trading.news){
    const current=afterEvents.get(event.id)
    // Also catches an early close via the News powers modal.
    const endedAt=current?.endsAt??event.endsAt
    const wasLive=event.startedAt<=previously && event.endsAt>previously
    if(!wasLive || endedAt>at || getNewsDirection(current??event)!=='bullish')continue
    for(const id of event.affectedAssetIds)if(rules[id]?.greenEnd)eligible.set(id,'greenEnd')
  }
  for(const event of after.trading.news){
    const earlier=beforeEvents.get(event.id)
    const justTurnedRed=getNewsDirection(event)==='bearish' &&
      (!earlier||getNewsDirection(earlier)!=='bearish')
    if(!justTurnedRed||event.startedAt>at||event.endsAt<=at)continue
    for(const id of event.affectedAssetIds)if(rules[id]?.redStart)eligible.set(id,'redStart')
  }
  if(!eligible.size)return after

  let result=after
  for(const [id,trigger] of eligible){
    const asset=getAsset(id)
    const holding=result.trading.positions[id]
    if(!asset||!holding)continue
    const entry=result.trading.staking.positions[id]
    const reserved=entry?units(entry.locked)+units(entry.unlocking)+units(entry.awaitingCompound):0n
    const liquid=units(holding.quantity)-reserved
    if(liquid<=0n)continue
    // Reuse the only authoritative trading engine (fees, XP, Fame, taxes, cost basis).
    const order=v8SellTrade(result,id,formatDecimalUnits(liquid,asset.quantityDecimals,true))
    if(order.ok){
      const receipt:V8AutoSellReceipt={
        at,assetId:id,trigger,quantity:liquid.toString(),
        proceedsCents:order.cashDeltaCents.toString(),
        realizedNetProfitCents:order.realizedNetProfitCents.toString(),
        feeCents:order.feeCents.toString(),
      }
      // One bounded ledger append, in the same atomic economic transaction.
      result={...order.state,trading:{...order.state.trading,
        autoSellHistory:[...(result.trading.autoSellHistory??[]),receipt].slice(-MAX_AUTO_SELL_HISTORY)}}
    }
  }
  return result
}

/** All Fame V4 automated sales run AFTER existing news sales. No second clock.
 * The same exact order function handles staking, fees, taxes and XP once. */
export function applyFameV4AutoSells(state:V8CapitalState,at:number):V8CapitalState{
  let result=state
  const conf=state.trading.fameV4Trading
  if(!conf || (!Object.keys(conf.stops).length&&!Object.keys(conf.targets).length))return state
  const append=(next:V8CapitalState,id:string,trigger:V8AutoSellReceipt['trigger'],
    quantity:bigint,order:Extract<ReturnType<typeof v8SellTrade>,{ok:true}>):V8CapitalState=>{
    const receipt:V8AutoSellReceipt={at,assetId:id,trigger,quantity:quantity.toString(),
      proceedsCents:order.cashDeltaCents.toString(),
      realizedNetProfitCents:order.realizedNetProfitCents.toString(),feeCents:order.feeCents.toString()}
    return {...next,trading:{...next.trading,
      autoSellHistory:[...(next.trading.autoSellHistory??[]),receipt].slice(-MAX_AUTO_SELL_HISTORY)}}
  }
  const liquidFor=(s:V8CapitalState,id:string):bigint=>{
    const held=s.trading.positions[id]
    if(!held)return 0n
    const locked=s.trading.staking.positions[id]
    const reserved=locked?units(locked.locked)+units(locked.unlocking)+units(locked.awaitingCompound):0n
    const liquid=units(held.quantity)-reserved
    return liquid>0n?liquid:0n
  }
  if(fameV4Level(state,2)>0){
    for(const [id,stop] of Object.entries(conf.stops)){
      if(!stop.enabled || stop.drawdownPct<(minTrailingDrawdown(fameV4Level(result,2))??100))continue
      const asset=getAsset(id),holding=result.trading.positions[id]
      if(!asset||!holding)continue
      const price=result.trading.quotes[id]?.price??asset.referencePrice
      if(!Number.isFinite(price)||price<=0)continue
      const peak=Math.max(stop.peakPrice??price,price)
      if(peak!==stop.peakPrice){
        const data=result.trading.fameV4Trading!
        result={...result,trading:{...result.trading,fameV4Trading:{
          ...data,stops:{...data.stops,[id]:{...stop,peakPrice:peak}}}}}
      }
      if(price>peak*(1-stop.drawdownPct/100))continue
      const liquid=liquidFor(result,id)
      if(liquid<=0n)continue
      const order=v8SellTrade(result,id,formatDecimalUnits(liquid,asset.quantityDecimals,true))
      if(!order.ok)continue
      const data=order.state.trading.fameV4Trading!
      const stored=data.stops[id]??stop
      const disarmed:V8CapitalState={...order.state,trading:{...order.state.trading,
        fameV4Trading:{...data,stops:{...data.stops,[id]:{...stored,enabled:false,peakPrice:null}}}}}
      result=append(disarmed,id,'trailingStop',liquid,order)
    }
  }
  if(fameV4Level(state,7)>0){
    for(const [id,targets] of Object.entries(conf.targets)){
      const asset=getAsset(id)
      if(!asset)continue
      for(const target of targets){
        const live=result.trading.fameV4Trading?.targets[id]
        if(!live?.some(t=>t.slot===target.slot))continue
        const held=result.trading.positions[id],liquid=liquidFor(result,id)
        if(!held||liquid<=0n)break
        const amount=target.portionPct===100?liquid:liquid*BigInt(target.portionPct)/100n
        if(amount<=0n)continue
        const order=v8SellTrade(result,id,formatDecimalUnits(amount,asset.quantityDecimals,true))
        if(!order.ok)continue
        const baseline=units(held.costBasis)*amount/units(held.quantity)
        // Require a positive net gain even on zero-cost staking rewards.
        if(order.realizedNetProfitCents<=0n||
          (baseline>0n&&order.realizedNetProfitCents*100n<baseline*BigInt(target.gainPct)))continue
        const data=order.state.trading.fameV4Trading!
        const remaining=(data.targets[id]??[]).filter(t=>t.slot!==target.slot)
        const nextTargets={...data.targets}
        if(remaining.length)nextTargets[id]=remaining
        else delete nextTargets[id]
        const final:V8CapitalState={...order.state,trading:{...order.state.trading,
          fameV4Trading:{...data,targets:nextTargets}}}
        result=append(final,id,'profitTarget',amount,order)
      }
    }
  }
  return result
}
