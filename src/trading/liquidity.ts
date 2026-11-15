import { getAsset } from './catalog.ts'
import type { AssetDefinition, LiquidityPool } from './types.ts'

/** Base capacity is 0.001 % of a fictional asset's total issue. */
export const BASE_LIQUIDITY_SUPPLY_FRACTION = 0.00001
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export function marketLiquidityCapacity(asset: AssetDefinition, prestigeLevel: number): number {
  const level = Number.isSafeInteger(prestigeLevel) ? clamp(prestigeLevel, 0, 10) : 0
  const raw = Math.min(asset.totalSupply, asset.totalSupply * BASE_LIQUIDITY_SUPPLY_FRACTION * (1 + 0.2 * level))
  const precision = 10 ** asset.quantityDecimals
  // A pool capacity is always a tradable number of whole/fractional units.
  return raw * precision <= Number.MAX_SAFE_INTEGER
    ? Math.round(raw * precision) / precision : Math.floor(raw)
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
