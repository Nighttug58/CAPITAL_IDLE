import type { CapitalState } from '../capital.ts'
import { exactMoneyCents } from '../money.ts'
import { getLevel } from '../game.ts'
import {
  ENTERPRISES,
  getEnterprise, getEnterpriseIncomeMicrosPerSecond, getEnterpriseUpgradeCostCents,
  isEnterpriseUnlocked,
} from './catalog.ts'
import { MAX_ENTERPRISE_LEVEL } from './state.ts'
import { accrueProfitTax } from './fiscal.ts'

const CENTS_PER_DOLLAR = 100
// Revenu catalogue = microdollars par SECONDE ; une milliseconde vaut 1 nanodollar.
// 10 millions de nanodollars correspondent exactement à 1 centime.
const NANODOLLARS_PER_CENT = 10_000_000n
const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER)

export type EnterpriseAction = 'buy' | 'upgrade'
export type EnterpriseError =
  | 'unknown-enterprise' | 'level-locked' | 'already-owned' | 'not-owned'
  | 'max-level' | 'insufficient-funds' | 'invalid-clock' | 'money-overflow'

export interface EnterpriseReceipt {
  readonly enterpriseId: string
  readonly action: EnterpriseAction
  readonly costCents: number
  readonly level: number
  readonly incomeMicrosPerSecond: number
}
export type EnterpriseResult =
  | { readonly ok: true; readonly state: CapitalState; readonly receipt: EnterpriseReceipt }
  | { readonly ok: false; readonly state: CapitalState; readonly error: EnterpriseError }

function reject(state: CapitalState, error: EnterpriseError): EnterpriseResult {
  return { ok: false, state, error }
}

function validCents(value: number): number | null { return exactMoneyCents(value) }

function validTime(time: number): boolean {
  return Number.isSafeInteger(time) && time >= 0
}

/** Le catalogue reste l'unique autorité pour calculer le rendement. */
export function getTotalEnterpriseIncomeMicrosPerSecond(state: CapitalState): number {
  let total = 0
  for (const item of ENTERPRISES) {
    const level = state.enterprises.owned[item.id]?.level
    if (level === undefined) continue
    const rate = getEnterpriseIncomeMicrosPerSecond(item.id, level)
    if (rate === null) continue
    total += rate
  }
  return total
}

/**
 * Avance le revenu fixe sur la durée réelle (en millisecondes), sans boucle.
 * Accumule les fractions de centime même pour les petits commerces.
 * Le timestamp unique est l'autorité pour éviter tout double crédit, y compris
 * si le moteur Trading rattrape plus tard les ticks 5 s / dividendes.
 *
 * Le revenu est toujours BRUT au crédit ; la taxe correspondante augmente
 * la dette fiscale sans diminution immédiate du solde. L'orchestrateur
 * `advanceFiscalEconomy` coupe le temps aux échéances de 72 h.
 */
export function advanceEnterpriseIncome(state: CapitalState, now: number): CapitalState {
  const start = state.enterprises.lastAccruedAt
  if (!validTime(now) || !validTime(start) || now <= start) return state

  const interval = now - start
  if (!Number.isSafeInteger(interval)) return state
  const incomeMicros = getTotalEnterpriseIncomeMicrosPerSecond(state)
  if (!Number.isSafeInteger(incomeMicros) || incomeMicros < 0) return state

  // Un jeu sans entreprise ne génère rien mais doit avancer son horloge.
  if (incomeMicros === 0) {
    return { ...state, enterprises: { ...state.enterprises, lastAccruedAt: now } }
  }

  const carry = state.enterprises.revenueCarryCents
  if (!Number.isFinite(carry) || carry < 0 || carry >= 1) return state
  const carryNanodollars = BigInt(Math.round(carry * Number(NANODOLLARS_PER_CENT)))
  const earnedNanodollars = BigInt(incomeMicros) * BigInt(interval) + carryNanodollars
  const payable = earnedNanodollars / NANODOLLARS_PER_CENT
  const remainder = earnedNanodollars % NANODOLLARS_PER_CENT

  const balanceCents = validCents(state.game.balance)
  const lifetimeCents = validCents(state.game.lifetimeEarned)
  const trackedCents = validCents(state.stats.earnedBySource.enterprises)
  if (balanceCents === null || lifetimeCents === null || trackedCents === null) return state
  if (payable > MAX_SAFE_CENTS ||
      BigInt(balanceCents) + payable > MAX_SAFE_CENTS ||
      BigInt(lifetimeCents) + payable > MAX_SAFE_CENTS ||
      BigInt(trackedCents) + payable > MAX_SAFE_CENTS) return state

  // Les transactions monétaires restent au centime ; le sous-centime est conservé.
  const cents = Number(payable)
  const credited: CapitalState = {
    ...state,
    game: cents === 0 ? state.game : {
      ...state.game,
      balance: (balanceCents + cents) / CENTS_PER_DOLLAR,
      lifetimeEarned: (lifetimeCents + cents) / CENTS_PER_DOLLAR,
    },
    enterprises: {
      ...state.enterprises,
      lastAccruedAt: now,
      revenueCarryCents: Number(remainder) / Number(NANODOLLARS_PER_CENT),
    },
    stats: cents === 0 ? state.stats : {
      ...state.stats,
      earnedBySource: {
        ...state.stats.earnedBySource,
        enterprises: (trackedCents + cents) / CENTS_PER_DOLLAR,
      },
    },
  }
  // Si la taxe ne peut pas être représentée, ne pas créditer de revenu sans
  // dette fiscale correspondante : opération atomique.
  return cents === 0 ? credited : (accrueProfitTax(credited, 'enterprises', cents) ?? state)
}

function settleIncome(state: CapitalState, now: number): CapitalState | null {
  if (!validTime(now) || now < state.enterprises.lastAccruedAt) return null
  const updated = advanceEnterpriseIncome(state, now)
  // S'assurer de ne pas acheter/rétroactiver un nouveau niveau si le versement
  // antérieur n'a pas pu être calculé (overflow ou données invalides).
  return updated.enterprises.lastAccruedAt === now ? updated : null
}

export function buyEnterprise(state: CapitalState, id: string, now = Date.now()): EnterpriseResult {
  const enterprise = getEnterprise(id)
  if (!enterprise) return reject(state, 'unknown-enterprise')
  if (state.enterprises.owned[id]) return reject(state, 'already-owned')
  if (!isEnterpriseUnlocked(id, getLevel(state.game.lifetimeEarned))) return reject(state, 'level-locked')
  if (!validTime(now) || now < state.enterprises.lastAccruedAt) return reject(state, 'invalid-clock')

  const settled = settleIncome(state, now)
  if (!settled) return reject(state, 'money-overflow')
  const cash = validCents(settled.game.balance)
  if (cash === null) return reject(state, 'money-overflow')
  if (cash < enterprise.purchaseCostCents) return reject(state, 'insufficient-funds')
  const price = enterprise.purchaseCostCents
  const newHolding = { level: 1, investedCents: price }
  return {
    ok: true,
    state: {
      ...settled,
      game: { ...settled.game, balance: (cash - price) / CENTS_PER_DOLLAR },
      enterprises: {
        ...settled.enterprises,
        owned: { ...settled.enterprises.owned, [id]: newHolding },
      },
    },
    receipt: {
      enterpriseId: id, action: 'buy', costCents: price, level: 1,
      incomeMicrosPerSecond: enterprise.baseIncomeMicrosPerSecond,
    },
  }
}

export function upgradeEnterprise(state: CapitalState, id: string, now = Date.now()): EnterpriseResult {
  const enterprise = getEnterprise(id)
  if (!enterprise) return reject(state, 'unknown-enterprise')
  const holding = state.enterprises.owned[id]
  if (!holding) return reject(state, 'not-owned')
  if (holding.level >= MAX_ENTERPRISE_LEVEL) return reject(state, 'max-level')
  if (!Number.isSafeInteger(holding.level) || holding.level < 1 || holding.level > MAX_ENTERPRISE_LEVEL) {
    return reject(state, 'max-level')
  }
  if (!validTime(now) || now < state.enterprises.lastAccruedAt) return reject(state, 'invalid-clock')

  const settled = settleIncome(state, now)
  if (!settled) return reject(state, 'money-overflow')
  const cost = getEnterpriseUpgradeCostCents(id, holding.level)
  if (cost === null) return reject(state, 'max-level')
  const cash = validCents(settled.game.balance)
  if (cash === null) return reject(state, 'money-overflow')
  if (cash < cost) return reject(state, 'insufficient-funds')
  if (!Number.isSafeInteger(holding.investedCents + cost)) return reject(state, 'money-overflow')

  const level = holding.level + 1
  return {
    ok: true,
    state: {
      ...settled,
      game: { ...settled.game, balance: (cash - cost) / CENTS_PER_DOLLAR },
      enterprises: {
        ...settled.enterprises,
        owned: {
          ...settled.enterprises.owned,
          [id]: { level, investedCents: holding.investedCents + cost },
        },
      },
    },
    receipt: {
      enterpriseId: id, action: 'upgrade', costCents: cost, level,
      incomeMicrosPerSecond: getEnterpriseIncomeMicrosPerSecond(id, level)!,
    },
  }
}
