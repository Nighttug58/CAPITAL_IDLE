/** V8 bots keep the old automation timing, but all cash and quantity math
 * uses BigInt. The bot catalogue itself is unchanged until pass 6. */
import type {V8CapitalState} from './exact-state-v8.ts'
import {getExactAmount as v} from './exact-state-v8.ts'
import {v8Click,v8BuyTrade,v8SellTrade,v8BuyEnterprise,v8MaximumBuyUnits} from './exact-runtime-v8.ts'
import {getExactLevel} from './exact-levels.ts'
import {getDollarAutoClickLevel} from './dollar-autoclick-v8.ts'
import {getAsset} from './trading/catalog.ts'
import {quoteToExactFraction,affordableExactQuantity} from './exact-trading.ts'
import {formatDecimalUnits} from './large-numbers.ts'
import {ENTERPRISES,getEnterpriseUpgradeCostCentsExact} from './economy/catalog.ts'
import {AUTOMATION_BOT_INTERVAL_MS,AUTO_STOP_LOSS_BPS,AUTO_TAKE_PROFIT_BPS,
  isMarketOrderTriggered} from './ascension/automation-orders.ts'
import type {AscensionMarketOrder} from './ascension/contracts.ts'

const min=(a:bigint,b:bigint)=>a<b?a:b
function feeBps(kind:'stock'|'crypto'|'memecoin'):bigint{
 return kind==='stock'?50n:kind==='crypto'?100n:150n
}
function buyWithinBudget(state:V8CapitalState,id:string,budget:bigint):V8CapitalState{
 const asset=getAsset(id)
 const price=state.trading.quotes[id]?.price??asset?.referencePrice??0
 const fraction=quoteToExactFraction(price)
 if(!asset||!fraction||budget<=0n)return state
 const reserve=v(state.ascension.run.automation.cashReserveCents)
 const spending=min(budget,v(state.game.balance)-reserve)
 if(spending<=0n)return state
 const affordable=affordableExactQuantity(spending,fraction,asset.quantityDecimals,feeBps(asset.kind))
 const max=v8MaximumBuyUnits(state,id)
 const units=min(max,affordable)
 if(units<=0n)return state
 const result=v8BuyTrade(state,id,formatDecimalUnits(units,asset.quantityDecimals))
 return result.ok && v(result.state.game.balance)>=reserve?result.state:state
}
function sellWithinBudget(state:V8CapitalState,id:string,budget:bigint):V8CapitalState{
 const asset=getAsset(id)
 if(!asset||budget<=0n)return state
 const price=state.trading.quotes[id]?.price??asset.referencePrice
 const fraction=quoteToExactFraction(price)
 const pos=state.trading.positions[id]
 if(!fraction||!pos)return state
 const units=min(v(pos.quantity),budget*fraction.denominator*10n**BigInt(asset.quantityDecimals)/
   (fraction.numerator*100n))
 if(units<=0n)return state
 const result=v8SellTrade(state,id,formatDecimalUnits(units,asset.quantityDecimals))
 return result.ok?result.state:state
}

export function v8AutomationFrame(state:V8CapitalState,at:number,foreground:boolean):V8CapitalState{
 if(!foreground||!Number.isSafeInteger(at)||at<state.ascension.run.startedAtRealMs||
   at<state.trading.dividendLastPaidAt||at<state.enterprises.lastAccruedAt||
   at-state.trading.dividendLastPaidAt>=1000||at-state.enterprises.lastAccruedAt>=1000)return state
 const config=state.ascension.run.automation
 const levels=state.ascension.progress.upgradeLevels
 const clickLevel=getDollarAutoClickLevel(state)
 const autoclick=clickLevel>0
 const bots=(config.investorEnabled&&levels['auto-investor']>0)||
   (config.traderEnabled&&levels['auto-trader']>0)||
   (config.enterpriseEnabled&&levels['auto-enterprise']>0)||
   (levels['automatic-orders']>0&&(state.ascension.run.marketOrders?.length??0)>0)
 if(!autoclick&&!bots)return state
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
 const lastStrategy=state.ascension.run.lastStrategyAtRealMs??at-AUTOMATION_BOT_INTERVAL_MS
 if(bots&&at-lastStrategy>=AUTOMATION_BOT_INTERVAL_MS){
   const touched=new Set<string>()
   if(levels['automatic-orders'])for(const order of [...(updated.ascension.run.marketOrders??[])].sort((a,b)=>a.id-b.id)){
     const asset=getAsset(order.assetId)
     const price=updated.trading.quotes[order.assetId]?.price??asset?.referencePrice??0
     const legacyOrder={...order,quantity:0}as AscensionMarketOrder
     if(!isMarketOrderTriggered(legacyOrder,price))continue
     const quantity=formatDecimalUnits(v(order.quantity),asset?.quantityDecimals??0)
     const performed=order.side==='buy'?v8BuyTrade(updated,order.assetId,quantity):
       v8SellTrade(updated,order.assetId,quantity)
     if(!performed.ok || (order.side==='buy'&&
       v(performed.state.game.balance)<v(config.cashReserveCents)))continue
     updated={...performed.state,ascension:{...performed.state.ascension,run:{...performed.state.ascension.run,
       marketOrders:(performed.state.ascension.run.marketOrders??[]).filter(x=>x.id!==order.id)}}}
     touched.add(order.assetId)
     break
   }
   if(config.traderEnabled&&levels['auto-trader']>0&&v(config.maxOrderCents)>0n){
     const target=BigInt(config.takeProfitBps??AUTO_TAKE_PROFIT_BPS)
     const stop=BigInt(config.stopLossBps??AUTO_STOP_LOSS_BPS)
     for(const id of [...config.allowedAssetIds].sort()){
       if(touched.has(id))continue
       const asset=getAsset(id)
       const pos=updated.trading.positions[id]
       if(!asset||!pos||v(pos.quantity)<=0n)continue
       const fraction=quoteToExactFraction(updated.trading.quotes[id]?.price??asset.referencePrice)
       if(!fraction)continue
       const soldValue=v(pos.quantity)*fraction.numerator*100n/
         (fraction.denominator*10n**BigInt(asset.quantityDecimals))
       const net=soldValue*(10_000n-feeBps(asset.kind))/10_000n
       const basis=v(pos.costBasis)
       const gainBps=basis>0n?(net-basis)*10_000n/basis:10_000n
       if(gainBps<target&&gainBps>-stop)continue
       const next=sellWithinBudget(updated,id,v(config.maxOrderCents))
       if(next!==updated){updated=next;touched.add(id);break}
     }
   }
   if(config.investorEnabled&&levels['auto-investor']>0&&v(config.maxOrderCents)>0n){
     const allowed=[...config.allowedAssetIds].sort()
     if(allowed.length){
       const slot=Math.floor(Math.max(0,at-updated.ascension.run.startedAtRealMs)/AUTOMATION_BOT_INTERVAL_MS)%allowed.length
       for(let offset=0;offset<allowed.length;offset++){
         const id=allowed[(slot+offset)%allowed.length]!
         if(touched.has(id))continue
         const next=buyWithinBudget(updated,id,v(config.maxOrderCents))
         if(next!==updated){updated=next;break}
       }
     }
   }
   if(config.enterpriseEnabled&&levels['auto-enterprise']){
     const spending=min(v(config.enterpriseBudgetCents??config.maxOrderCents),
       v(updated.game.balance)-v(config.cashReserveCents))
     if(spending>0n){
       const level=getExactLevel(v(updated.prestige.experienceCents))
       const candidates:{id:string;upgrade:boolean;cost:bigint}[]=[]
       for(const item of ENTERPRISES){
         if(level<item.requiredPlayerLevel)continue
         const holding=updated.enterprises.owned[item.id]
         if(!holding)candidates.push({id:item.id,upgrade:false,cost:BigInt(item.purchaseCostCents)})
         else{
           const cost=getEnterpriseUpgradeCostCentsExact(item.id,holding.level)
           if(cost!==null)candidates.push({id:item.id,upgrade:true,cost})
         }
       }
       candidates.sort((a,b)=>a.cost<b.cost?-1:a.cost>b.cost?1:a.id.localeCompare(b.id))
       for(const item of candidates){
         if(item.cost>spending)continue
         const result=v8BuyEnterprise(updated,item.id,at,item.upgrade)
         if(result.ok&&v(result.state.game.balance)>=v(config.cashReserveCents)){
           updated=result.state;break
         }
       }
     }
   }
   updated={...updated,ascension:{...updated.ascension,run:{...updated.ascension.run,lastStrategyAtRealMs:at}}}
 }
 return updated
}
