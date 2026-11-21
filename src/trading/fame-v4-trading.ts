/** Fame Trading V4: pure per-asset controls and observed market analytics.
 * No separate clock, wallet, random draw or economic write in this module.
 */
import type { V8CapitalState, V8TradingState } from '../exact-state-v8.ts'
import { getExactAmount as v } from '../exact-state-v8.ts'
import { ASSETS, getAsset } from './catalog.ts'
import { quoteToExactFraction } from '../exact-trading.ts'
import { getNewsDirection } from './news.ts'

export interface V4TrailingStop { enabled:boolean; drawdownPct:number; peakPrice:number|null }
export interface V4ProfitTarget { slot:number; gainPct:number; portionPct:25|50|75|100 }
export interface V4ObservedNews {
  id:string; templateId:string; startedAt:number; endsAt:number
  recordedAt:number; closedAt?:number; direction:'bullish'|'bearish'|'neutral'
  startPrices:Record<string,number>; endPrices?:Record<string,number>
}
export interface FameV4TradingState {
  version:1
  stops:Record<string,V4TrailingStop>
  targets:Record<string,V4ProfitTarget[]>
  newsLog:V4ObservedNews[]
}
const percentByLevel=[25,20,15,10,5] as const
const portions=[25,50,75,100] as const
export function fameV4Level(state:V8CapitalState,n:number):number {
  const id='fame-v4-'+String(n).padStart(2,'0') as keyof NonNullable<V8CapitalState['prestige']['fameV4']>['levels']
  return state.prestige.fameV4?.levels[id]??0
}
export function emptyFameV4Trading():FameV4TradingState{
  return {version:1,stops:{},targets:{},newsLog:[]}
}
export function minTrailingDrawdown(level:number):number|null {
  return level>=1&&level<=5 ? percentByLevel[level-1]! : null
}
export function allowedTargetPortions(level:number):readonly number[] {
  return portions.filter(x=>level>=4||x<=level*25)
}
export function setFameV4TrailingStop(state:V8CapitalState,id:string,enabled:boolean,drawdownPct:number):V8CapitalState|null{
  const item=getAsset(id),min=minTrailingDrawdown(fameV4Level(state,2))
  if(!item||min===null||typeof enabled!=='boolean'||!percentByLevel.includes(drawdownPct as typeof percentByLevel[number])||
    drawdownPct<min)return null
  const old=state.trading.fameV4Trading??emptyFameV4Trading()
  const stop=old.stops[id]
  if(!enabled&&!stop)return state
  const quote=state.trading.quotes[id]?.price??item.referencePrice
  if(!Number.isFinite(quote)||quote<=0)return null
  const stops={...old.stops}
  if(enabled)stops[id]={enabled:true,drawdownPct,peakPrice:state.trading.positions[id]?quote:null}
  else delete stops[id]
  return {...state,trading:{...state.trading,fameV4Trading:{...old,stops}}}
}
export function setFameV4ProfitTarget(state:V8CapitalState,id:string,slot:number,gainPct:number|null,portionPct:number):V8CapitalState|null{
  const level=fameV4Level(state,7),item=getAsset(id)
  const slots=level===5?3:level>0?1:0
  if(!item||!Number.isSafeInteger(slot)||slot<0||slot>=slots)return null
  const old=state.trading.fameV4Trading??emptyFameV4Trading()
  const entries=(old.targets[id]??[]).filter(x=>x.slot!==slot)
  if(gainPct!==null){
    if(!Number.isSafeInteger(gainPct)||gainPct<1||gainPct>10000||
      !allowedTargetPortions(level).includes(portionPct))return null
    entries.push({slot,gainPct,portionPct:portionPct as 25|50|75|100})
    entries.sort((a,b)=>a.slot-b.slot)
  }
  const targets={...old.targets}
  if(entries.length)targets[id]=entries
  else delete targets[id]
  return {...state,trading:{...state.trading,fameV4Trading:{...old,targets}}}
}
/** A new acquisition starts a fresh peak; full exit clears its pending targets. */
export function onFameV4PositionChange(trading:V8TradingState,id:string,kind:'buy'|'soldAll'):V8TradingState{
  const data=trading.fameV4Trading
  if(!data || (!data.stops[id] && !(kind==='soldAll'&&data.targets[id])))return trading
  const stops={...data.stops},targets={...data.targets}
  if(stops[id]){
    const item=getAsset(id)
    const price=trading.quotes[id]?.price??item?.referencePrice??0
    stops[id]={...stops[id],peakPrice:kind==='buy'&&Number.isFinite(price)&&price>0?price:null}
  }
  if(kind==='soldAll')delete targets[id]
  return {...trading,fameV4Trading:{...data,stops,targets}}
}
/** Values in exact cents; a position must represent 1% of the stock portfolio. */
export function eligibleDiversifiedStocks(state:V8CapitalState):number{
  if(fameV4Level(state,5)===0)return 0
  const positions:bigint[]=[]
  for(const asset of ASSETS){
    if(asset.kind!=='stock')continue
    const holding=state.trading.positions[asset.id]
    if(!holding)continue
    const quote=quoteToExactFraction(state.trading.quotes[asset.id]?.price??asset.referencePrice)
    if(!quote)continue
    const worth=v(holding.quantity)*quote.numerator*100n/(quote.denominator*10n**BigInt(asset.quantityDecimals))
    if(worth>0n)positions.push(worth)
  }
  const total=positions.reduce((a,b)=>a+b,0n)
  return total>0n?positions.filter(x=>x*100n>=total).length:0
}
export function v4DividendBonusBps(state:V8CapitalState):number{
  const direct=fameV4Level(state,3)*100
  const diverse=Math.min(fameV4Level(state,5)*100,eligibleDiversifiedStocks(state)*50)
  return Math.min(4500,direct+diverse)
}
/** Historic price samples are *observations*; this is never a price forecast. */
export function fameV4Trend(state:V8CapitalState,id:string):{
 windowSeconds:number;variationPct:number;recentPct:number;earlierPct:number;signal:'acceleration'|'ralentissement'|'stable'
}|null {
  const level=fameV4Level(state,1), asset=getAsset(id)
  if(!asset||level<1)return null
  const now=state.trading.dividendLastPaidAt,windowSeconds=level*30
  const start=now-windowSeconds*1000
  const recent=(state.trading.history[id]??[]).filter(x=>x.at>=start&&x.at<=now)
  const quote=state.trading.quotes[id]
  if(quote&&quote.updatedAt<=now&&(!recent.length||quote.updatedAt>recent[recent.length-1]!.at))recent.push({at:quote.updatedAt,price:quote.price})
  if(recent.length<3)return null
  const mid=recent[Math.floor(recent.length/2)]!,first=recent[0]!,last=recent[recent.length-1]!
  if(first.price<=0||mid.price<=0||last.price<=0)return null
  const earlierPct=(mid.price/first.price-1)*100,recentPct=(last.price/mid.price-1)*100
  return {windowSeconds,variationPct:(last.price/first.price-1)*100,earlierPct,recentPct,
    signal:Math.abs(recentPct-earlierPct)<0.05?'stable':
      recentPct>earlierPct?'acceleration':'ralentissement'}
}
function seenPrices(trading:V8TradingState,ids:readonly string[]):Record<string,number>{
  return Object.fromEntries(ids.flatMap(id=>{
    const asset=getAsset(id)
    if(!asset)return []
    const price=trading.quotes[id]?.price??asset.referencePrice
    return Number.isFinite(price)&&price>0?[[id,price]]:[]
  }))
}
/** Bounded 100-item news journal, starts tracking only after unlock. */
export function observeFameV4News(before:V8CapitalState,after:V8CapitalState,at:number):V8CapitalState{
  if(fameV4Level(after,6)<1)return after
  const old=after.trading.fameV4Trading??emptyFameV4Trading()
  let records=old.newsLog
  let changed=false
  const byId=new Map(records.map((row,i)=>[row.id,i]))
  for(const event of after.trading.news){
    if(event.startedAt>at||event.endsAt<=at||!event.affectedAssetIds.length||byId.has(event.id))continue
    const row:V4ObservedNews={id:event.id,templateId:event.templateId,
      startedAt:event.startedAt,endsAt:event.endsAt,recordedAt:at,
      direction:getNewsDirection(event),startPrices:seenPrices(after.trading,event.affectedAssetIds)}
    records=[...records,row].slice(-100);changed=true
    byId.clear();records.forEach((r,i)=>byId.set(r.id,i))
  }
  // A manually terminated News can disappear from the live set before its
  // recorded expiry. Close against the last actually observed quote, once.
  if(records.some(x=>x.closedAt===undefined)){
    const events=new Map(after.trading.news.map(x=>[x.id,x]))
    const older=new Map(before.trading.news.map(x=>[x.id,x]))
    const next=records.map(row=>{
      if(row.closedAt!==undefined)return row
      const event=events.get(row.id)??older.get(row.id)
      const ends=event?.endsAt??row.endsAt
      if(ends>at)return row
      changed=true
      return {...row,endsAt:ends,closedAt:at,
        endPrices:seenPrices(after.trading,Object.keys(row.startPrices))}
    })
    if(changed)records=next
  }
  return changed?{...after,trading:{...after.trading,fameV4Trading:{...old,newsLog:records}}}:after
}
/** Prestige preserves watched rules and historical observations, never open orders. */
export function prestigeFameV4Trading(data:FameV4TradingState|undefined):FameV4TradingState|undefined{
  if(!data)return undefined
  return {version:1,stops:Object.fromEntries(Object.entries(data.stops).map(([id,x])=>[id,{...x,peakPrice:null}])),
    targets:{},newsLog:data.newsLog}
}
