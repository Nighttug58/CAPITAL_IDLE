/**
 * Prepared V7 -> V8 exact-value representation. This is deliberately not wired
 * into persistence until every economic engine consumes exact integer units.
 * Activating this early would reset old saves through the V7 Number validators.
 */
import type { CapitalState } from './capital.ts'
import {
  decodeExactInteger, encodeExactInteger, legacyDollarsToCents,
  legacyInteger, parseDecimalUnits,
} from './large-numbers.ts'

export const EXACT_SAVE_VERSION = 8 as const
export type AssetDecimals = (assetId: string) => number | null

// The legacy format uses both dollars and cents. V8 stores the quantities
// explicitly in cents / smallest token units; unchanged fields keep their
// historical meaning (timestamps, prices, percentages, levels and PRNG seed).
type RecordValue = Record<string, unknown>
function record(value: unknown, where: string): RecordValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Malformed save section: ' + where)
  }
  return value as RecordValue
}
function array(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError('Malformed save list: ' + where)
  return value
}
function cents(value: unknown, signed: boolean, path: string): string {
  const result = legacyDollarsToCents(value, signed)
  if (result === null) throw new RangeError('Unrepresentable legacy dollar value: ' + path)
  return encodeExactInteger(result)
}
function integer(value: unknown, signed: boolean, path: string): string {
  const result = legacyInteger(value, signed)
  if (result === null) throw new RangeError('Invalid legacy integer: ' + path)
  return encodeExactInteger(result)
}

/** Expand number exponent *without* multiplying or rounding a large Number. */
export function finiteNumberDecimal(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const text = value.toString()
  if (!/[eE]/.test(text)) return text
  const match = text.match(/^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/)
  if (!match) return null
  const digits = match[2]! + (match[3] ?? '')
  const decimalAt = match[2]!.length + Number(match[4])
  if (!Number.isSafeInteger(decimalAt) || Math.abs(decimalAt) > 1_000) return null
  const expanded = decimalAt <= 0
    ? '0.' + '0'.repeat(-decimalAt) + digits
    : decimalAt >= digits.length
      ? digits + '0'.repeat(decimalAt - digits.length)
      : digits.slice(0, decimalAt) + '.' + digits.slice(decimalAt)
  return (match[1] ?? '') + expanded
}
function quantity(value: unknown, id: string, getDecimals: AssetDecimals, path: string): string {
  const decimals = getDecimals(id)
  if (!Number.isSafeInteger(decimals) || decimals === null || decimals < 0 || decimals > 100) {
    throw new RangeError('Unknown asset/precision: ' + id)
  }
  const decimal = finiteNumberDecimal(value)
  const result = parseDecimalUnits(decimal, decimals, false)
  if (result === null) throw new RangeError('Unrepresentable legacy position: ' + path)
  return encodeExactInteger(result)
}
function field(owner: RecordValue, key: string, mode: 'dollars' | 'cents' | 'units', path: string, signed = false) {
  if (!Object.hasOwn(owner, key)) throw new TypeError('Missing legacy field: ' + path)
  owner[key] = mode === 'dollars' ? cents(owner[key], signed, path) : integer(owner[key], signed, path)
}
function amounts(owner: RecordValue, where: string, mode: 'dollars' | 'cents', signed = false) {
  for (const key of Object.keys(owner)) field(owner, key, mode, where + '.' + key, signed)
}

/**
 * Deterministic, non-mutating projection of an ALREADY VALIDATED v7 state.
 * The output is a V8 design fixture, NOT yet an active/importable save.
 * Refusing a conversion keeps the original v7 bytes untouched.
 */
export function projectValidatedV7ToExactV8(
  state: Readonly<CapitalState>, getDecimals: AssetDecimals,
): RecordValue {
  if (state.version !== 7) throw new RangeError('Expected a validated v7 save')
  const copy = JSON.parse(JSON.stringify(state)) as RecordValue
  const game = record(copy.game, 'game')
  field(game, 'balance', 'dollars', 'game.balance', true)
  field(game, 'lifetimeEarned', 'dollars', 'game.lifetimeEarned')

  const trading = record(copy.trading, 'trading')
  field(trading, 'realizedNetProfit', 'dollars', 'trading.realizedNetProfit', true)
  field(trading, 'creditedTradingProfit', 'dollars', 'trading.creditedTradingProfit')
  field(trading, 'dividendPendingCents', 'cents', 'trading.dividendPendingCents')
  const positions = record(trading.positions, 'trading.positions')
  for (const [id, value] of Object.entries(positions)) {
    const position = record(value, 'trading.positions.' + id)
    position.quantity = quantity(position.quantity, id, getDecimals, 'trading.positions.' + id + '.quantity')
    field(position, 'costBasis', 'dollars', 'trading.positions.' + id + '.costBasis')
  }
  const staking = record(trading.staking, 'trading.staking')
  const stakes = record(staking.positions, 'trading.staking.positions')
  for (const [id, value] of Object.entries(stakes)) {
    const item = record(value, 'trading.staking.positions.' + id)
    for (const key of ['locked', 'unlocking', 'awaitingCompound', 'rewardHeld', 'rewardLocked',
      'rewardUnlocking', 'lifetimeRewards']) {
      item[key] = quantity(item[key], id, getDecimals, 'trading.staking.positions.' + id + '.' + key)
    }
    // carryUnits remains a finite fractional remainder (< 1 smallest unit).
    // It needs a dedicated exact rational contract before active V8 use.
  }

  const enterprises = record(copy.enterprises, 'enterprises')
  const owned = record(enterprises.owned, 'enterprises.owned')
  for (const [id, value] of Object.entries(owned)) {
    field(record(value, 'enterprises.owned.' + id), 'investedCents', 'cents', 'enterprises.owned.' + id + '.investedCents')
  }
  const fiscal = record(copy.fiscal, 'fiscal')
  for (const key of ['taxesDueCents', 'taxesPaidCents']) field(fiscal, key, 'cents', 'fiscal.' + key)
  for (const key of ['dueBySourceCents', 'paidBySourceCents'])
    amounts(record(fiscal[key], 'fiscal.' + key), 'fiscal.' + key, 'cents')

  const stats = record(copy.stats, 'stats')
  for (const key of ['earnedBySource', 'realizedLossesBySource'])
    amounts(record(stats[key], 'stats.' + key), 'stats.' + key, 'dollars')

  const fame = record(copy.prestige, 'prestige')
  for (const key of ['experienceCents', 'fameMicros', 'lifetimeFameMicros',
    'levelFameMicros', 'collectionFameMicros']) field(fame, key, 'cents', 'prestige.' + key)
  if (fame.xpRebase !== undefined) {
    const rebase = record(fame.xpRebase, 'prestige.xpRebase')
    for (const key of ['fromCents', 'toCents']) field(rebase, key, 'cents', 'prestige.xpRebase.' + key)
  }

  const ascension = record(copy.ascension, 'ascension')
  const progress = record(ascension.progress, 'ascension.progress')
  field(progress, 'availablePoints', 'units', 'ascension.progress.availablePoints')
  field(progress, 'lifetimePoints', 'units', 'ascension.progress.lifetimePoints')
  for (const [index, value] of array(progress.history, 'ascension.progress.history').entries()) {
    const item = record(value, 'ascension.progress.history[' + index + ']')
    field(item, 'eligibleWorthCents', 'cents', 'ascension.progress.history.eligibleWorthCents')
    field(item, 'earnedPoints', 'units', 'ascension.progress.history.earnedPoints')
  }
  const run = record(ascension.run, 'ascension.run')
  const automation = record(run.automation, 'ascension.run.automation')
  for (const key of ['maxOrderCents', 'cashReserveCents']) field(automation, key, 'cents', 'ascension.run.automation.' + key)
  if (automation.enterpriseBudgetCents !== undefined)
    field(automation, 'enterpriseBudgetCents', 'cents', 'ascension.run.automation.enterpriseBudgetCents')
  if (run.marketOrders !== undefined) {
    for (const value of array(run.marketOrders, 'ascension.run.marketOrders')) {
      const order = record(value, 'ascension.run.marketOrders.item')
      if (typeof order.assetId !== 'string') throw new TypeError('Invalid market order asset')
      order.quantity = quantity(order.quantity, order.assetId, getDecimals, 'ascension.run.marketOrders.quantity')
    }
  }

  const achievements = record(copy.achievements, 'achievements')
  field(achievements, 'cycleGiftCents', 'cents', 'achievements.cycleGiftCents')
  copy.version = EXACT_SAVE_VERSION
  return copy
}

/** Validate a V8 integer value strictly before a future domain deserializer uses it. */
export function isValidV8ExactAmount(value: unknown, signed = false): boolean {
  return decodeExactInteger(value, signed) !== null
}
