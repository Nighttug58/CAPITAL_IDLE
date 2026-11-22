/** Fame Shop V4 – Collections powers 14..18.
 * All economic values are canonical BigInt cents. No duplicate collection
 * ownership, Fame rewards or Museum rewards are ever created by these powers.
 */
import {v4CanSpend} from './fame-v4-tax.ts'
import {v4DiscountedTradeCost} from './fame-v4-prestige.ts'
import type { V8CapitalState } from '../exact-state-v8.ts'
import { getExactAmount as v, withExactAmount as s } from '../exact-state-v8.ts'
import { CURRENT_COLLECTION_SLOTS, currentCollectionId, getCollectionSlot } from './catalog.ts'
import { fameV4Level } from '../trading/fame-v4-trading.ts'
import { v4ContractEarlyExitWorth } from '../economy/fame-v4-enterprises.ts'
import { quoteToExactFraction } from '../exact-trading.ts'
import { getAsset } from '../trading/catalog.ts'

export const V4_EXHIBITION_DURATION_MS = 30 * 60_000
export const V4_EXHIBITION_COOLDOWN_MS = 120 * 60_000
export const V4_PRIVATE_OFFER_MS = 24 * 60 * 60_000
export const V4_WING_COSTS_CENTS: readonly bigint[] = Object.freeze([
  10n**11n, // $1B
  10n**13n, // $100B
  10n**15n, // $10T
  10n**17n, // $1Q
  10n**19n, // $100Q
])
export interface V4Exhibition {
  startedAt:number
  endsAt:number
  cooldownUntil:number
  costCents:string
}
export interface V4PrivateOffer { itemId:string; used:boolean }
export interface V4PrivateOffers {
  generatedAt:number
  expiresAt:number
  items:V4PrivateOffer[]
}
export interface FameV4CollectionState {
  version:1
  restoredIds:string[]
  wingTiers:number[]
  permanentSpentCents:string
  exhibition:V4Exhibition|null
  exhibitionSpentCents:string
  offers:V4PrivateOffers|null
}
export type FameV4CollectionCommand =
 | {kind:'restore';id:string}
 | {kind:'wing';tier:number}
 | {kind:'exhibition'}
export function emptyFameV4Collections():FameV4CollectionState {
  return {version:1,restoredIds:[],wingTiers:[],permanentSpentCents:'0',
    exhibition:null,exhibitionSpentCents:'0',offers:null}
}
export function fameV4Collections(state:V8CapitalState):FameV4CollectionState{
  return state.prestige.fameV4Collections??emptyFameV4Collections()
}
const own=(state:V8CapitalState,id:string):boolean=>{
  const key=currentCollectionId(id)
  return state.prestige.ownedCollectionIds.some(x=>currentCollectionId(x)===key)
}
const validAt=(state:V8CapitalState,at:number):boolean=>
  Number.isSafeInteger(at)&&at===state.enterprises.lastAccruedAt&&at>=state.fiscal.periodStartedAt
export function v4RestoreCostCents(id:string):bigint|null{
  const slot=getCollectionSlot('v2:'+currentCollectionId(id))
  return slot ? (BigInt(slot.priceCents)+4n)/5n : null
}
export function v4RestoreCollection(state:V8CapitalState,id:string,at:number):V8CapitalState|null{
  const rank=fameV4Level(state,15),slot=getCollectionSlot('v2:'+currentCollectionId(id)),data=fameV4Collections(state)
  if(rank<1||!slot||!validAt(state,at)||!own(state,id)||
    data.restoredIds.length>=rank*2||data.restoredIds.some(x=>currentCollectionId(x)===currentCollectionId(id)))return null
  const cost=v4RestoreCostCents(id)!
  if(!v4CanSpend(state,cost))return null
  return {...state,game:{...state.game,balance:s(v(state.game.balance)-cost)},
    prestige:{...state.prestige,fameV4Collections:{...data,
      restoredIds:[...data.restoredIds,slot.id],
      permanentSpentCents:s(v(data.permanentSpentCents)+cost)}}}
}
export function v4BuyMuseumWing(state:V8CapitalState,tier:number,at:number):V8CapitalState|null{
  const rank=fameV4Level(state,18),data=fameV4Collections(state)
  if(!Number.isSafeInteger(tier)||tier<0||tier>=rank||tier>=5||
    !validAt(state,at)||data.wingTiers.includes(tier))return null
  const cost=V4_WING_COSTS_CENTS[tier]!
  if(!v4CanSpend(state,cost))return null
  return {...state,game:{...state.game,balance:s(v(state.game.balance)-cost)},
    prestige:{...state.prestige,fameV4Collections:{...data,
      wingTiers:[...data.wingTiers,tier].sort((a,b)=>a-b),
      permanentSpentCents:s(v(data.permanentSpentCents)+cost)}}}
}
/** Wealth base: cash, executable portfolio, recorded business investment,
 * permanent collection book value, recoverable locked contracts, less debt.
 * No PP starting-capital exclusion here: this is a money-sink price, not PP.
 */
export function v4ExhibitionWealthCents(state:V8CapitalState):bigint{
  let worth=v(state.game.balance)-v(state.fiscal.taxesDueCents)+v4ContractEarlyExitWorth(state)
  for(const [id,holding] of Object.entries(state.trading.positions)){
    const asset=getAsset(id)
    if(!asset)continue
    const fraction=quoteToExactFraction(state.trading.quotes[id]?.price??asset.referencePrice)
    if(!fraction)continue
    const fee=asset.kind==='stock'?50n:asset.kind==='crypto'?100n:150n
    const sale=v4DiscountedTradeCost(state,fraction,v(holding.quantity),asset.quantityDecimals,fee,'sell')
    if(sale)worth+=sale.proceedsCents
  }
  for(const business of Object.values(state.enterprises.owned))worth+=v(business.investedCents)
  for(const id of state.prestige.ownedCollectionIds){
    const slot=getCollectionSlot(id)
    if(slot)worth+=BigInt(slot.priceCents)
  }
  return worth
}
export function v4ExhibitionCostCents(state:V8CapitalState):bigint|null{
  const wealth=v4ExhibitionWealthCents(state)
  return wealth<=0n?null:
    (wealth*50n+9_999n)/10_000n>100_000_000n
      ? (wealth*50n+9_999n)/10_000n : 100_000_000n
}
export function v4StartExhibition(state:V8CapitalState,at:number):V8CapitalState|null{
  const rank=fameV4Level(state,14),data=fameV4Collections(state)
  if(rank<1||state.prestige.ownedCollectionIds.length<3||!validAt(state,at)||
    (data.exhibition!==null&&at<data.exhibition.cooldownUntil))return null
  const endsAt=at+V4_EXHIBITION_DURATION_MS
  const cooldownUntil=at+V4_EXHIBITION_COOLDOWN_MS
  if(!Number.isSafeInteger(endsAt)||!Number.isSafeInteger(cooldownUntil))return null
  const cost=v4ExhibitionCostCents(state)
  if(cost===null||!v4CanSpend(state,cost))return null
  return {...state,game:{...state.game,balance:s(v(state.game.balance)-cost)},
    prestige:{...state.prestige,fameV4Collections:{...data,
      exhibition:{startedAt:at,endsAt,cooldownUntil,costCents:s(cost)},
      exhibitionSpentCents:s(v(data.exhibitionSpentCents)+cost)}}}
}
export function v4CollectionsBonusBps(state:V8CapitalState,source:'click'|'dividend'|'enterprise',at:number):number{
  const data=state.prestige.fameV4Collections
  if(!data)return 0
  const restorations=Math.min(fameV4Level(state,15)*2,data.restoredIds.length,20)*25
  if(source==='click')return restorations
  const wings=Math.min(fameV4Level(state,18),data.wingTiers.length,5)*50
  const exhibition=data.exhibition
  const exhibit=exhibition&&exhibition.startedAt<=at&&at<exhibition.endsAt
    ? fameV4Level(state,14)*100:0
  return restorations+wings+exhibit
}
export function nextV4CollectionEventTime(state:V8CapitalState,from:number,to:number):number{
  const expiry=state.prestige.fameV4Collections?.exhibition?.endsAt
  return expiry!==undefined&&expiry>from&&expiry<to?expiry:to
}
/** Keep permanent museum additions and same-day offers, reset temporary
 * exhibition and its cooldown at Prestige. Saves may omit this entire section.
 */
export function prestigeFameV4Collections(data:FameV4CollectionState|undefined):FameV4CollectionState|undefined{
  return data?{...data,exhibition:null,exhibitionSpentCents:'0'}:undefined
}
/** Seedless deterministic unique offers. Do not backfill missed days: an
 * offline visit creates only today's set and a single 24-hour expiry.
 * A sold/owned item is not replaced during the same window.
 */
export function v4RefreshPrivateOffers(state:V8CapitalState,at:number):V8CapitalState{
  const rank=fameV4Level(state,17)
  if(rank<1||!Number.isSafeInteger(at)||at<state.enterprises.lastAccruedAt)return state
  const data=fameV4Collections(state)
  if(data.offers&&at<data.offers.expiresAt)return state
  const unowned=CURRENT_COLLECTION_SLOTS.filter(slot=>!own(state,slot.id))
  const entries:V4PrivateOffer[]=[]
  if(unowned.length){
    const start=BigInt(Math.floor(at/V4_PRIVATE_OFFER_MS))*37n+
      BigInt(state.trading.seed%unowned.length)
    for(let i=0;i<Math.min(rank,unowned.length);i++){
      const index=Number((start+BigInt(i)*17n)%BigInt(unowned.length))
      // Linear probe avoids collisions even when collection sizes divide 17.
      let offset=0
      while(entries.some(row=>row.itemId===unowned[(index+offset)%unowned.length]?.id))offset++
      entries.push({itemId:unowned[(index+offset)%unowned.length]!.id,used:false})
    }
  }
  const expiresAt=at+V4_PRIVATE_OFFER_MS
  if(!Number.isSafeInteger(expiresAt))return state
  return {...state,prestige:{...state.prestige,fameV4Collections:{
    ...data,offers:{generatedAt:at,expiresAt,items:entries}}}}
}
export function v4PrivateDiscountBps(state:V8CapitalState,id:string,at:number):number{
  const rank=fameV4Level(state,17),data=state.prestige.fameV4Collections
  if(rank<1||!data?.offers||at<data.offers.generatedAt||at>=data.offers.expiresAt)return 0
  const key=currentCollectionId(id)
  return data.offers.items.some(row=>!row.used&&currentCollectionId(row.itemId)===key&&!own(state,id))
    ?rank*100:0
}
export function v4CollectionPriceCents(state:V8CapitalState,id:string,at=state.enterprises.lastAccruedAt):bigint|null{
  const slot=getCollectionSlot(id)
  if(!slot)return null
  return BigInt(slot.priceCents)*BigInt(10_000-v4PrivateDiscountBps(state,id,at))/10_000n
}
export function v4ClaimPrivateOffer(state:V8CapitalState,id:string,at:number):V8CapitalState{
  if(v4PrivateDiscountBps(state,id,at)===0)return state
  const data=fameV4Collections(state)
  const offers=data.offers!
  const key=currentCollectionId(id)
  const items=offers.items.map(row=>currentCollectionId(row.itemId)===key?{...row,used:true}:row)
  return {...state,prestige:{...state.prestige,fameV4Collections:{
    ...data,offers:{...offers,items}}}}
}
export function v4MuseumMissingCost(state:V8CapitalState):{missing:number;catalogCostCents:bigint;offeredCostCents:bigint}{
  let missing=0,catalogCostCents=0n,offeredCostCents=0n
  for(const slot of CURRENT_COLLECTION_SLOTS)if(!own(state,slot.id)){
    missing++
    catalogCostCents+=BigInt(slot.priceCents)
    offeredCostCents+=v4CollectionPriceCents(state,slot.id)!
  }
  return {missing,catalogCostCents,offeredCostCents}
}
