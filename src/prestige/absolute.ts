import type { CapitalState } from '../capital.ts'
import { FAME_BOOST_IDS, MAX_FAME_BOOST_LEVEL } from './catalog.ts'

export const ABSOLUTE_PRESTIGE_FAME_STEP = 100
export const ABSOLUTE_PRESTIGE_FACTOR_PER_STEP = 1.01
const FAME_MICROS_PER_STEP = ABSOLUTE_PRESTIGE_FAME_STEP * 1_000_000

export interface AbsolutePrestigeStatus {
  readonly unlocked: boolean
  readonly purchasedLevels: number
  readonly requiredLevels: number
  readonly fameSteps: number
  readonly nextStepAtFame: number
  readonly factor: number
  readonly overflowed: boolean
}

/**
 * Prestige absolu n'est pas un achat, un jeton ou une valeur persistée.
 * Il se débloque automatiquement si et seulement si les six arbres sont
 * entièrement améliorés et relit la Fame DISPONIBLE, pas la Fame cumulée.
 * Les gains Fame, les imports et les achats rendent ainsi son état cohérent
 * dans la même session comme après rechargement.
 */
export function getAbsolutePrestigeStatus(
  state: Pick<CapitalState, 'prestige'>,
): AbsolutePrestigeStatus {
  const prestige = state.prestige
  const purchasedLevels = FAME_BOOST_IDS.reduce((sum, id) => sum + prestige.boosts[id], 0)
  const requiredLevels = FAME_BOOST_IDS.length * MAX_FAME_BOOST_LEVEL
  const unlocked = FAME_BOOST_IDS.every((id) => prestige.boosts[id] === MAX_FAME_BOOST_LEVEL)
  const micros = Number.isSafeInteger(prestige.fameMicros) && prestige.fameMicros >= 0
    ? prestige.fameMicros : 0
  const fameSteps = Math.floor(micros / FAME_MICROS_PER_STEP)
  const factor = unlocked
    ? ABSOLUTE_PRESTIGE_FACTOR_PER_STEP ** fameSteps
    : 1
  return {
    unlocked, purchasedLevels, requiredLevels,
    fameSteps,
    nextStepAtFame: (fameSteps + 1) * ABSOLUTE_PRESTIGE_FAME_STEP,
    factor,
    overflowed: !Number.isFinite(factor),
  }
}
