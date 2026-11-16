/**
 * Exact arithmetic for the V2 economy. All values passed to game code are
 * integer minor units (cents for money, 10^-decimals for holdings).
 *
 * Do not cast these values to Number for domain computations. Prices/graphs
 * can remain finite Number values, but trade settlement must use decimal
 * conversion before multiplying by large quantities.
 *
 * The current v7 engine has not yet adopted these functions; this module is
 * an isolated migration foundation, NOT a declaration that v8 is supported.
 */
export type ExactUnits = bigint
export type RatioRounding = 'trunc' | 'floor' | 'ceil' | 'nearest'

const INTEGER_PATTERN = /^(?:0|[1-9]\d*|-[1-9]\d*)$/
const UNSIGNED_PATTERN = /^(?:0|[1-9]\d*)$/

/** Canonical representation for JSON: integers as decimal strings. */
export function encodeExactInteger(value: bigint): string {
  return value.toString(10)
}

/** Reject exponents, leading zeroes, negative zero and unsafe Numbers. */
export function decodeExactInteger(value: unknown, allowNegative = true): bigint | null {
  if (typeof value !== 'string' || !(allowNegative ? INTEGER_PATTERN : UNSIGNED_PATTERN).test(value)) return null
  try { return BigInt(value) } catch { return null }
}

/** Convert valid legacy integer fields without silently losing precision. */
export function legacyInteger(value: unknown, allowNegative = true): bigint | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || (!allowNegative && value < 0)) return null
  return BigInt(value)
}

/**
 * Convert a legacy dollar amount to exact cents, only if its original Number
 * contained a recoverable cent value (the identical old v7 acceptance bound).
 * Do not attempt to revive cents that were already rounded off in v7.
 */
export function legacyDollarsToCents(value: unknown, allowNegative = true): bigint | null {
  if (typeof value !== 'number' || !Number.isFinite(value) ||
      (!allowNegative && value < 0) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100) return null
  const scaled = value * 100
  const rounded = Math.round(scaled)
  const tolerance = Math.min(0.25, Math.max(0.0001, Math.abs(scaled) * Number.EPSILON * 4))
  return Number.isSafeInteger(rounded) && Math.abs(scaled - rounded) <= tolerance
    ? BigInt(rounded) : null
}

/** Decimal strings to integer subunits, with no floating-point conversion. */
export function parseDecimalUnits(input: unknown, decimals: number, allowNegative = false): bigint | null {
  if (typeof input !== 'string' || !Number.isSafeInteger(decimals) || decimals < 0 || decimals > 100) return null
  const match = input.match(/^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/)
  if (!match || (!allowNegative && match[1] === '-') || (match[3]?.length ?? 0) > decimals) return null
  const integer = match[2]!
  const fraction = match[3] ?? ''
  if (match[1] === '-' && BigInt(integer + fraction) === 0n) return null
  try {
    const magnitude = BigInt(integer) * 10n ** BigInt(decimals) +
      BigInt((fraction + '0'.repeat(decimals - fraction.length)) || '0')
    return match[1] === '-' ? -magnitude : magnitude
  } catch { return null }
}

export function formatDecimalUnits(value: bigint, decimals: number, trimTrailingZeros = false): string {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 100) throw new RangeError('Invalid decimal precision')
  const negative = value < 0n
  const magnitude = negative ? -value : value
  const divisor = 10n ** BigInt(decimals)
  const integral = (magnitude / divisor).toString()
  let fraction = decimals ? (magnitude % divisor).toString().padStart(decimals, '0') : ''
  if (trimTrailingZeros) fraction = fraction.replace(/0+$/, '')
  return (negative ? '-' : '') + integral + (fraction ? '.' + fraction : '')
}

/** Exact, signed rational multiplication with explicit rounding. */
export function multiplyRatio(value: bigint, numerator: bigint, denominator: bigint,
  rounding: RatioRounding = 'trunc'): bigint {
  if (denominator <= 0n) throw new RangeError('Denominator must be positive')
  const product = value * numerator
  const quotient = product / denominator
  const remainder = product % denominator
  if (remainder === 0n || rounding === 'trunc') return quotient
  if (rounding === 'floor') return product < 0n ? quotient - 1n : quotient
  if (rounding === 'ceil') return product > 0n ? quotient + 1n : quotient
  if (rounding === 'nearest') {
    return (remainder < 0n ? -remainder : remainder) * 2n >= denominator
      ? quotient + (product < 0n ? -1n : 1n) : quotient
  }
  throw new RangeError('Unknown rounding mode')
}

/** Cost rounded upward to the next cent. Reject negative net wealth. */
export function percentOfWealthCents(netWorthCents: bigint, percentageBps: bigint): bigint {
  if (netWorthCents < 0n || percentageBps < 0n) throw new RangeError('Negative wealth or rate')
  return multiplyRatio(netWorthCents, percentageBps, 10_000n, 'ceil')
}

/** AA at 10^21, AB at 10^24, etc. No terminal suffix. */
export function suffixForTier(tier: number): string {
  const known = ['', 'K', 'M', 'B', 'T', 'Q', 'QQ']
  if (!Number.isSafeInteger(tier) || tier < 0) throw new RangeError('Invalid tier')
  if (tier < known.length) return known[tier]!
  let index = tier - known.length
  let width = 2
  let block = 26 ** width
  while (index >= block) {
    index -= block
    width++
    block = 26 ** width
    if (!Number.isSafeInteger(block)) throw new RangeError('Tier too large to label')
  }
  const chars = Array<string>(width).fill('A')
  for (let at = width - 1; at >= 0; at--) {
    chars[at] = String.fromCharCode(65 + index % 26)
    index = Math.floor(index / 26)
  }
  return chars.join('')
}

function groupDigits(value: string): string { return value.replace(/\B(?=(\d{3})+(?!\d))/g, "'") }

/**
 * Compact display only. Input is exact integer subunits, not a Number.
 * For ordinary values, preserve exact minor-unit digits; at >=1K show two
 * decimal places. Rounding 999.999K yields 1.00M (never 1000.00K).
 */
export function formatCompactUnits(value: bigint, decimals = 2, unit = '$'): string {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 100) throw new RangeError('Invalid decimals')
  const negative = value < 0n
  const magnitude = negative ? -value : value
  const base = 10n ** BigInt(decimals)
  const prefix = negative ? '-' : ''
  const whole = magnitude / base
  const wholeText = whole.toString()
  const trail = unit ? ' ' + unit : ''
  if (whole < 1_000n) {
    const fraction = decimals ? (magnitude % base).toString().padStart(decimals, '0') : ''
    return prefix + groupDigits(wholeText) + (fraction ? '.' + fraction : '') + trail
  }
  let tier = Math.floor((wholeText.length - 1) / 3)
  let divisor = 10n ** BigInt(decimals + tier * 3)
  let scaledHundredths = (magnitude * 100n + divisor / 2n) / divisor
  if (scaledHundredths >= 100_000n) {
    tier++
    divisor = 10n ** BigInt(decimals + tier * 3)
    scaledHundredths = (magnitude * 100n + divisor / 2n) / divisor
  }
  return prefix + (scaledHundredths / 100n) + '.' +
    (scaledHundredths % 100n).toString().padStart(2, '0') + suffixForTier(tier) + trail
}

/** Read-only preview of the exact large-number format for V8 savings. */
export function makeExactSaveEnvelope(fields: Record<string, bigint>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).map(([key, amount]) => [key, encodeExactInteger(amount)]))
}
