import type { CapitalState } from '../capital.ts'
import { advanceEnterpriseIncome } from './enterprises.ts'
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
 * Reprise économique constante en durée : O(1) par appel, même après des années.
 * 1. Créditer les revenus fixes BRUTS jusqu'à la dernière échéance complète.
 * 2. Transférer toutes les taxes des périodes complètes dans `taxesPaid`.
 * 3. Créditer l'intervalle partiel restant : ses taxes restent dues.
 *
 * Les entreprises ne changent pas de niveau pendant l'absence, les impôts
 * n'ont ni intérêts ni pénalité, et aucun titre n'est vendu automatiquement.
 * Le résultat final en cash, XP, taxe et reliquat est donc identique à celui
 * d'une exécution chronologique de CHAQUE échéance de 72 heures.
 *
 * Important : le marché et les dividendes ont leur propre horloge de replay
 * borné. Tous les chemins (runtime, secondes Trading, paiement manuel)
 * doivent emprunter cette fonction ; jamais accréditer les entreprises
 * séparément à une date plus tardive que la prochaine échéance.
 */
export function advanceFiscalEconomy(state: CapitalState, now: number): CapitalState {
  const start = state.fiscal.periodStartedAt
  const lastAccrued = state.enterprises.lastAccruedAt
  if (!validTime(now) || !validTime(start) || !validTime(lastAccrued) ||
      now < start || now < lastAccrued) return state

  const elapsed = now - start
  if (!Number.isSafeInteger(elapsed)) return state
  const completePeriods = Math.floor(elapsed / FISCAL_PERIOD_MS)
  if (completePeriods === 0) return advanceEnterpriseIncome(state, now)

  // Toute la division temporelle est en ms entiers sûrs : aucune perte de
  // période ou d'alignement à 72h après une longue absence.
  const lastDeadline = start + completePeriods * FISCAL_PERIOD_MS
  if (!validTime(lastDeadline) || lastDeadline > now) return state

  // Un ancien état peut contenir un lastAccruedAt déjà situé au-delà de la
  // dernière échéance (rattrapage direct avant cette passe). Ces gains ont
  // déjà été taxés à l'accrual : on n'en crédite aucun une seconde fois.
  // On solde la dette existante à la dernière échéance, puis on reprend.
  const prepared = lastAccrued > lastDeadline
    ? state
    : advanceEnterpriseIncome(state, lastDeadline)
  if (prepared.enterprises.lastAccruedAt < lastDeadline) return state

  const closed = collectTaxesAtDeadline(prepared, lastDeadline)
  if (!closed) return state
  return advanceEnterpriseIncome(closed, now)
}

/**
 * Paiement anticipé intégral (même en cash négatif) : traite d'abord le temps
 * réel et les échéances, puis relance 72h à la date du paiement confirmé.
 */
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
