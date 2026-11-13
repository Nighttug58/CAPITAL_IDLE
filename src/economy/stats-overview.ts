import type { CapitalState } from '../capital.ts'
import { getLevel, getNextLevelThreshold, LEVEL_THRESHOLDS } from '../game.ts'
import { getPortfolio } from '../trading/trades.ts'
import { getTotalEnterpriseIncomeMicrosPerSecond } from './enterprises.ts'

export interface SourceStats {
  readonly id: string
  readonly label: string
  readonly gains: number // profit net positif réalisé ; jamais le capital vendu.
  readonly losses: number // valeur absolue des pertes réalisées.
  readonly net: number
  readonly fraction: number // part de toutes les recettes positives observées.
}

export interface CapitalStatsOverview {
  readonly level: number
  readonly levelStart: number
  readonly nextLevelAt: number | null
  readonly levelProgressPercent: number
  readonly lifetimeEarned: number // source de vérité XP, pas somme des plus-values brutes.
  readonly activePlayMs: number
  readonly clickCount: number
  readonly enterpriseCount: number
  readonly enterpriseLevels: number
  readonly enterpriseIncomePerSecond: number
  readonly enterpriseBookValue: number
  readonly cash: number
  readonly assetMarketValue: number
  readonly unrealizedTradingProfit: number
  readonly taxesDue: number
  readonly taxesPaid: number
  readonly netWorth: number
  readonly sources: readonly SourceStats[]
  readonly totalPositiveSources: number
  readonly totalRealizedTradingProfit: number
  readonly totalRealizedTradingLoss: number
}

const SOURCES = [
  ['clicks', 'Clics'],
  ['dividends', 'Dividendes'],
  ['enterprises', 'Entreprises'],
  ['stocks', 'Actions'],
  ['crypto', 'Cryptomonnaies'],
  ['memecoins', 'Memecoins'],
  ['unclassified', 'Historique non ventilé'],
] as const

export function getCapitalStatsOverview(state: CapitalState): CapitalStatsOverview {
  const level = getLevel(state.game.lifetimeEarned)
  const levelStart = LEVEL_THRESHOLDS[level - 1] ?? 0
  const nextLevelAt = getNextLevelThreshold(state.game.lifetimeEarned)
  const progress = nextLevelAt === null ? 100 :
    Math.min(100, Math.max(0, (state.game.lifetimeEarned - levelStart) /
      Math.max(1, nextLevelAt - levelStart) * 100))

  const portfolio = getPortfolio(state)
  const holdings = Object.values(state.enterprises.owned)
  const enterpriseBookValue = holdings.reduce((sum, holding) => sum + holding.investedCents, 0) / 100
  const due = state.fiscal.taxesDueCents / 100
  const paid = state.fiscal.taxesPaidCents / 100
  // Les taxes déjà payées ont déjà réduit cash. Ne pas les soustraire deux fois.
  const netWorth = state.game.balance + portfolio.marketValue + enterpriseBookValue - due

  const sources = SOURCES.map(([id, label]) => {
    const gains = state.stats.earnedBySource[id]
    const losses = id === 'stocks' || id === 'crypto' || id === 'memecoins'
      ? state.stats.realizedLossesBySource[id] : 0
    return { id, label, gains, losses, net: Math.round((gains - losses) * 100) / 100, fraction: 0 }
  })
  const totalPositiveSources = sources.reduce((sum, source) => sum + source.gains, 0)
  const proportional = sources.map((source) => ({
    ...source,
    fraction: totalPositiveSources > 0 ? source.gains / totalPositiveSources : 0,
  }))
  const totalRealizedTradingProfit = proportional
    .filter((source) => ['stocks', 'crypto', 'memecoins'].includes(source.id))
    .reduce((sum, source) => sum + source.gains, 0)
  const totalRealizedTradingLoss = proportional
    .filter((source) => ['stocks', 'crypto', 'memecoins'].includes(source.id))
    .reduce((sum, source) => sum + source.losses, 0)

  return {
    level,
    levelStart,
    nextLevelAt,
    levelProgressPercent: progress,
    lifetimeEarned: state.game.lifetimeEarned,
    activePlayMs: state.stats.activePlayMs,
    clickCount: state.stats.clickCount,
    enterpriseCount: holdings.length,
    enterpriseLevels: holdings.reduce((sum, holding) => sum + holding.level, 0),
    enterpriseIncomePerSecond: getTotalEnterpriseIncomeMicrosPerSecond(state) / 1_000_000,
    enterpriseBookValue,
    cash: state.game.balance,
    assetMarketValue: portfolio.marketValue,
    unrealizedTradingProfit: portfolio.unrealizedNetProfit,
    taxesDue: due,
    taxesPaid: paid,
    netWorth,
    sources: proportional,
    totalPositiveSources,
    totalRealizedTradingProfit,
    totalRealizedTradingLoss,
  }
}
