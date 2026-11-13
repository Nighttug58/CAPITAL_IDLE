import type { AssetDefinition, MarketQuote } from './types.ts'

// Les taux annuels sont indépendants du prix. La News exerce une pression sur
// leur pente, mais n'attribue jamais un rendement instantanément.
export const MIN_DIVIDEND_YIELD = 0.01
export const MAX_DIVIDEND_YIELD = 0.30
export const MAX_YIELD_STEP = 0.00024 // au plus 0,024 point de % toutes les 5 s

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

export function advanceDividendYield(
  asset: AssetDefinition,
  current: MarketQuote,
  newsPressure: number,
  nextRandom: () => number,
): { dividendYield: number | null; dividendMomentum?: number } {
  if (asset.kind !== 'stock') return { dividendYield: null }
  const before = current.dividendYield ?? asset.initialDividendYield ?? MIN_DIVIDEND_YIELD
  const momentum = current.dividendMomentum ?? 0
  // Retour de faible amplitude vers la moyenne propre à la société : il évite
  // la saturation, sans remettre le rendement à son ancien niveau après News.
  const tendency = ((asset.initialDividendYield ?? before) - before) * 0.00007
  const noise = (nextRandom() * 2 - 1) * 0.000025
  const wanted = clamp(newsPressure, -1.25, 1.25) * 0.00015 + noise + tendency
  const slope = clamp(momentum * 0.94 + wanted * 0.06, -MAX_YIELD_STEP, MAX_YIELD_STEP)
  const dividendYield = clamp(before + slope, MIN_DIVIDEND_YIELD, MAX_DIVIDEND_YIELD)
  // Éliminer l'inertie orientée hors des bornes, sans forcer un rebond.
  const dividendMomentum =
    (dividendYield === MIN_DIVIDEND_YIELD && slope < 0) ||
    (dividendYield === MAX_DIVIDEND_YIELD && slope > 0) ? 0 : slope
  return { dividendYield, dividendMomentum }
}
