/** Cycle-scoped Auto Click: paid in exact dollars, independent of permanent PP.
 * Each purchased rank grants one ordinary click each real elapsed second.
 * Historical PP Auto Click levels are preserved solely for the pass-6 refund.
 */
import type { V8CapitalState } from './exact-state-v8.ts'
import { getExactAmount as cents, withExactAmount as exact } from './exact-state-v8.ts'

export const DOLLAR_AUTOCLICK_MAX_LEVEL = 20
const FIRST_COST_CENTS = 250_000n // $2,500 at rank 1

/** 2,500 $ × nextRank² × 1.25^(nextRank−1), rounded down to cents. */
export function dollarAutoClickPriceCents(currentLevel: number): bigint | null {
  if (!Number.isSafeInteger(currentLevel) || currentLevel < 0 ||
      currentLevel >= DOLLAR_AUTOCLICK_MAX_LEVEL) return null
  const nextRank = BigInt(currentLevel + 1)
  return FIRST_COST_CENTS * nextRank * nextRank * 5n ** BigInt(currentLevel) /
    4n ** BigInt(currentLevel)
}

export function getDollarAutoClickLevel(state: V8CapitalState): number {
  return state.ascension.run.autoClickLevel ?? 0
}

/** Purchase is a pure atomic V8 transaction: no XP/Fame or taxable income. */
export function buyDollarAutoClick(state: V8CapitalState, at: number): V8CapitalState | null {
  const level = getDollarAutoClickLevel(state)
  const price = dollarAutoClickPriceCents(level)
  if (price === null || !Number.isSafeInteger(at) || at < state.ascension.run.startedAtRealMs ||
      cents(state.game.balance) < price) return null
  return {
    ...state,
    game: { ...state.game, balance: exact(cents(state.game.balance) - price) },
    ascension: { ...state.ascension, run: { ...state.ascension.run,
      autoClickLevel: level + 1,
      // No reward at purchase time: first earned ticks occur after activation.
      lastAutomationAtRealMs: at,
    } },
  }
}

/** Initialize a missing legacy cursor only; never erase uncredited elapsed time. */
export function armDollarAutoClick(state: V8CapitalState, at: number): V8CapitalState {
  if (getDollarAutoClickLevel(state) === 0 || !Number.isSafeInteger(at) ||
      at < state.ascension.run.startedAtRealMs) return state
  if (state.ascension.run.lastAutomationAtRealMs !== undefined) return state
  return { ...state, ascension: { ...state.ascension,
    run: { ...state.ascension.run, lastAutomationAtRealMs: at },
  } }
}
