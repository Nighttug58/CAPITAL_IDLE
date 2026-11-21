import type { V8CapitalState } from './exact-state-v8.ts'
import { v8EligiblePrestigeWorthCents } from './exact-prestige-v8.ts'
import { getCollectionBookValueCents } from './prestige/collections-catalog.ts'
import { createRandom } from './trading/market.ts'
import { createEvent, getNewsDirection, trimNews } from './trading/news.ts'
import { v8MarketNewsEffects } from './exact-market-v8.ts'
import { applyNewsAutoSells,applyFameV4AutoSells } from './trading/auto-sell-v8.ts'
import { observeFameV4News } from './trading/fame-v4-trading.ts'

export function newsPowerCost(state:V8CapitalState,end:boolean):bigint {
  const worth=v8EligiblePrestigeWorthCents(state)+BigInt(getCollectionBookValueCents(state.prestige.ownedCollectionIds)??0)
  return worth>0n?(worth*BigInt(end?10:5)+99n)/100n:0n
}
export function buyNewsPower(state:V8CapitalState,eventId:string|null,expectedCount:number,at:number):V8CapitalState|null {
  const count=state.newsPowers?.count??0
  if(count!==expectedCount || !Number.isSafeInteger(count+1))return null
  if(!Number.isSafeInteger(at)||at<state.trading.dividendLastPaidAt||at-state.trading.dividendLastPaidAt>=1000)return null
  const cost=newsPowerCost(state,eventId!==null)
  if(cost<=0n||BigInt(state.game.balance)<cost)return null
  const random=createRandom(state.trading.seed)
  at=state.trading.dividendLastPaidAt
  let news=[...state.trading.news]
  if(eventId!==null){
    const target=news.find(e=>e.id===eventId && e.startedAt<=at && e.endsAt>at)
    if(!target)return null
    const {resolution,resolutionAt,...ended}=target
    news=news.map(e=>e===target?{...ended,endsAt:at,manuallyEnded:true}:e)
  }
  let affectedId=eventId
  if(eventId===null || !news.some(e=>e.startedAt<=at && e.endsAt>at && getNewsDirection(e)!=='neutral')){
    const event=createEvent(at,random.next,news,v8MarketNewsEffects(state,at))
    const id='power-'+(count+1).toString(36)
    affectedId??=id
    news.push({...event,id})
  }
  const changed:V8CapitalState={...state,game:{...state.game,balance:(BigInt(state.game.balance)-cost).toString()},
    trading:{...state.trading,news:trimNews(news,at),seed:random.seed()},
    newsPowers:{count:count+1,recent:[...(state.newsPowers?.recent??[]),{eventId:affectedId!,action:eventId===null?'generate' as const:'end' as const,at,costCents:cost.toString()}].slice(-50),spentCents:(BigInt(state.newsPowers?.spentCents??0)+cost).toString()}}
  return applyFameV4AutoSells(applyNewsAutoSells(state,observeFameV4News(state,changed,at),at),at)
}
