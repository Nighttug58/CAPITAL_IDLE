import { INITIAL_GAME, getLevel } from '../game.ts'
import { advanceFiscalEconomy } from '../economy/clock.ts'
import { createInitialEnterpriseState, createInitialStatsState } from '../economy/state.ts'
import { getCapitalStatsOverview } from '../economy/stats-overview.ts'
import { createInitialTradingState } from '../trading/state.ts'
import { MARKET_TICK_MS } from '../trading/market.ts'
import { DIVIDEND_SECOND_MS } from '../trading/dividends.ts'
import type { CapitalState } from '../capital.ts'
import {
  eligiblePrestigeWorthFromOverview, previewPrestigePoints, ASCENSION_MIN_LEVEL,
  ASCENSION_MIN_WORTH_USD,
} from './contracts.ts'
import { createInitialAscensionRun, MAX_ASCENSION_HISTORY } from './state.ts'

export type AscensionError =
  | 'invalid-clock' | 'pending-market-replay' | 'pending-fiscal-debt'
  | 'insufficient-level' | 'insufficient-worth' | 'money-overflow' | 'storage-error'

export interface AscensionReceipt {
  readonly cycle: number
  readonly earnedPoints: number
  readonly totalPoints: number
  readonly eligibleWorthCents: number
  readonly completedAt: number
}
export type AscensionResult =
  | { readonly ok: true; readonly state: CapitalState; readonly receipt: AscensionReceipt }
  | { readonly ok: false; readonly state: CapitalState; readonly error: AscensionError }

function reject(state: CapitalState, error: AscensionError): AscensionResult {
  return { ok: false, state, error }
}

/**
 * Pure domain transition: never writes a save, never triggers a timer and does
 * not grant points on failure. Persist the result atomically at the UI boundary.
 * A stale catch-up is refused until the existing market runtime finishes replay.
 */
export function performPrestige(state: CapitalState, at: number): AscensionResult {
  if (!Number.isSafeInteger(at) || at < 0 ||
      at < state.enterprises.lastAccruedAt || at < state.fiscal.periodStartedAt ||
      at < state.trading.lastTickAt || at < state.trading.dividendLastPaidAt ||
      at < state.ascension.run.startedAtRealMs) return reject(state, 'invalid-clock')

  const settled = advanceFiscalEconomy(state, at)
  if (settled.enterprises.lastAccruedAt !== at) return reject(state, 'money-overflow')

  // Fiscal runtime can catch up in O(1), but market/dividends have bounded
  // replay; do not erase positions while a backlog can still pay income.
  if (at - settled.trading.lastTickAt >= MARKET_TICK_MS ||
      at - settled.trading.dividendLastPaidAt >= DIVIDEND_SECOND_MS) {
    return reject(state, 'pending-market-replay')
  }
  if (settled.fiscal.taxesDueCents > 0) return reject(state, 'pending-fiscal-debt')
  const level = getLevel(settled.prestige.experienceCents / 100)
  if (level < ASCENSION_MIN_LEVEL) return reject(state, 'insufficient-level')

  const eligible = eligiblePrestigeWorthFromOverview(getCapitalStatsOverview(settled))
  if (eligible === null) return reject(state, 'money-overflow')
  if (eligible < ASCENSION_MIN_WORTH_USD) return reject(state, 'insufficient-worth')
  const cents = Math.round(eligible * 100)
  const earnedPoints = previewPrestigePoints(eligible, level)
  const progress = settled.ascension.progress
  const totalPoints = progress.availablePoints + earnedPoints
  const lifetimePoints = progress.lifetimePoints + earnedPoints
  const count = progress.prestigeCount + 1
  if (![cents, earnedPoints, totalPoints, lifetimePoints, count].every(Number.isSafeInteger)) {
    return reject(state, 'money-overflow')
  }

  const summary = {
    cycle: count, completedAtRealMs: at,
    eligibleWorthCents: cents, earnedPoints, levelAtCompletion: level,
  }
  return {
    ok: true,
    receipt: { cycle: count, earnedPoints, totalPoints, eligibleWorthCents: cents, completedAt: at },
    state: {
      ...settled,
      game: { ...INITIAL_GAME },
      // Deterministic fresh PRNG per completed cycle: no hidden Math.random.
      trading: createInitialTradingState(at, ((settled.trading.seed + count * 0x9E3779B9) >>> 0) || 1),
      enterprises: createInitialEnterpriseState(at),
      stats: createInitialStatsState(at),
      // Fiscal period and cumulative taxes PAID deliberately survive.
      // No tax debt exists when this branch is reached.
      prestige: {
        ...settled.prestige,
        experienceCents: 0, experienceCarryBps: 0,
        clickCarryBps: 0, tradingCarryBps: 0,
        lastAwardedLevel: 1,
      },
      ascension: {
        progress: {
          ...progress, availablePoints: totalPoints, lifetimePoints,
          prestigeCount: count,
          history: [...progress.history, summary].slice(-MAX_ASCENSION_HISTORY),
        },
        run: createInitialAscensionRun(at),
      },
    },
  }
}

/**
 * UI must stop its runtime BEFORE calling writer (replaceCapitalSave). On a
 * storage failure, keep the complete old state and never spend/grant points.
 * The supplied writer is testable without localStorage or browser globals.
 */
export function commitPrestige(
  state: CapitalState, at: number, writer: (next: CapitalState) => boolean,
): AscensionResult {
  const proposed = performPrestige(state, at)
  if (!proposed.ok) return proposed
  try {
    return writer(proposed.state) ? proposed : reject(state, 'storage-error')
  } catch {
    return reject(state, 'storage-error')
  }
}
