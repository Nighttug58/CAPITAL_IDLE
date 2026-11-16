/**
 * Strict V8 serialization contract. No BigInt is ever written to JSON; all
 * economic amounts are canonical decimal strings. This validator is a staging
 * gate: do NOT activate V8 loading before all runtime engines use exact types.
 */
import { decodeExactInteger } from './large-numbers.ts'
import type { AssetDecimals } from './exact-save-v8.ts'
import { getPurchasedFameBoostCost } from './prestige/catalog.ts'
import { ascensionSpentPoints } from './ascension/catalog.ts'

export interface ExactSaveValidation {
  readonly valid: boolean
  readonly reason?: string
}

type Dict = Record<string, unknown>
function object(value: unknown): value is Dict {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function amount(value: unknown, signed = false): bigint | null {
  return decodeExactInteger(value, signed)
}
const TAX_SOURCES = ['enterprises', 'stocks', 'crypto', 'memecoins'] as const
const INCOME_SOURCES = ['clicks', 'dividends', 'enterprises', 'stocks', 'crypto', 'memecoins', 'unclassified'] as const
const LOSS_SOURCES = ['stocks', 'crypto', 'memecoins'] as const

/** Inspects cross-ledger invariants as exact BigInts, without Number coercion. */
export function validateExactV8State(value: unknown, decimalsFor: AssetDecimals): ExactSaveValidation {
  const fail = (reason: string): ExactSaveValidation => ({ valid: false, reason })
  if (!object(value) || value.version !== 8) return fail('Expected exact V8 snapshot')
  const { game, fiscal, trading, enterprises, prestige, ascension, achievements, stats } = value
  if (![game, fiscal, trading, enterprises, prestige, ascension, achievements, stats].every(object))
    return fail('Missing V8 domain section')
  const g = game as Dict, f = fiscal as Dict, t = trading as Dict,
    e = enterprises as Dict, p = prestige as Dict, a = ascension as Dict,
    gifts = achievements as Dict, s = stats as Dict
  const cash = amount(g.balance, true), earned = amount(g.lifetimeEarned)
  const giftCents = amount(gifts.cycleGiftCents)
  if (cash === null || earned === null || giftCents === null || cash > earned + giftCents)
    return fail('Cash / lifetime earnings / gifts inconsistent')
  if (!object(f.dueBySourceCents) || !object(f.paidBySourceCents)) return fail('Missing tax ledgers')
  for (const [totalKey, bySourceKey] of [
    ['taxesDueCents','dueBySourceCents'], ['taxesPaidCents','paidBySourceCents'],
  ] as const) {
    const total = amount(f[totalKey]), source = f[bySourceKey] as Dict
    if (total === null || Object.keys(source).length !== TAX_SOURCES.length) return fail('Invalid tax totals')
    let sum = 0n
    for (const key of TAX_SOURCES) {
      const part = amount(source[key])
      if (part === null) return fail('Invalid tax source')
      sum += part
    }
    if (sum !== total) return fail('Tax ledger balance mismatch')
  }
  if (!object(s.earnedBySource) || !object(s.realizedLossesBySource)) return fail('Missing income ledgers')
  for (const [ledger, keys] of [
    [s.earnedBySource as Dict, INCOME_SOURCES],
    [s.realizedLossesBySource as Dict, LOSS_SOURCES],
  ] as const) {
    if (Object.keys(ledger).length !== keys.length) return fail('Incorrect source count')
    for (const key of keys) if (amount(ledger[key]) === null) return fail('Malformed source entry')
  }
  if (amount(p.experienceCents) === null) return fail('Invalid XP ledger')
  const fame = amount(p.fameMicros), lifetimeFame = amount(p.lifetimeFameMicros)
  const levelsFame = amount(p.levelFameMicros), collectionsFame = amount(p.collectionFameMicros)
  if (fame === null || lifetimeFame === null || levelsFame === null || collectionsFame === null ||
    fame > lifetimeFame || lifetimeFame !== levelsFame + collectionsFame) return fail('Incoherent Fame')
  if (!object(p.boosts)) return fail('Missing Fame boost ledger')
  const shopSpent = getPurchasedFameBoostCost(p.boosts as Parameters<typeof getPurchasedFameBoostCost>[0])
  if (shopSpent === null || lifetimeFame - fame !== BigInt(shopSpent) * 1_000_000n)
    return fail('Fame shop ledger does not balance')
  if (!object(a.progress)) return fail('Missing Prestige progress')
  const progress = a.progress as Dict
  const availablePP = amount(progress.availablePoints), lifetimePP = amount(progress.lifetimePoints)
  if (availablePP === null || lifetimePP === null || availablePP > lifetimePP ||
      !object(progress.upgradeLevels)) return fail('Invalid PP ledger')
  const shopPP = ascensionSpentPoints(progress.upgradeLevels as Record<string, number>)
  if (shopPP === null || lifetimePP - availablePP !== BigInt(shopPP)) return fail('PP shop ledger does not balance')
  if (!Array.isArray(progress.history) || typeof progress.prestigeCount !== 'number' ||
      !Number.isSafeInteger(progress.prestigeCount) || progress.prestigeCount < 0)
    return fail('Missing prestige history')
  for (const [index, item] of progress.history.entries()) {
    if (!object(item) || amount(item.eligibleWorthCents) === null || amount(item.earnedPoints) === null ||
      !Number.isSafeInteger(item.cycle) || item.cycle !== progress.prestigeCount - progress.history.length + index + 1)
      return fail('Invalid prestige history')
  }
  if (!object(t.positions) || !object(t.staking)) return fail('Invalid trading positions')
  const stake = t.staking as Dict
  if (!object(stake.positions)) return fail('Invalid staking positions')
  const positions = t.positions as Dict
  for (const [id, raw] of Object.entries(positions)) {
    const precision = decimalsFor(id)
    if (precision === null || !Number.isSafeInteger(precision) || !object(raw)) return fail('Unknown trading asset')
    const qty = amount(raw.quantity), basis = amount(raw.costBasis)
    if (qty === null || qty <= 0n || basis === null) return fail('Invalid position quantity/cost')
  }
  for (const [id, raw] of Object.entries(stake.positions as Dict)) {
    if (decimalsFor(id) === null || !object(raw)) return fail('Invalid staked asset')
    const fields = ['locked','unlocking','awaitingCompound','rewardHeld','rewardLocked',
      'rewardUnlocking','lifetimeRewards'] as const
    const values = fields.map(x => amount(raw[x]))
    if (values.some(x => x === null)) return fail('Invalid staked quantity')
    const [locked, unlocking, compounding, held, rewardLocked, rewardUnlocking] = values as bigint[]
    const position = positions[id]
    const owned = object(position) ? amount(position.quantity) : null
    if (owned === null || locked! + unlocking! + compounding! > owned || held! > owned ||
      rewardLocked! > locked! || rewardUnlocking! > unlocking!) return fail('Staked holdings mismatch')
  }
  const ownedEnterprises = e.owned
  if (!object(ownedEnterprises)) return fail('Invalid company holdings')
  for (const raw of Object.values(ownedEnterprises)) {
    if (!object(raw) || amount(raw.investedCents) === null ||
      !Number.isSafeInteger(raw.level) || (raw.level as number) < 1) return fail('Invalid enterprise balance')
  }
  for (const key of ['realizedNetProfit','creditedTradingProfit','dividendPendingCents'] as const) {
    if (amount(t[key], key === 'realizedNetProfit') === null) return fail('Invalid trading ledger')
  }
  if (!object(a.run) || !object((a.run as Dict).automation)) return fail('Missing run state')
  const automation = (a.run as Dict).automation as Dict
  for (const key of ['maxOrderCents','cashReserveCents'] as const)
    if (amount(automation[key]) === null) return fail('Invalid automation budget')
  if (automation.enterpriseBudgetCents !== undefined && amount(automation.enterpriseBudgetCents) === null)
    return fail('Invalid enterprise automation budget')
  return { valid: true }
}
