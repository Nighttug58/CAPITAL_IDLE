import type { CapitalState } from '../capital.ts'
import { advanceEnterpriseIncome, getTotalEnterpriseIncomeMicrosPerSecond } from './enterprises.ts'
import {
  collectTaxesAtDeadline,
  payTaxesEarly,
  type EarlyTaxPaymentResult,
} from './fiscal.ts'
import { FISCAL_PERIOD_MS } from './state.ts'

function validTime(time: number): boolean {
  return Number.isSafeInteger(time) && time >= 0
}

/**
 * Une seule horloge de revenu fixe + fiscalité, sans nouveau timer.
 * Les 72 h sont des heures RÉELLES et persistent d'une session à l'autre.
 *
 * Le temps est découpé à chaque frontière fiscale : revenus crédités et
 * taxés jusqu'au prélèvement, dette prélevée même si le solde devient négatif,
 * puis reprise de la période suivante. Chaque segment reste agrégé (pas de
 * simulation seconde par seconde) même après plusieurs mois hors ligne.
 */
export function advanceFiscalEconomy(state: CapitalState, now: number): CapitalState {
  if (!validTime(now) || now < state.fiscal.periodStartedAt ||
    !validTime(state.enterprises.lastAccruedAt) ||
    now < state.enterprises.lastAccruedAt) return state

  let current = state
  while (current.fiscal.periodStartedAt + FISCAL_PERIOD_MS <= now) {
    const deadline = current.fiscal.periodStartedAt + FISCAL_PERIOD_MS
    if (!validTime(deadline)) return current

    // Cas sans entreprises ni dette : éviter des centaines de milliers de
    // périodes vides (horloge avancée de plusieurs années).
    if (current.fiscal.taxesDueCents === 0 &&
        getTotalEnterpriseIncomeMicrosPerSecond(current) === 0) {
      const periods = Math.floor((now - current.fiscal.periodStartedAt) / FISCAL_PERIOD_MS)
      const anchored = current.fiscal.periodStartedAt + periods * FISCAL_PERIOD_MS
      if (!validTime(anchored)) return current
      current = {
        ...current,
        fiscal: { ...current.fiscal, periodStartedAt: anchored },
      }
      break
    }

    const accrued = advanceEnterpriseIncome(current, deadline)
    // L'horloge d'entreprise peut déjà être plus avancée (parties v5
    // créées avant l'activation fiscale). Ne pas retaxer ces revenus passés.
    if (accrued.enterprises.lastAccruedAt < deadline) return current
    const paid = collectTaxesAtDeadline(accrued, deadline)
    if (!paid) return current
    current = paid
  }
  return advanceEnterpriseIncome(current, now)
}

/** Paiement anticipé intégral : réalise les revenus jusqu'à maintenant puis
 * relance immédiatement la prochaine échéance à maintenant + 72 h. */
export function payFiscalBalanceNow(state: CapitalState, at: number): EarlyTaxPaymentResult {
  if (!validTime(at) || at < state.fiscal.periodStartedAt ||
      at < state.enterprises.lastAccruedAt) {
    return { ok: false, state, error: 'invalid-clock' }
  }
  const current = advanceFiscalEconomy(state, at)
  if (current.enterprises.lastAccruedAt !== at) {
    return { ok: false, state, error: 'money-overflow' }
  }
  const payment = payTaxesEarly(current, at)
  if (!payment.ok) return { ...payment, state: current }
  return payment
}
