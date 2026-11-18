import type { CapitalState } from '../capital.ts'
import { FAME_BOOST_IDS, MAX_FAME_BOOST_LEVEL } from './catalog.ts'
import { exactAbsoluteFameStatus, FAME_FACTOR_SCALE } from './absolute-v8.ts'

export const ABSOLUTE_PRESTIGE_FAME_STEP = 100
export const ABSOLUTE_PRESTIGE_FACTOR_PER_STEP = 1.01
/** Safety ceiling: Fame remains intact; only the effective multiplier is bounded. */
export const ABSOLUTE_PRESTIGE_MAX_FACTOR = 100
const FAME_MICROS_PER_STEP = ABSOLUTE_PRESTIGE_FAME_STEP * 1_000_000

export interface AbsolutePrestigeStatus {
  readonly unlocked: boolean
  readonly purchasedLevels: number
  readonly requiredLevels: number
  readonly fameSteps: number
  readonly nextStepAtFame: number
  readonly factor: number
  readonly capped: boolean
}

/**
 * Prestige absolu n'est pas un achat, un jeton ou une valeur persistée.
 * Il se débloque automatiquement si et seulement si les six arbres sont
 * entièrement améliorés et relit la Fame DISPONIBLE, pas la Fame cumulée.
 * Les gains Fame, les imports et les achats rendent ainsi son état cohérent
 * dans la même session comme après rechargement.
 */
export function getAbsolutePrestigeStatus(
  state: Pick<CapitalState, 'prestige'> & Partial<Pick<CapitalState, 'ascension'>>,
): AbsolutePrestigeStatus {
  const prestige = state.prestige
  const purchasedLevels = FAME_BOOST_IDS.reduce((sum, id) => sum + prestige.boosts[id], 0)
  const requiredLevels = FAME_BOOST_IDS.length * MAX_FAME_BOOST_LEVEL
  const unlocked = FAME_BOOST_IDS.every((id) => prestige.boosts[id] === MAX_FAME_BOOST_LEVEL)
  const micros = Number.isSafeInteger(prestige.fameMicros) && prestige.fameMicros >= 0
    ? prestige.fameMicros : 0
  const fameSteps = Math.floor(micros / FAME_MICROS_PER_STEP)
  // Compatibility view only. The V8 engine and V8 views use the exact
  // factor returned by the same pure core, without floating exponentiation.
  const exact = exactAbsoluteFameStatus(prestige.boosts, BigInt(micros),
    BigInt(state.ascension?.progress.prestigeCount ?? 0))
  const capped = exact.capped
  const factor = unlocked
    ? capped ? Number(exact.capUnits / FAME_FACTOR_SCALE) :
      ABSOLUTE_PRESTIGE_FACTOR_PER_STEP ** fameSteps
    : 1
  return {
    unlocked, purchasedLevels, requiredLevels,
    fameSteps,
    nextStepAtFame: (fameSteps + 1) * ABSOLUTE_PRESTIGE_FAME_STEP,
    factor,
    capped,
  }
}
