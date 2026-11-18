/**
 * One exact V8 authority for Ascension of Fame. The factor is represented in
 * 10^-15 units, never by a huge 1.01**Number operation. Each bounded
 * exponentiation is logarithmic in the Fame-step count and caps intermediate
 * values before their size can explode.
 */
import { FAME_BOOST_IDS, MAX_FAME_BOOST_LEVEL, type FameBoostId } from './catalog.ts'
import { prestigeCycleCount, type ExactPrestigeCounter } from '../ascension/prestige-count-v8.ts'
import { formatCompactUnits } from '../large-numbers.ts'

export const FAME_FACTOR_SCALE = 1_000_000_000_000_000n
export const FAME_STEP_MICROS = 100_000_000n
const FAME_STEP_RATE = 101n * FAME_FACTOR_SCALE / 100n

export interface ExactAbsoluteFameStatus {
  readonly unlocked: boolean
  readonly purchasedLevels: number
  readonly requiredLevels: number
  readonly fameSteps: bigint
  readonly nextStepAtFameMicros: bigint
  readonly factorUnits: bigint
  readonly capUnits: bigint
  readonly capped: boolean
}
type FameLevels = Readonly<Record<FameBoostId, number>>

function boundedProduct(left: bigint, right: bigint, ceiling: bigint): bigint {
  if (left >= ceiling || right >= ceiling) return ceiling
  const product = (left * right + FAME_FACTOR_SCALE / 2n) / FAME_FACTOR_SCALE
  return product >= ceiling ? ceiling : product
}

/** Fixed-rational exponentiation with a strict cap and no floating exponent. */
export function fameStepFactorUnits(steps: bigint, cap: bigint): bigint {
  if (steps < 0n || cap < 1n) throw new RangeError('Invalid Fame factor')
  const ceiling = cap * FAME_FACTOR_SCALE
  let power = FAME_STEP_RATE
  let factor = FAME_FACTOR_SCALE
  let remaining = steps
  while (remaining > 0n && factor < ceiling) {
    if (remaining & 1n) factor = boundedProduct(factor, power, ceiling)
    remaining >>= 1n
    if (remaining > 0n) power = boundedProduct(power, power, ceiling)
  }
  return factor
}

export function exactAbsoluteFameStatus(
  levels: FameLevels, availableFameMicros: bigint, completedCycles: bigint,
): ExactAbsoluteFameStatus {
  if (availableFameMicros < 0n || completedCycles < 0n) throw new RangeError('Negative Fame or cycle count')
  const requiredLevels = FAME_BOOST_IDS.length * MAX_FAME_BOOST_LEVEL
  const purchasedLevels = FAME_BOOST_IDS.reduce((sum, id) => sum + levels[id], 0)
  const unlocked = FAME_BOOST_IDS.every(id => levels[id] === MAX_FAME_BOOST_LEVEL)
  const fameSteps = availableFameMicros / FAME_STEP_MICROS
  const capUnits = (100n + completedCycles) * FAME_FACTOR_SCALE
  const factorUnits = unlocked ? fameStepFactorUnits(fameSteps, 100n + completedCycles) : FAME_FACTOR_SCALE
  return { unlocked, purchasedLevels, requiredLevels, fameSteps,
    nextStepAtFameMicros: (fameSteps + 1n) * FAME_STEP_MICROS,
    factorUnits, capUnits, capped: unlocked && factorUnits >= capUnits,
  }
}

export function v8AbsoluteFameStatus(state: {
  readonly prestige: { readonly boosts: FameLevels; readonly fameMicros: string }
  readonly ascension: { readonly progress: ExactPrestigeCounter }
}): ExactAbsoluteFameStatus {
  return exactAbsoluteFameStatus(
    state.prestige.boosts, BigInt(state.prestige.fameMicros),
    prestigeCycleCount(state.ascension.progress),
  )
}

/** Human-facing only; never used for an economic calculation. */
export function formatFameFactor(units: bigint): string {
  if (units >= 1_000_000_000n * FAME_FACTOR_SCALE)
    return formatCompactUnits(units, 15, '')
  // Round the WHOLE fixed-point number before separating digits. Rounding
  // 1.999999999999999 to six places must display 2, never 1.1000000.
  const rounded = (units + 500_000_000n) / 1_000_000_000n
  const whole = (rounded / 1_000_000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  const fraction = (rounded % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return whole + (fraction ? '.' + fraction : '')
}

export function formatExactBasisPoints(bpsNumerator: bigint, denominator = 1n): string {
  // Truncate only the visible 1/10 000 percent after exact ratio arithmetic.
  if (denominator <= 0n) throw new RangeError('Invalid rate')
  const basisPointsTenThousandth = (bpsNumerator * 100n + denominator / 2n) / denominator
  return (basisPointsTenThousandth / 10_000n).toString() + '.' +
    (basisPointsTenThousandth % 10_000n).toString().padStart(4,'0').replace(/0+$/,'').padEnd(1,'0') + ' %'
}
