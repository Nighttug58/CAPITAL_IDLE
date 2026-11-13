import { exactMoneyCents } from '../money.ts'

/**
 * Contrats persistants de l'économie (passe 1).
 * Tous les montants fiscaux sont stockés en centimes entiers.
 * Fiscalité : entiers en centimes ; statistiques de gains : dollars (format du jeu).
 */
export const FISCAL_PERIOD_MS = 72 * 60 * 60 * 1_000
// Taux de gameplay provisoire proposé : 15 %, centralisé et modifiable.
export const FISCAL_TAX_RATE = 0.15
export const MAX_ENTERPRISE_LEVEL = 20

export type TaxSource = 'enterprises' | 'stocks' | 'crypto' | 'memecoins'
export type EarningsSource =
  | 'clicks' | 'dividends' | 'enterprises'
  | 'stocks' | 'crypto' | 'memecoins' | 'unclassified'

export interface EnterpriseHolding {
  readonly level: number // 1..20, aucun double achat ni franchise.
  readonly investedCents: number // Achat et améliorations, valeur comptable non revendable.
}
export interface EnterpriseState {
  readonly owned: Record<string, EnterpriseHolding>
  readonly lastAccruedAt: number
  readonly revenueCarryCents: number // Fraction de centime conservée (0 <= n < 1).
}

export type TaxBreakdown = Record<TaxSource, number>
export interface FiscalState {
  readonly periodStartedAt: number // Prochaine échéance = début + FISCAL_PERIOD_MS.
  readonly taxesDueCents: number
  readonly taxesPaidCents: number
  readonly dueBySourceCents: TaxBreakdown
  readonly paidBySourceCents: TaxBreakdown
  // Reste fractionnaire des taxes entreprises, en dix-millièmes de centime.
  readonly enterpriseTaxRemainderBps: number
}

export type EarningsBreakdown = Record<EarningsSource, number>
export type TradingLossBreakdown = Record<'stocks' | 'crypto' | 'memecoins', number>
export interface StatsState {
  // Version des compteurs détaillés : absence = sauvegarde v5 antérieure à la passe 6.
  readonly sourceTrackingVersion: 1
  readonly startedAt: number
  readonly activePlayMs: number
  readonly clickCount: number
  readonly earnedBySource: EarningsBreakdown
  readonly realizedLossesBySource: TradingLossBreakdown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function isSafeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function isTimestamp(value: unknown): value is number {
  return isSafeCount(value)
}
function isNonnegativeMoney(value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) return false
  if (Number.isSafeInteger(value)) return true
  return exactMoneyCents(value) !== null
}
const TAX_SOURCES: readonly TaxSource[] = ['enterprises', 'stocks', 'crypto', 'memecoins']
const EARNINGS_SOURCES: readonly EarningsSource[] = [
  'clicks', 'dividends', 'enterprises', 'stocks', 'crypto', 'memecoins', 'unclassified',
]
const LOSS_SOURCES: readonly (keyof TradingLossBreakdown)[] = ['stocks', 'crypto', 'memecoins']
function safeTime(now: number): number {
  return isTimestamp(now) ? now : 0
}
function emptyTaxes(): TaxBreakdown {
  return { enterprises: 0, stocks: 0, crypto: 0, memecoins: 0 }
}
function emptyEarnings(legacyUnclassified = 0): EarningsBreakdown {
  return { clicks: 0, dividends: 0, enterprises: 0, stocks: 0, crypto: 0, memecoins: 0, unclassified: legacyUnclassified }
}
function emptyLosses(): TradingLossBreakdown {
  return { stocks: 0, crypto: 0, memecoins: 0 }
}
function validAmounts<T extends string>(
  raw: unknown,
  keys: readonly T[],
  validate: (value: unknown) => boolean,
): raw is Record<T, number> {
  return isRecord(raw) && Object.keys(raw).length === keys.length &&
    keys.every((key) => validate(raw[key]))
}
function totalCents(breakdown: TaxBreakdown): number {
  return TAX_SOURCES.reduce((sum, source) => sum + breakdown[source], 0)
}

export function createInitialEnterpriseState(now = Date.now()): EnterpriseState {
  return { owned: {}, lastAccruedAt: safeTime(now), revenueCarryCents: 0 }
}
export function createInitialFiscalState(now = Date.now()): FiscalState {
  return {
    periodStartedAt: safeTime(now), taxesDueCents: 0, taxesPaidCents: 0,
    dueBySourceCents: emptyTaxes(), paidBySourceCents: emptyTaxes(),
    enterpriseTaxRemainderBps: 0,
  }
}
export function createInitialStatsState(now = Date.now(), legacyUnclassified = 0): StatsState {
  return {
    sourceTrackingVersion: 1,
    startedAt: safeTime(now), activePlayMs: 0, clickCount: 0,
    earnedBySource: emptyEarnings(isNonnegativeMoney(legacyUnclassified) ? legacyUnclassified : 0),
    realizedLossesBySource: emptyLosses(),
  }
}

export function restoreEnterpriseState(raw: unknown, now = Date.now()): EnterpriseState {
  const fallback = () => createInitialEnterpriseState(now)
  if (!isRecord(raw) || !isTimestamp(raw.lastAccruedAt) || !isRecord(raw.owned) ||
    Object.keys(raw.owned).length > 20 ||
    !Object.entries(raw.owned).every(([id, value]) =>
      /^[a-z0-9-]{1,48}$/.test(id) && isRecord(value) &&
      Number.isSafeInteger(value.level) && (value.level as number) >= 1 && (value.level as number) <= MAX_ENTERPRISE_LEVEL &&
      isSafeCount(value.investedCents)) ||
    typeof raw.revenueCarryCents !== 'number' || !Number.isFinite(raw.revenueCarryCents) ||
    raw.revenueCarryCents < 0 || raw.revenueCarryCents >= 1) return fallback()
  return { owned: raw.owned as EnterpriseState['owned'], lastAccruedAt: raw.lastAccruedAt, revenueCarryCents: raw.revenueCarryCents }
}

export function restoreFiscalState(raw: unknown, now = Date.now()): FiscalState {
  const fallback = () => createInitialFiscalState(now)
  if (!isRecord(raw) || !isTimestamp(raw.periodStartedAt) ||
    !isSafeCount(raw.taxesDueCents) || !isSafeCount(raw.taxesPaidCents) ||
    !validAmounts(raw.dueBySourceCents, TAX_SOURCES, isSafeCount) ||
    !validAmounts(raw.paidBySourceCents, TAX_SOURCES, isSafeCount) ||
    !Number.isSafeInteger(totalCents(raw.dueBySourceCents)) ||
    !Number.isSafeInteger(totalCents(raw.paidBySourceCents)) ||
    totalCents(raw.dueBySourceCents) !== raw.taxesDueCents ||
    totalCents(raw.paidBySourceCents) !== raw.taxesPaidCents ||
    !(raw.enterpriseTaxRemainderBps === undefined ||
      (isSafeCount(raw.enterpriseTaxRemainderBps) && raw.enterpriseTaxRemainderBps < 10_000))) return fallback()
  return {
    periodStartedAt: raw.periodStartedAt,
    taxesDueCents: raw.taxesDueCents, taxesPaidCents: raw.taxesPaidCents,
    dueBySourceCents: raw.dueBySourceCents, paidBySourceCents: raw.paidBySourceCents,
    enterpriseTaxRemainderBps: typeof raw.enterpriseTaxRemainderBps === 'number' ? raw.enterpriseTaxRemainderBps : 0,
  }
}

export function restoreStatsState(raw: unknown, now = Date.now(), legacyUnclassified = 0): StatsState {
  const fallback = () => createInitialStatsState(now, legacyUnclassified)
  if (!isRecord(raw) || !isTimestamp(raw.startedAt) || !isSafeCount(raw.activePlayMs) ||
    !isSafeCount(raw.clickCount) ||
    !validAmounts(raw.earnedBySource, EARNINGS_SOURCES, isNonnegativeMoney) ||
    !validAmounts(raw.realizedLossesBySource, LOSS_SOURCES, isNonnegativeMoney)) return fallback()
  // Les versions v5 plus anciennes comptaient les revenus Entreprises, mais
  // pas les clics, dividendes ni les plus-values par catégorie. Il est donc
  // impossible de les attribuer rétroactivement : conserver la différence
  // positive de l'XP dans 'unclassified', exactement une fois.
  if (!(raw.sourceTrackingVersion === undefined || raw.sourceTrackingVersion === 1)) return fallback()
  const legacy = raw.sourceTrackingVersion !== 1
  const earned = raw.earnedBySource as EarningsBreakdown
  const knownXpBeforeTracking = earned.enterprises + earned.unclassified
  const unknown = legacy ? Math.max(0, legacyUnclassified - knownXpBeforeTracking) : 0
  return {
    sourceTrackingVersion: 1,
    startedAt: raw.startedAt, activePlayMs: raw.activePlayMs, clickCount: raw.clickCount,
    earnedBySource: unknown > 0 ? { ...earned, unclassified: earned.unclassified + unknown } : earned,
    realizedLossesBySource: raw.realizedLossesBySource,
  }
}
