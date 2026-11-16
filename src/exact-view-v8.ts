/** Lossy legacy UI projection: this object is READ ONLY and must NEVER be
 * serialized or used for money settlements. V8CapitalState is authoritative.
 * Transition to native exact UI types will happen incrementally; these mirrors
 * are deliberately bounded to avoid Infinity/NaN in legacy components. */
import type {CapitalState} from './capital.ts'
import type {V8CapitalState} from './exact-state-v8.ts'
import {getExactAmount as v} from './exact-state-v8.ts'
import {getAsset} from './trading/catalog.ts'
import {getPurchasedFameBoostCost} from './prestige/catalog.ts'
import {ascensionSpentPoints} from './ascension/catalog.ts'

const MAX_CENTS=BigInt(Number.MAX_SAFE_INTEGER)
function boundedNumber(amount:bigint,signed=false):number{
 if(!signed && amount<0n)throw new RangeError('Negative balance in positive-only display')
 if(amount>MAX_CENTS)return Number.MAX_SAFE_INTEGER
 if(amount<-MAX_CENTS)return -Number.MAX_SAFE_INTEGER
 return Number(amount)
}
export function approximateMoneyCents(amount:bigint):number{
 return boundedNumber(amount,true)/100
}
export function approximateQuantity(units:bigint,decimals:number):number{
 const max=10n**BigInt(decimals)
 if(units>BigInt(Number.MAX_SAFE_INTEGER)*max)return Number.MAX_SAFE_INTEGER
 return Number(units)/10**decimals
}
export function projectV8ForLegacyUI(state:V8CapitalState):CapitalState{
 const {game,trading,enterprises,fiscal,stats,prestige,ascension,achievements}=state
 const fameSpent=getPurchasedFameBoostCost(prestige.boosts)??0
 const fame=boundedNumber(v(prestige.fameMicros))
 // Derivable legacy shop ledger remains structurally valid on display when
 // permanent Fame becomes larger than its old 53-bit integer capacity.
 // Legacy screens expect the OLD price table. Construct a read-only facade
 // satisfying their old Fame Shop equation without changing actual V8 funds.
 const shownFame=fame===Number.MAX_SAFE_INTEGER?
   Number.MAX_SAFE_INTEGER-fameSpent*1_000_000:fame
 const shownLifetimeFame=shownFame+fameSpent*1_000_000
 const ppSpent=ascensionSpentPoints(ascension.progress.upgradeLevels)??0
 const lifetimePP=boundedNumber(v(ascension.progress.lifetimePoints))
 const shownAvailablePP=lifetimePP===Number.MAX_SAFE_INTEGER?
   Number.MAX_SAFE_INTEGER-ppSpent:boundedNumber(v(ascension.progress.availablePoints))
 const amounts=<T extends string>(r:Record<T,string>):Record<T,number>=>
   Object.fromEntries(Object.entries(r).map(([k,a])=>[k,approximateMoneyCents(v(a as string))])) as Record<T,number>
 const taxAmounts=<T extends string>(r:Record<T,string>):Record<T,number>=>
   Object.fromEntries(Object.entries(r).map(([k,a])=>[k,boundedNumber(v(a as string))])) as Record<T,number>
 const positions=Object.fromEntries(Object.entries(trading.positions).map(([id,p])=>{
   const asset=getAsset(id)
   return[id,{quantity:approximateQuantity(v(p.quantity),asset?.quantityDecimals??0),
      costBasis:approximateMoneyCents(v(p.costBasis))}]
 }))
 const stakes=Object.fromEntries(Object.entries(trading.staking.positions).map(([id,entry])=>{
   const dec=getAsset(id)?.quantityDecimals??0
   const q=(name:keyof typeof entry)=>approximateQuantity(v(entry[name] as string),dec)
   return[id,{locked:q('locked'),unlocking:q('unlocking'),unlockAt:entry.unlockAt,
     awaitingCompound:q('awaitingCompound'),rewardHeld:q('rewardHeld'),rewardLocked:q('rewardLocked'),
     rewardUnlocking:q('rewardUnlocking'),lifetimeRewards:q('lifetimeRewards'),carryUnits:entry.carryUnits}]
 }))
 const ascensionOrders=ascension.run.marketOrders?.map(order=>({
   ...order,quantity:approximateQuantity(v(order.quantity),getAsset(order.assetId)?.quantityDecimals??0),
 }))
 const {xpRebase: _legacyXpRebase, ...prestigeNoRebase}=prestige
  void _legacyXpRebase
 const automation=ascension.run.automation ?? {autoClickEnabled:false,investorEnabled:false,traderEnabled:false,enterpriseEnabled:false,allowedAssetIds:[],maxOrderCents:'0',cashReserveCents:'0'}
 const {enterpriseBudgetCents:_legacyBudget,...automationNoBudget}=automation
 void _legacyBudget
 const {marketOrders:_legacyOrders,automation:_legacyAutomation,...ascensionRunNoLedger}=ascension.run
 void _legacyOrders
 void _legacyAutomation
 const copy:CapitalState={
   version:7, // only a display facade; source remains V8
   game:{...game,balance:approximateMoneyCents(v(game.balance)),
     lifetimeEarned:approximateMoneyCents(v(game.lifetimeEarned))},
   trading:{...trading,
     positions,staking:{lastAccruedAt:trading.staking.lastAccruedAt,positions:stakes},
     realizedNetProfit:approximateMoneyCents(v(trading.realizedNetProfit)),
     creditedTradingProfit:approximateMoneyCents(v(trading.creditedTradingProfit)),
     dividendPendingCents:boundedNumber(v(trading.dividendPendingCents))},
   enterprises:{...enterprises,owned:Object.fromEntries(Object.entries(enterprises.owned).map(([id,item])=>
     [id,{...item,investedCents:boundedNumber(v(item.investedCents))}]))},
   fiscal:{...fiscal,taxesDueCents:boundedNumber(v(fiscal.taxesDueCents)),
     taxesPaidCents:boundedNumber(v(fiscal.taxesPaidCents)),
     dueBySourceCents:taxAmounts(fiscal.dueBySourceCents),
     paidBySourceCents:taxAmounts(fiscal.paidBySourceCents)},
   stats:{...stats,earnedBySource:amounts(stats.earnedBySource),
     realizedLossesBySource:amounts(stats.realizedLossesBySource)},
   prestige:{...prestigeNoRebase, xpCurveVersion:3,
     experienceCents:boundedNumber(v(prestige.experienceCents)),
     fameMicros:shownFame,lifetimeFameMicros:shownLifetimeFame,
     levelFameMicros:boundedNumber(v(prestige.levelFameMicros)),
     collectionFameMicros:boundedNumber(v(prestige.collectionFameMicros)),
     ...(prestige.xpRebase?{xpRebase:{fromCents:boundedNumber(v(prestige.xpRebase.fromCents)),
       toCents:boundedNumber(v(prestige.xpRebase.toCents))}}:{}),
   },
   ascension:{...ascension,
     progress:{...ascension.progress,availablePoints:shownAvailablePP,lifetimePoints:lifetimePP,
       history:ascension.progress.history.map(x=>({...x,
         eligibleWorthCents:boundedNumber(v(x.eligibleWorthCents)),
         earnedPoints:boundedNumber(v(x.earnedPoints))}))},
     run:{...ascensionRunNoLedger,automation:{...automationNoBudget,
       maxOrderCents:boundedNumber(v(automation.maxOrderCents)),
       cashReserveCents:boundedNumber(v(automation.cashReserveCents)),
       ...(automation.enterpriseBudgetCents!==undefined?
         {enterpriseBudgetCents:boundedNumber(v(automation.enterpriseBudgetCents))}:{})},
       ...(ascensionOrders?{marketOrders:ascensionOrders}:{})},
   },
   achievements:{...achievements,cycleGiftCents:boundedNumber(v(achievements.cycleGiftCents))},
 }
 return copy
}
