/**
 * Prepared V7 -> V8 exact-value representation. The legacy save is strictly validated before conversion, and all monetary
 * fields are converted to canonical strings before V8 persistence.
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
  // The V7 domain permits IEEE-754 artifacts such as 0.1 + 0.2.
  // Before migration, snap only when the EXACT V7 quantity validator would
  // have accepted it: less than 1/10 000 of one minimum tradable unit.
  // This does not excuse a malformed extra decimal place (e.g. 0.12345
  // where the asset permits only four decimals).
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError('Unrepresentable legacy position: ' + path)
  }
  const scaled = value * 10 ** decimals
  const rounded = Math.round(scaled)
  if (Number.isSafeInteger(rounded) && Math.abs(scaled - rounded) < 0.0001) {
    return encodeExactInteger(BigInt(rounded))
  }
  // A quantity above the safe unit range can still be an exact integer when
  // the instrument has zero decimal places; don't silently round it.
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
  // Legacy fraction-of-cent carries become a fixed 10^-12 cent remainder.
  // These are *not* dollar amounts; never multiply them by 100.
  if (typeof trading.dividendCarry !== 'number' || !Number.isFinite(trading.dividendCarry) ||
      trading.dividendCarry < 0 || trading.dividendCarry >= 1) {
    throw new RangeError('Invalid dividend remainder')
  }
  trading.dividendCarryPicoCents = encodeExactInteger(BigInt(Math.round(trading.dividendCarry * 1e12)))
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
    // Staking carry is a fractional *minimum token unit*, NOT full coins.
    if (typeof item.carryUnits !== 'number' || !Number.isFinite(item.carryUnits) ||
        item.carryUnits < 0 || item.carryUnits >= 1) {
      throw new RangeError('Invalid staking remainder: ' + id)
    }
    item.carryPicoUnits = encodeExactInteger(BigInt(Math.round(item.carryUnits * 1e12)))
  }

  const enterprises = record(copy.enterprises, 'enterprises')
  if (typeof enterprises.revenueCarryCents !== 'number' ||
      !Number.isFinite(enterprises.revenueCarryCents) ||
      enterprises.revenueCarryCents < 0 || enterprises.revenueCarryCents >= 1) {
    throw new RangeError('Invalid enterprise remainder')
  }
  enterprises.revenueCarryNanoCents = encodeExactInteger(BigInt(Math.round(enterprises.revenueCarryCents * 1e7)))
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
