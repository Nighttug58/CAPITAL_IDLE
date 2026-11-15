import { getAsset } from './catalog.ts'
import type { CapitalState } from '../capital.ts'
import type { AssetDefinition, LiquidityPool } from './types.ts'

/** Base capacity is 0.001 % of a fictional asset's total issue. */
export const BASE_LIQUIDITY_SUPPLY_FRACTION = 0.00001
/** Base recovery: 10 % of capacity every real minute, not market time. */
export const LIQUIDITY_REGEN_PER_MINUTE = 0.10
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export function marketLiquidityCapacity(asset: AssetDefinition, prestigeLevel: number): number {
  const level = Number.isSafeInteger(prestigeLevel) ? clamp(prestigeLevel, 0, 10) : 0
  const raw = Math.min(asset.totalSupply, asset.totalSupply * BASE_LIQUIDITY_SUPPLY_FRACTION * (1 + 0.2 * level))
  const precision = 10 ** asset.quantityDecimals
  // A pool capacity is always a tradable number of whole/fractional units.
  return raw * precision <= Number.MAX_SAFE_INTEGER
    ? Math.round(raw * precision) / precision : Math.floor(raw)
}

export function availableSellLiquidity(state: CapitalState, id: string): number {
  const asset = getAsset(id)
  if (!asset) return 0
  const levels = state.ascension.progress.upgradeLevels
  const capacity = marketLiquidityCapacity(asset, levels['market-liquidity'])
  const pool = state.trading.liquidity?.[id]
  if (!pool) return capacity
  const now = state.trading.dividendLastPaidAt
  const elapsed = clamp(now - pool.updatedAt, 0, 7 * 24 * 60 * 60_000)
  const regeneration = capacity * LIQUIDITY_REGEN_PER_MINUTE * (1 + 0.15 * levels['liquidity-recovery']) * elapsed / 60_000
  return clamp(pool.sellUnits + regeneration, 0, capacity)
}

/** Selling consumes market depth; purchases use the remaining supply. */
export function consumeSellLiquidity(
  state: CapitalState, id: string, quantity: number,
): Record<string, LiquidityPool> | null {
  if (!(Number.isFinite(quantity) && quantity > 0)) return null
  const available = availableSellLiquidity(state, id)
  if (quantity > available + Math.max(1e-8, available * 1e-12)) return null
  return {
    ...(state.trading.liquidity ?? {}),
    [id]: {
      // Retained for compatibility with versioned saves.
      buyUnits: state.trading.liquidity?.[id]?.buyUnits ?? 0,
      sellUnits: Math.max(0, available - quantity),
      updatedAt: state.trading.dividendLastPaidAt,
    },
  }
}

/** Save validation: pools are always within the absolute ×3 upgrade ceiling. */
export function validMarketLiquidity(raw: unknown): raw is Record<string, LiquidityPool> {
  if (raw === undefined) return true
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length > 45) return false
  return entries.every(([id, value]) => {
    const asset = getAsset(id)
    if (!asset || !value || typeof value !== 'object' || Array.isArray(value)) return false
    const pool = value as Record<string, unknown>
    return Object.keys(pool).length === 3 &&
      typeof pool.buyUnits === 'number' && Number.isFinite(pool.buyUnits) &&
      pool.buyUnits >= 0 && pool.buyUnits <= marketLiquidityCapacity(asset, 10) &&
      typeof pool.sellUnits === 'number' && Number.isFinite(pool.sellUnits) &&
      pool.sellUnits >= 0 && pool.sellUnits <= marketLiquidityCapacity(asset, 10) &&
      typeof pool.updatedAt === 'number' && Number.isSafeInteger(pool.updatedAt) && pool.updatedAt >= 0
  })
}
