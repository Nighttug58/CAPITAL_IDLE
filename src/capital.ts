import { INITIAL_GAME, restoreGame, type GameState } from './game.ts'
import { createInitialTradingState, restoreTradingState } from './trading/state.ts'
import type { TradingState } from './trading/types.ts'

export const CAPITAL_SAVE_VERSION = 4 as const

// Une seule autorité monétaire : game.balance et game.lifetimeEarned.
// trading conserve uniquement positions, cours, événements et statistiques.
export interface CapitalState {
  version: typeof CAPITAL_SAVE_VERSION
  game: GameState
  trading: TradingState
}

export function createCapitalState(game: GameState = { ...INITIAL_GAME }, now = Date.now()): CapitalState {
  return {
    version: CAPITAL_SAVE_VERSION,
    game: { ...game },
    trading: createInitialTradingState(now),
  }
}

export function restoreCapitalState(raw: unknown, now = Date.now()): CapitalState {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || !('version' in raw) || raw.version !== CAPITAL_SAVE_VERSION) {
    return createCapitalState(undefined, now)
  }
  const saved = raw as Record<string, unknown>
  return {
    version: CAPITAL_SAVE_VERSION,
    game: restoreGame(saved.game),
    trading: restoreTradingState(saved.trading, now),
  }
}
