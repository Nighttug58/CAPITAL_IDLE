import type { CapitalState } from '../capital.ts'
import { exactMoneyCents } from '../money.ts'
import { earnClick } from '../game.ts'
import { creditExperience } from '../prestige/state.ts'
import type { EarningsSource } from './state.ts'

function monetaryCents(value: number): number | null { return exactMoneyCents(value) }

/** Un clic modifie game + stats en une seule transition, jamais l'XP deux fois. */
export function earnCapitalClick(state: CapitalState): CapitalState {
  const nextGame = earnClick(state.game)
  if (nextGame === state.game) return state
  const reward = nextGame.lifetimeEarned - state.game.lifetimeEarned
  const oldCents = monetaryCents(state.stats.earnedBySource.clicks)
  const rewardCents = monetaryCents(reward)
  if (oldCents === null || rewardCents === null ||
      !Number.isSafeInteger(oldCents + rewardCents) ||
      !Number.isSafeInteger(state.stats.clickCount + 1)) return state

  const credited: CapitalState = {
    ...state, game: nextGame,
    stats: {
      ...state.stats,
      clickCount: state.stats.clickCount + 1,
      earnedBySource: {
        ...state.stats.earnedBySource,
        clicks: (oldCents + rewardCents) / 100,
      },
    },
  }
  return creditExperience(credited, rewardCents) ?? state
}

/** Transactions bénéficiaires et perdantes : gains et pertes distincts de l'XP. */
export function recordRealizedTrade(
  state: CapitalState, source: Extract<EarningsSource, 'stocks' | 'crypto' | 'memecoins'>,
  netProfitCents: number,
): CapitalState | null {
  if (!Number.isSafeInteger(netProfitCents)) return null
  if (netProfitCents === 0) return state
  const gain = netProfitCents > 0
  const old = gain ? state.stats.earnedBySource[source] : state.stats.realizedLossesBySource[source]
  const current = monetaryCents(old)
  const next = current === null ? Number.NaN : current + Math.abs(netProfitCents)
  if (!Number.isSafeInteger(next)) return null
  return {
    ...state,
    stats: gain ? {
      ...state.stats,
      earnedBySource: { ...state.stats.earnedBySource, [source]: next / 100 },
    } : {
      ...state.stats,
      realizedLossesBySource: { ...state.stats.realizedLossesBySource, [source]: next / 100 },
    },
  }
}

/** Les dividendes sont déjà versés en centimes par le moteur Trading. */
export function recordDividendCredit(state: CapitalState, paidCents: number): CapitalState | null {
  if (!Number.isSafeInteger(paidCents) || paidCents < 0) return null
  if (paidCents === 0) return state
  const old = monetaryCents(state.stats.earnedBySource.dividends)
  if (old === null || !Number.isSafeInteger(old + paidCents)) return null
  return {
    ...state,
    stats: {
      ...state.stats,
      earnedBySource: {
        ...state.stats.earnedBySource,
        dividends: (old + paidCents) / 100,
      },
    },
  }
}

/** Comptabilise uniquement les millisecondes avec l'application au premier plan. */
export function recordActivePlay(state: CapitalState, elapsedMs: number): CapitalState {
  const spent = state.stats.activePlayMs + elapsedMs
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs <= 0 ||
      !Number.isSafeInteger(spent)) return state
  return { ...state, stats: { ...state.stats, activePlayMs: spent } }
}
