import type { V8CapitalState, V8AutoSellReceipt } from './exact-state-v8.ts'
import { getExactAmount as v } from './exact-state-v8.ts'
import { getAsset } from './trading/catalog.ts'
import { quoteToExactFraction } from './exact-trading.ts'

export const OFFLINE_REPORT_MIN_MS = 60_000
export type OfflineAssetKind = 'stock' | 'crypto' | 'memecoin'
export interface OfflineAssetRow {
  id:string; name:string; symbol:string; kind:OfflineAssetKind
  before:bigint; after:bigint; marketChange:bigint; stakingValue:bigint; stakingUnits:bigint; decimals:number
}
export interface OfflineAutoSaleRow {
  id:string;name:string;symbol:string;kind:OfflineAssetKind
  at:number;trigger:V8AutoSellReceipt['trigger'];quantity:bigint;decimals:number
  proceeds:bigint;realizedProfit:bigint;fee:bigint
}
export interface OfflineReport {
  autoSales:OfflineAutoSaleRow[]
  autoSalesProceeds:bigint; autoSalesProfit:bigint
  durationMs:number; marketDurationMs:number; remainingSeconds:number; incomplete:boolean
  clicks:bigint; clickCount:number; enterprises:bigint; dividends:bigint
  taxesPaid:bigint; taxesGenerated:bigint; cashChange:bigint; xp:bigint; fame:bigint
  stocks:bigint; crypto:bigint; memecoins:bigint; marketChange:bigint; stakingValue:bigint
  assets:OfflineAssetRow[]
}
export function offlineReportDuration(state:V8CapitalState,at:number):number {
  return Math.max(0,at-Math.max(state.enterprises.lastAccruedAt,state.trading.dividendLastPaidAt,state.ascension.run.startedAtRealMs))
}
function valuation(state:V8CapitalState,id:string,units:bigint,decimals:number,reference:number):bigint {
  const q=quoteToExactFraction(state.trading.quotes[id]?.price??reference)
  return q ? units*q.numerator*100n/(q.denominator*10n**BigInt(decimals)) : 0n
}
/** Display only. Use initial units for price movement; newly minted staking
 * units are valued separately. Neither is cash or a realized trading profit. */
export function makeOfflineReport(before:V8CapitalState,after:V8CapitalState,at:number,remainingSeconds=0,incomplete=false):OfflineReport {
  const delta=(a:string,b:string)=>v(a)-v(b)
  const earnings=(source:'clicks'|'enterprises'|'dividends')=>delta(after.stats.earnedBySource[source],before.stats.earnedBySource[source])
  const assets:OfflineAssetRow[]=[]
  const byKind:Record<OfflineAssetKind,bigint>={stock:0n,crypto:0n,memecoin:0n}
  let stakingValue=0n
  // A sale is cash realized, not an unrealized price movement. Only units
  // that remain in the portfolio can contribute to latent variation.
  const autoSales:OfflineAutoSaleRow[]=[]
  let autoSalesProceeds=0n,autoSalesProfit=0n
  for(const receipt of after.trading.autoSellHistory??[]){
    if(receipt.at<=before.trading.dividendLastPaidAt||receipt.at>after.trading.dividendLastPaidAt)continue
    const asset=getAsset(receipt.assetId)
    if(!asset)continue
    const row:OfflineAutoSaleRow={
      id:asset.id,name:asset.name,symbol:asset.symbol,kind:asset.kind,
      at:receipt.at,trigger:receipt.trigger,quantity:v(receipt.quantity),
      decimals:asset.quantityDecimals,proceeds:v(receipt.proceedsCents),
      realizedProfit:BigInt(receipt.realizedNetProfitCents),fee:v(receipt.feeCents),
    }
    autoSales.push(row)
    autoSalesProceeds+=row.proceeds
    autoSalesProfit+=row.realizedProfit
  }
  autoSales.sort((a,b)=>b.at-a.at)
  for(const [id,holding] of Object.entries(before.trading.positions)){
    const asset=getAsset(id)
    if(!asset)continue
    const quantity=v(holding.quantity)
    if(quantity<=0n)continue
    const remaining=after.trading.positions[id]?v(after.trading.positions[id]!.quantity):0n
    const retained=remaining<quantity?remaining:quantity
    const initial=valuation(before,id,retained,asset.quantityDecimals,asset.referencePrice)
    const final=valuation(after,id,retained,asset.quantityDecimals,asset.referencePrice)
    const stakingUnits=delta(after.trading.staking.positions[id]?.lifetimeRewards??'0',before.trading.staking.positions[id]?.lifetimeRewards??'0')
    const rewards=valuation(after,id,stakingUnits>0n?stakingUnits:0n,asset.quantityDecimals,asset.referencePrice)
    const marketChange=final-initial
    byKind[asset.kind]+=marketChange
    stakingValue+=rewards
    assets.push({id,name:asset.name,symbol:asset.symbol,kind:asset.kind,before:initial,after:final,
      marketChange,stakingValue:rewards,stakingUnits:stakingUnits>0n?stakingUnits:0n,decimals:asset.quantityDecimals})
  }
  assets.sort((a,b)=>{const x=a.marketChange<0n?-a.marketChange:a.marketChange;const y=b.marketChange<0n?-b.marketChange:b.marketChange;return x===y?0:x>y?-1:1})
  const taxesPaid=delta(after.fiscal.taxesPaidCents,before.fiscal.taxesPaidCents)
  return {durationMs:offlineReportDuration(before,at),marketDurationMs:Math.max(0,at-before.trading.dividendLastPaidAt),
    remainingSeconds,incomplete,clicks:earnings('clicks'),clickCount:after.stats.clickCount-before.stats.clickCount,
    enterprises:earnings('enterprises'),dividends:earnings('dividends'),taxesPaid,
    taxesGenerated:taxesPaid+delta(after.fiscal.taxesDueCents,before.fiscal.taxesDueCents),
    cashChange:delta(after.game.balance,before.game.balance),
    xp:delta(after.prestige.experienceCents,before.prestige.experienceCents),
    fame:delta(after.prestige.lifetimeFameMicros,before.prestige.lifetimeFameMicros),
    stocks:byKind.stock,crypto:byKind.crypto,memecoins:byKind.memecoin,
    marketChange:byKind.stock+byKind.crypto+byKind.memecoin,stakingValue,assets,
    autoSales,autoSalesProceeds,autoSalesProfit}
}
