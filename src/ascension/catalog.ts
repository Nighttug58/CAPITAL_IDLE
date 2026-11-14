import { ASCENSION_UPGRADE_IDS, type AscensionUpgradeId } from './contracts.ts'

export interface AscensionUpgradeDefinition {
  readonly id: AscensionUpgradeId
  readonly maxLevel: number
  readonly firstCost: number
  readonly stepCost: number
  readonly totalCost: number
}
const rows: readonly [AscensionUpgradeId, number, number, number][] = [
  ['auto-click', 20, 1, 1],
  ['auto-investor', 1, 30, 0],
  ['auto-trader', 1, 50, 0],
  ['auto-enterprise', 1, 25, 0],
  ['news-duration', 4, 10, 6],
  ['news-impact', 4, 12, 8],
  ['news-frequency', 10, 3, 2],
  ['news-preview', 5, 7, 5],
  ['news-propagation', 1, 50, 0],
  ['volatility-radar', 1, 20, 0],
  ['automatic-orders', 1, 25, 0],
  ['market-frenzy', 1, 45, 0],
  ['time-accelerator', 5, 12, 9],
  ['market-liquidity', 10, 4, 3],
  ['liquidity-recovery', 10, 4, 3],
  ['crypto-staking', 1, 40, 0],
  ['staking-yield', 10, 5, 4],
  ['auto-compound', 1, 35, 0],
]

export const ASCENSION_UPGRADES: readonly AscensionUpgradeDefinition[] = Object.freeze(rows.map(
  ([id, maxLevel, firstCost, stepCost]) => Object.freeze({
    id, maxLevel, firstCost, stepCost,
    totalCost: maxLevel * firstCost + stepCost * maxLevel * (maxLevel - 1) / 2,
  }),
))
const definitions = new Map(ASCENSION_UPGRADES.map(item => [item.id, item]))
export const ASCENSION_TOTAL_LEVELS = ASCENSION_UPGRADES.reduce((sum, item) => sum + item.maxLevel, 0)
export const ASCENSION_TOTAL_COST = ASCENSION_UPGRADES.reduce((sum, item) => sum + item.totalCost, 0)

export function createZeroAscensionLevels(): Record<AscensionUpgradeId, number> {
  const result = {} as Record<AscensionUpgradeId, number>
  for (const id of ASCENSION_UPGRADE_IDS) result[id] = 0
  return result
}

export function ascensionSpentPoints(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const levels = raw as Record<string, unknown>
  if (Object.keys(levels).length !== ASCENSION_UPGRADE_IDS.length ||
      !ASCENSION_UPGRADE_IDS.every(id => Object.prototype.hasOwnProperty.call(levels, id))) return null
  let total = 0
  for (const { id, maxLevel, firstCost, stepCost } of ASCENSION_UPGRADES) {
    const n = levels[id]
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0 || n > maxLevel) return null
    total += n * firstCost + stepCost * n * (n - 1) / 2
  }
  return total
}

export function nextAscensionCost(id: string, currentLevel: number): number | null {
  const row = definitions.get(id as AscensionUpgradeId)
  if (!row || !Number.isSafeInteger(currentLevel) || currentLevel < 0 || currentLevel >= row.maxLevel) return null
  return row.firstCost + row.stepCost * currentLevel
}
