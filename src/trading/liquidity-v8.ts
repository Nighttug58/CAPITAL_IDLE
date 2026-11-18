/**
 * Market microstructure for the fictional V8 exchange. A large order is
 * executed at a worse average price and then moves the public quote.
 * The same symmetric curve on buys/sells prevents free pump-and-dump loops.
 * Holdings and money remain exact BigInt, only market quotes are Numbers.
 */
import type { AssetDefinition } from './types.ts'
import type { V8TradingState } from '../exact-state-v8.ts'

export interface LiquidityQuote {
  readonly executionPrice: number
  readonly endingPrice: number
  readonly priceImpactPercent: number
}
const LIQUIDITY_FRACTION = { stock: 0.0005, crypto: 0.00035, memecoin: 0.0002 } as const

export function liquidityQuote(asset: AssetDefinition, price: number,
  quantityUnits: bigint, side: 'buy' | 'sell'): LiquidityQuote | null {
  if (!Number.isFinite(price) || price <= 0 || quantityUnits <= 0n) return null
  const circulatingUnits = BigInt(asset.totalSupply) * 10n ** BigInt(asset.quantityDecimals)
  if (circulatingUnits <= 0n) return null
  const shareMicro = quantityUnits * 1_000_000n / circulatingUnits
  // Clamp this conversion only, not asset supply, trade volume or price.
  const safeMicro = shareMicro > 500_000_000n ? 500_000_000n : shareMicro
  const ownershipFraction = Number(safeMicro) / 1_000_000
  const magnitude = Math.min(2.4,
    0.35 * Math.log1p(ownershipFraction / LIQUIDITY_FRACTION[asset.kind]))
  const direction = side === 'buy' ? 1 : -1
  const executionPrice = price * Math.exp(direction * magnitude / 2)
  const endingPrice = price * Math.exp(direction * magnitude)
  if (!Number.isFinite(executionPrice) || executionPrice <= 0 ||
      !Number.isFinite(endingPrice) || endingPrice <= 0) return null
  return { executionPrice, endingPrice,
    priceImpactPercent: (endingPrice / price - 1) * 100 }
}

/** A trade reprices charts at the same timestamp; never append duplicate times. */
export function updateTradeMarket(trading: V8TradingState, asset: AssetDefinition,
  endingPrice: number): Pick<V8TradingState, 'quotes' | 'history'> {
  const current = trading.quotes[asset.id] ?? {
    price: asset.referencePrice, momentum: 0,
    dividendYield: asset.initialDividendYield, updatedAt: trading.lastTickAt,
  }
  const at = Math.max(trading.lastTickAt, trading.dividendLastPaidAt, current.updatedAt)
  const logMove = Math.log(endingPrice / current.price)
  const quote = { ...current, price: endingPrice, updatedAt: at,
    momentum: Math.max(-0.08, Math.min(0.08, current.momentum * 0.5 + logMove * 0.2)) }
  const old = trading.history[asset.id] ?? []
  const last = old[old.length - 1]
  const sample = { at, price: endingPrice,
    ...(current.dividendYield !== null ? { dividendYield: current.dividendYield } : {}) }
  const series = last?.at === at ? [...old.slice(0, -1), sample] :
    [...old, sample].slice(-720)
  return { quotes: { ...trading.quotes, [asset.id]: quote },
    history: { ...trading.history, [asset.id]: series } }
}
