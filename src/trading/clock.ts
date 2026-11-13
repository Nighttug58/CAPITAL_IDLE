import { MARKET_HISTORY_MS, MARKET_TICK_MS, advanceMarketTick } from './market.ts'
import type { TradingState } from './types.ts'

// Ne jamais réaliser toute une absence dans un seul appel bloquant.
// Le retard restant reste dans lastTickAt et sera repris exactement au même tick.
export const MAX_CATCH_UP_TICKS = 128

export interface MarketCatchUp {
  state: TradingState
  processedTicks: number
  pendingTicks: number
}

export function catchUpMarket(
  state: TradingState,
  now: number,
  maxTicks = MAX_CATCH_UP_TICKS,
): MarketCatchUp {
  // Un appareil dont l'horloge recule ne détruit pas l'état, et un temps invalide
  // ne déclenche jamais une boucle infinie. Une avance exagérée reste un retard
  // explicite à traiter, sans sauter silencieusement les ticks ou les gains futurs.
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(state.lastTickAt) ||
      state.lastTickAt < 0 || now <= state.lastTickAt) {
    return { state, processedTicks: 0, pendingTicks: 0 }
  }

  const available = Math.floor((now - state.lastTickAt) / MARKET_TICK_MS)
  const budget = Number.isFinite(maxTicks) ? Math.max(0, Math.min(MAX_CATCH_UP_TICKS, Math.floor(maxTicks))) : 0
  const steps = Math.min(available, budget)
  if (steps === 0) return { state, processedTicks: 0, pendingTicks: available }

  let updated = state
  const historicalCutoff = now - MARKET_HISTORY_MS
  for (let index = 0; index < steps; index++) {
    const nextTime = updated.lastTickAt + MARKET_TICK_MS
    // Avant la fenêtre consultable, on déroule exactement le même PRNG,
    // momentum et régime, sans allouer 45 historiques inutiles.
    updated = advanceMarketTick(updated, nextTime > historicalCutoff)
  }

  return {
    state: updated,
    processedTicks: steps,
    pendingTicks: available - steps,
  }
}
