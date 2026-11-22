/** Exact trading portfolio presentation: never derive wealth from the V7 Number facade. */
import type { V8CapitalState } from './exact-state-v8.ts'
import { getExactAmount as v } from './exact-state-v8.ts'
import { getAsset } from './trading/catalog.ts'
import { liquidityQuote } from './trading/liquidity-v8.ts'
import { exactTradeCost, quoteToExactFraction } from './exact-trading.ts'
import {v4DiscountedTradeCost} from './prestige/fame-v4-prestige.ts'
import { formatCompactUnits, formatDecimalUnits } from './large-numbers.ts'
import { v8DividendPicoCents } from './exact-market-v8.ts'

const fmtMoney=(cents:bigint)=>formatCompactUnits(cents,2,'$')
const feeBps=(kind:'stock'|'crypto'|'memecoin')=>kind==='stock'?50n:kind==='crypto'?100n:150n
export interface ExactPortfolioRow {
  readonly id: string
  readonly quantity: string
  readonly marketValue: string
  readonly netProfit: string
  readonly profitable: boolean
  readonly averageCost: string
  readonly dividendsPerSecond: string
}

export function exactPortfolioSummary(state:V8CapitalState):{
  readonly netWorth:string
  readonly marketValue:string
  readonly realizedNetProfit:string
  readonly dividendsPerSecond:string
  readonly rows:Readonly<Record<string,ExactPortfolioRow>>
}{
  let marketValue=0n
  const rows:Record<string,ExactPortfolioRow>={}
  for(const [id,holding] of Object.entries(state.trading.positions)){
    const asset=getAsset(id)
    if(!asset)continue
    const units=v(holding.quantity)
    if(units<=0n)continue
    const quote=state.trading.quotes[id]?.price??asset.referencePrice
    const execution=liquidityQuote(asset,quote,units,'sell',units)
    const fraction=execution&&quoteToExactFraction(execution.executionPrice)
    if(!fraction)continue
    const gross=exactTradeCost(fraction,units,asset.quantityDecimals,0n,'sell')
    const net=v4DiscountedTradeCost(state,fraction,units,asset.quantityDecimals,feeBps(asset.kind),'sell')
    if(!gross || !net)continue
    marketValue+=gross.grossCents
    const profit=net.proceedsCents-v(holding.costBasis)
    const base=10n**BigInt(asset.quantityDecimals)
    const averageCostCents=(v(holding.costBasis)*base)/units
    const quantity=units/base<1_000_000n
      ?formatDecimalUnits(units,asset.quantityDecimals,true)
      :formatCompactUnits(units,asset.quantityDecimals,'')
    const dividendPico=asset.kind==='stock'
      ?v8DividendPicoCents({...state.trading,positions:{[id]:holding}})
      :0n
    rows[id]={id,quantity,marketValue:fmtMoney(gross.grossCents),
      netProfit:fmtMoney(profit),profitable:profit>=0n,
      averageCost:fmtMoney(averageCostCents),
      dividendsPerSecond:fmtMoney(dividendPico/1_000_000_000_000n)+'/s'}
  }
  const dividendsPerSecond=v8DividendPicoCents(state.trading)/1_000_000_000_000n
  return{netWorth:fmtMoney(v(state.game.balance)+marketValue),
    marketValue:fmtMoney(marketValue),
    realizedNetProfit:fmtMoney(v(state.trading.realizedNetProfit)),
    dividendsPerSecond:fmtMoney(dividendsPerSecond)+'/s',rows}
}
