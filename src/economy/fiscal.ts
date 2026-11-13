import type { CapitalState } from '../capital.ts'
import { exactMoneyCents } from '../money.ts'
import {
  FISCAL_PERIOD_MS, FISCAL_TAX_RATE,
  type TaxBreakdown, type TaxSource,
} from './state.ts'

const CENTS = 100
const BPS = 10_000n
// Une seule autorité de taux ; conversion entière pour ne pas taxer deux fois
// une même fraction de centime après sauvegarde ou reprise.
export const FISCAL_TAX_BPS = Math.round(FISCAL_TAX_RATE * Number(BPS))
const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER)

function toCents(value: number): number | null { return exactMoneyCents(value) }
function validTime(at: number): boolean {
  return Number.isSafeInteger(at) && at >= 0
}
function blankTaxes(): TaxBreakdown {
  return { enterprises: 0, stocks: 0, crypto: 0, memecoins: 0 }
}
function isSafeCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

/**
 * Ajoute de la taxe uniquement sur un bénéfice POSITIF déjà établi en centimes,
 * jamais sur le produit brut de vente ou sur les plus-values latentes.
 *
 * Entreprises : conserve la fraction infra-centime entre toutes les périodes,
 * pour garantir 15 % du revenu brut indépendamment de la fréquence des ticks.
 * Trading : chaque opération gagnante s'arrondit au centime le plus proche.
 *
 * Retourne null sans mutation si l'état atteindrait les limites monétaires.
 */
export function accrueProfitTax(
  state: CapitalState, source: TaxSource, profitCents: number,
): CapitalState | null {
  if (!isSafeCents(profitCents)) return null
  if (profitCents === 0) return state
  const fractional = source === 'enterprises' ? state.fiscal.enterpriseTaxRemainderBps : 0
  if (!isSafeCents(fractional) || fractional >= Number(BPS)) return null
  const taxable = BigInt(profitCents) * BigInt(FISCAL_TAX_BPS) + BigInt(fractional)
  const taxCents = source === 'enterprises'
    ? taxable / BPS
    : (taxable + BPS / 2n) / BPS
  if (taxCents > MAX_CENTS) return null
  const remainder = source === 'enterprises' ? Number(taxable % BPS) : 0
  const add = Number(taxCents)
  const due = state.fiscal.taxesDueCents + add
  const sourceDue = state.fiscal.dueBySourceCents[source] + add
  if (!Number.isSafeInteger(due) || !Number.isSafeInteger(sourceDue)) return null
  if (add === 0 && remainder === fractional) return state

  return {
    ...state,
    fiscal: {
      ...state.fiscal,
      taxesDueCents: due,
      dueBySourceCents: { ...state.fiscal.dueBySourceCents, [source]: sourceDue },
      enterpriseTaxRemainderBps: source === 'enterprises' ? remainder : state.fiscal.enterpriseTaxRemainderBps,
    },
  }
}

/** Paye toutes les taxes dues, y compris en cash négatif ; ne réduit pas l'XP. */
function debitTaxes(state: CapitalState, at: number): CapitalState | null {
  const cash = toCents(state.game.balance)
  const amount = state.fiscal.taxesDueCents
  if (cash === null || !isSafeCents(amount) || !validTime(at)) return null
  const balance = BigInt(cash) - BigInt(amount)
  if (balance > MAX_CENTS || balance < -MAX_CENTS) return null

  const sources = state.fiscal.dueBySourceCents
  const paidBySource: TaxBreakdown = { ...state.fiscal.paidBySourceCents }
  for (const source of ['enterprises', 'stocks', 'crypto', 'memecoins'] as const) {
    const cumulative = paidBySource[source] + sources[source]
    if (!Number.isSafeInteger(cumulative)) return null
    paidBySource[source] = cumulative
  }
  const paid = state.fiscal.taxesPaidCents + amount
  if (!Number.isSafeInteger(paid)) return null

  return {
    ...state,
    game: amount === 0 ? state.game : { ...state.game, balance: Number(balance) / CENTS },
    fiscal: {
      ...state.fiscal,
      periodStartedAt: at,
      taxesDueCents: 0,
      taxesPaidCents: paid,
      dueBySourceCents: blankTaxes(),
      paidBySourceCents: paidBySource,
    },
  }
}

/**
 * Prélèvement d'une ou de plusieurs échéances consécutives.
 *
 * Entre deux interactions, les entreprises n'évoluent pas et aucune vente
 * automatique n'est possible. Il est donc mathématiquement identique de
 * collecter en une fois la dette des périodes écoulées : le brut, le cumul
 * des taxes payées, les reliquats et le solde final sont rigoureusement
 * ceux des débits successifs toutes les 72 heures, sans intérêts ni pénalité.
 * Le compteur reste ancré à la DERNIÈRE échéance, jamais au rechargement.
 */
export function collectTaxesAtDeadline(state: CapitalState, at: number): CapitalState | null {
  const elapsed = at - state.fiscal.periodStartedAt
  if (!validTime(at) || !validTime(state.fiscal.periodStartedAt) ||
      !Number.isSafeInteger(elapsed) || elapsed < FISCAL_PERIOD_MS ||
      elapsed % FISCAL_PERIOD_MS !== 0) return null
  return debitTaxes(state, at)
}

export type EarlyTaxPaymentResult =
  | { readonly ok: true; readonly state: CapitalState; readonly amountCents: number }
  | { readonly ok: false; readonly state: CapitalState; readonly error: 'nothing-due' | 'invalid-clock' | 'money-overflow' }

/**
 * Payer en avance, en réinitialisant l'horloge à exactement 72 h.
 * Doit recevoir un état dont les revenus ont été rattrapés à `at`.
 */
export function payTaxesEarly(state: CapitalState, at: number): EarlyTaxPaymentResult {
  if (!validTime(at) || at < state.fiscal.periodStartedAt ||
    at >= state.fiscal.periodStartedAt + FISCAL_PERIOD_MS) {
    return { ok: false, state, error: 'invalid-clock' }
  }
  if (state.fiscal.taxesDueCents === 0) return { ok: false, state, error: 'nothing-due' }
  const amountCents = state.fiscal.taxesDueCents
  const paid = debitTaxes(state, at)
  if (!paid) return { ok: false, state, error: 'money-overflow' }
  return { ok: true, state: paid, amountCents }
}
