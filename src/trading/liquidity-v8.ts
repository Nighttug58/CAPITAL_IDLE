/** Legacy compatibility shim. Player orders never affect execution quotes,
 * price momentum, or the public chart; only market ticks and news do.
 * Kept for historical imports while V8 settlement uses the quote directly.
 */
import type { AssetDefinition } from './types.ts'
import type { V8TradingState } from '../exact-state-v8.ts'

export interface LiquidityQuote {
  readonly executionPrice: number
  readonly endingPrice: number
  readonly priceImpactPercent: number
}

/** Buy/sell at the public quote regardless of quantity or holdings. */
export function liquidityQuote(_asset: AssetDefinition, price: number,
  quantityUnits: bigint, side: 'buy' | 'sell',
  ownedBeforeUnits = 0n): LiquidityQuote | null {
  if (!Number.isFinite(price) || price <= 0 || quantityUnits <= 0n ||
      ownedBeforeUnits < 0n || (side === 'sell' && ownedBeforeUnits < quantityUnits))
    return null
  return { executionPrice: price, endingPrice: price, priceImpactPercent: 0 }
}

/** Compatibility: do not update the quote, its momentum, or chart history. */
export function updateTradeMarket(trading: V8TradingState, _asset: AssetDefinition,
  _endingPrice: number): Pick<V8TradingState, 'quotes' | 'history'> {
  return { quotes: trading.quotes, history: trading.history }
}
