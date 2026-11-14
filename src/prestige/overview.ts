import type { CapitalState } from '../capital.ts'
import { FAME_BOOSTS, FAME_BOOST_BPS_PER_LEVEL } from './catalog.ts'
import { getAbsolutePrestigeStatus } from './absolute.ts'
import { getBonusBreakdown } from './bonuses.ts'
import { FAME_MICROS } from './state.ts'

export interface FameBonusOverview {
  readonly id: string
  readonly name: string
  readonly level: number
  readonly rawShopBps: number
  readonly prestigeShopBps: number
  readonly collectionBps: number
  readonly totalBps: number
}

export function getFameStatsOverview(state: Pick<CapitalState, 'prestige'>) {
  const p = state.prestige
  const absolute = getAbsolutePrestigeStatus(state)
  return {
    available: p.fameMicros / FAME_MICROS,
    earned: p.lifetimeFameMicros / FAME_MICROS,
    fromLevels: p.levelFameMicros / FAME_MICROS,
    fromCollections: p.collectionFameMicros / FAME_MICROS,
    spent: (p.lifetimeFameMicros - p.fameMicros) / FAME_MICROS,
    ownedCollections: p.ownedCollectionIds.length,
    totalCollections: 50,
    absolute,
    boosts: FAME_BOOSTS.map((boost): FameBonusOverview => {
      const breakdown = getBonusBreakdown(state, boost.id)
      const rawShopBps = p.boosts[boost.id] * FAME_BOOST_BPS_PER_LEVEL
      return {
        id: boost.id, name: boost.label, level: p.boosts[boost.id],
        rawShopBps,
        prestigeShopBps: rawShopBps * absolute.factor,
        collectionBps: breakdown.collectionBps,
        totalBps: breakdown.totalBps,
      }
    }),
  }
}
