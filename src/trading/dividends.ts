import type { CapitalState } from '../capital.ts'
import { creditExperience } from '../prestige/state.ts'
import { getBonusMultiplier } from '../prestige/bonuses.ts'
import { advanceFiscalEconomy } from '../economy/clock.ts'
import { recordDividendCredit } from '../economy/stats-ledger.ts'
import { ASSETS } from './catalog.ts'
import { MARKET_TICK_MS, advanceMarketTick } from './market.ts'
import type { TradingState } from './types.ts'

export const DIVIDEND_SECOND_MS = 1_000
export const GAME_YEAR_SECONDS = 86_400
export const CENTS_PER_DOLLAR = 100
const MAX_CENTS = Number.MAX_SAFE_INTEGER
const STOCKS = ASSETS.filter((asset) => asset.kind === 'stock')

// Le reste en-dessous du centime est conservé d'une seconde à l'autre,
// indépendamment des achats, ventes, sauvegardes et périodes hors ligne.
export function dividendCentsForSecond(trading: TradingState): number {
  let accrued = 0
  for (const stock of STOCKS) {
    const owned = trading.positions[stock.id]?.quantity ?? 0
    if (!(owned > 0)) continue
    const yieldNow = trading.quotes[stock.id]?.dividendYield ?? stock.initialDividendYield
    if (yieldNow === null || !Number.isFinite(yieldNow)) continue
    accrued += owned * stock.referencePrice * yieldNow * CENTS_PER_DOLLAR / GAME_YEAR_SECONDS
  }
  return accrued
}

// Une seconde = un versement potentiel. À la cinquième seconde on fait avancer
// le marché d'abord : les quatre autres secondes utilisent le rendement courant.
// Une partie arrêtée ne peut donc pas payer deux fois la même seconde.
export function advanceCapitalSecond(capital: CapitalState, recordHistory = true): CapitalState {
  const previous = capital.trading.dividendLastPaidAt
  const at = previous + DIVIDEND_SECOND_MS
  if (!Number.isSafeInteger(at)) return capital

  let trading = capital.trading
  if (at >= trading.lastTickAt + MARKET_TICK_MS) {
    trading = advanceMarketTick(trading, recordHistory)
  }

  const accruedCents = dividendCentsForSecond(trading) * getBonusMultiplier(capital, 'dividend')
  const totalCents = trading.dividendCarry + trading.dividendPendingCents + accruedCents
  if (!Number.isFinite(totalCents) || totalCents < 0 || totalCents > MAX_CENTS) {
    // Ne pas avancer l'horloge plutôt que perdre un versement non représentable.
    return capital
  }

  const due = Math.floor(totalCents + 1e-10)
  const carry = Math.max(0, Math.min(0.999999999999, totalCents - due))
  const balanceCents = Math.round(capital.game.balance * CENTS_PER_DOLLAR)
  const lifetimeCents = Math.round(capital.game.lifetimeEarned * CENTS_PER_DOLLAR)
  if (!Number.isSafeInteger(balanceCents) || !Number.isSafeInteger(lifetimeCents)) return capital

  const canCredit = Math.min(due, MAX_CENTS - balanceCents, MAX_CENTS - lifetimeCents)
  const paidCents = Math.max(0, canCredit)
  const dividendPendingCents = due - paidCents
  if (!Number.isSafeInteger(dividendPendingCents)) return capital

  const credited: CapitalState = {
    ...capital,
    game: paidCents > 0
      ? {
        ...capital.game,
        balance: (balanceCents + paidCents) / CENTS_PER_DOLLAR,
        lifetimeEarned: (lifetimeCents + paidCents) / CENTS_PER_DOLLAR,
      }
      : capital.game,
    trading: {
      ...trading,
      dividendLastPaidAt: at,
      dividendCarry: carry,
      dividendPendingCents,
    },
  }
  // Même propriétaire de la chronologie fiscale que le runtime : le replay
  // Trading ne peut plus encaisser un revenu d'entreprise après une échéance
  // sans prélever d'abord la dette des 72 heures correspondantes.
  const tracked = recordDividendCredit(credited, paidCents)
  if (!tracked) return capital // Ne pas encaisser sans tracer le dividende.
  const withXp = creditExperience(tracked, paidCents)
  if (!withXp) return capital
  return advanceFiscalEconomy(withXp, at)
}
