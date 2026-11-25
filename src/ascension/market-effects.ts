import type { CapitalState } from '../capital.ts'
import { ASSETS } from '../trading/catalog.ts'
import { getNewsPresentation, isGlobalBearishNews } from '../trading/news.ts'
import type { AscensionSpeed } from './contracts.ts'
import { transcendentNewsModifiers, type TranscendentShopV1 } from './transcendent-v1.ts'

export const MARKET_SPEEDS = [1, 1.5, 2, 3, 4, 5] as const
export const FRENZY_ACTIVE_MS = 60_000
export const FRENZY_COOLDOWN_MS = 30 * 60_000

export function marketSpeed(state: CapitalState): AscensionSpeed {
  const unlocked = state.ascension.progress.upgradeLevels['time-accelerator']
  const selected = state.ascension.run.marketClock.selectedSpeed
  const index = MARKET_SPEEDS.indexOf(selected)
  return index >= 0 && index <= unlocked ? selected : 1
}

export type MarketActionResult =
  | { readonly ok: true; readonly state: CapitalState }
  | { readonly ok: false; readonly state: CapitalState; readonly error: 'locked' | 'invalid-speed' | 'invalid-time' | 'cooldown' | 'pending-replay' | 'storage-error' }

export function selectMarketSpeed(
  state: CapitalState, speed: number, at = state.trading.dividendLastPaidAt,
): MarketActionResult {
  if (!Number.isSafeInteger(at) || at < state.trading.dividendLastPaidAt) {
    return { ok: false, state, error: 'invalid-time' }
  }
  if (at - state.trading.dividendLastPaidAt >= 1_000) {
    return { ok: false, state, error: 'pending-replay' }
  }
  const index = MARKET_SPEEDS.indexOf(speed as AscensionSpeed)
  if (index < 0) return { ok: false, state, error: 'invalid-speed' }
  if (index > state.ascension.progress.upgradeLevels['time-accelerator']) {
    return { ok: false, state, error: 'locked' }
  }
  const clock = state.ascension.run.marketClock
  if (clock.selectedSpeed === speed) return { ok: true, state }
  return { ok: true, state: {
    ...state, ascension: { ...state.ascension, run: {
      ...state.ascension.run, marketClock: { ...clock, selectedSpeed: speed as AscensionSpeed },
    }},
  }}
}

export function frenzyActive(state: CapitalState, at: number): boolean {
  const ends = state.ascension.run.frenzyEndsAtRealMs ?? 0
  return state.ascension.progress.upgradeLevels['market-frenzy'] > 0 &&
    at >= ends - FRENZY_ACTIVE_MS && at < ends
}

export function activateMarketFrenzy(state: CapitalState, at: number): MarketActionResult {
  if (!Number.isSafeInteger(at) || at < state.trading.dividendLastPaidAt ||
      at < state.ascension.run.marketClock.realAnchorMs) return { ok: false, state, error: 'invalid-time' }
  if (at - state.trading.dividendLastPaidAt >= 1_000) {
    return { ok: false, state, error: 'pending-replay' }
  }
  if (!state.ascension.progress.upgradeLevels['market-frenzy']) {
    return { ok: false, state, error: 'locked' }
  }
  if (at < (state.ascension.run.frenzyReadyAtRealMs ?? 0)) {
    return { ok: false, state, error: 'cooldown' }
  }
  return { ok: true, state: {
    ...state, ascension: { ...state.ascension, run: {
      ...state.ascension.run, frenzyEndsAtRealMs: at + FRENZY_ACTIVE_MS,
      frenzyReadyAtRealMs: at + FRENZY_COOLDOWN_MS,
    }},
  }}
}

export function marketNewsEffects(state: CapitalState, realAt: number) {
  const levels = state.ascension.progress.upgradeLevels
  // V7 projection is display-only, but retains V8's advanced ranks by spread.
  const advanced=transcendentNewsModifiers(state.ascension.progress as
    typeof state.ascension.progress & {transcendentV1?:TranscendentShopV1})
  return {
    durationMultiplier: 1 + 0.25 * levels['news-duration'] + advanced.durationAdditional,
    impactMultiplier: (1 + 0.25 * levels['news-impact'] + advanced.powerAdditional) * (frenzyActive(state, realAt) ? 1.5 : 1),
    rampFraction: advanced.rampFraction,
    frequencyMultiplier: 1 + 0.05 * levels['news-frequency'],
    propagateSingle: levels['news-propagation'] > 0,
  }
}

export function peekUpcomingNews(state: CapitalState, realAt: number) {
  const level = state.ascension.progress.upgradeLevels['news-preview']
  const next = state.trading.upcomingNews
  if (!level || !next || isGlobalBearishNews(next) || realAt >= next.startedAt ||
      next.startedAt - realAt > level * 6_000) return null
  const presentation = getNewsPresentation(next)
  return presentation ? { event: next, presentation, secondsRemaining: Math.ceil((next.startedAt - realAt) / 1000) } : null
}

export interface VolatilityItem {
  readonly id: string
  readonly symbol: string
  readonly kind: 'stock' | 'crypto' | 'memecoin'
  readonly changePercent: number
  readonly volatilityPercent: number
}

/** Last-hour realized chart dispersion; never invent a prediction or hidden price. */
export function volatilityRadar(state: CapitalState): readonly VolatilityItem[] {
  if (!state.ascension.progress.upgradeLevels['volatility-radar']) return []
  return volatilityRadarHistory(state.trading.history)
}

export function volatilityRadarHistory(series:CapitalState['trading']['history']):readonly VolatilityItem[]{
  return ASSETS.filter(asset => (series[asset.id]?.length ?? 0) >= 2).map(asset => {
    const history = series[asset.id] ?? []
    const first = history[0]?.price ?? asset.referencePrice
    const last = history[history.length - 1]?.price ?? asset.referencePrice
    let high = first
    let low = first
    for (const sample of history) {
      high = Math.max(high, sample.price)
      low = Math.min(low, sample.price)
    }
    return {
      id: asset.id, symbol: asset.symbol, kind: asset.kind,
      changePercent: (last / first - 1) * 100,
      volatilityPercent: (high / low - 1) * 100,
    }
  }).sort((a, b) => b.volatilityPercent - a.volatilityPercent).slice(0, 10)
}
