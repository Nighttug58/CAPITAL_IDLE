/**
 * V8 settlement mathematics. Quantities are integer subunits; prices are
 * decimal USD fractions; resulting amounts are exact integer cents. This
 * deliberately does not modify the v7 trading engine until its entire state
 * and serialization use the same exact representation.
 */
import { parseDecimalUnits, multiplyRatio } from './large-numbers.ts'

export type ExactFraction = Readonly<{ numerator: bigint; denominator: bigint }>
export type ExactTradeCost = Readonly<{
  grossCents: bigint
  feeCents: bigint
  totalCents: bigint
  proceedsCents: bigint
}>

/** Expand a finite JS market quote into its printed decimal value. Never use
 * Number.toFixed here: the number of meaningful digits varies by instrument.
 * All multiplications after conversion stay in BigInt.
 */
export function quoteToExactFraction(price: number): ExactFraction | null {
  if (!Number.isFinite(price) || price <= 0) return null
  const literal = price.toString()
  const match = literal.match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i)
  if (!match) return null
  const shift = Number(match[3] ?? '0')
  if (!Number.isSafeInteger(shift) || Math.abs(shift) > 200) return null
  const digit = match[1]! + (match[2] ?? '')
  const exponent = shift - (match[2] ?? '').length
  const numerator = BigInt(digit) * (exponent > 0 ? 10n ** BigInt(exponent) : 1n)
  const denominator = exponent < 0 ? 10n ** BigInt(-exponent) : 1n
  return { numerator, denominator }
}

function ceilDiv(a: bigint, b: bigint): bigint {
  if (a < 0n || b <= 0n) throw new RangeError('Expected nonnegative dividend / positive divisor')
  return a / b + (a % b !== 0n ? 1n : 0n)
}

/** Supported units: 1 stock with four decimals -> 10000 subunits. */
export function quantityStringToUnits(quantity: string, decimals: number): bigint | null {
  return parseDecimalUnits(quantity, decimals)
}

/**
 * Pure exact settlement of a quote, which may already include order-size
 * market impact and slippage computed by liquidity-v8. No supply cap.
 * The fee is applied to the unrounded gross, not its rounded cent value.
 * Buy rounds gross UP to a cent; sale rounds gross DOWN to a cent.
 * A fee rounds up, with min 1 cent, and cannot make sale proceeds negative.
 */
export function exactTradeCost(
  quote: ExactFraction, quantityUnits: bigint, quantityDecimals: number,
  feeBasisPoints: bigint, side: 'buy' | 'sell',
): ExactTradeCost | null {
  if (quote.numerator <= 0n || quote.denominator <= 0n || quantityUnits <= 0n ||
    !Number.isSafeInteger(quantityDecimals) || quantityDecimals < 0 || quantityDecimals > 100 ||
    feeBasisPoints < 0n || feeBasisPoints > 10_000n) return null
  const numerator = quote.numerator * quantityUnits * 100n
  const denominator = quote.denominator * 10n ** BigInt(quantityDecimals)
  const grossCents = side === 'buy' ? ceilDiv(numerator, denominator) : numerator / denominator
  if (grossCents === 0n && side === 'buy') return null
  const variableFee = ceilDiv(numerator * feeBasisPoints, denominator * 10_000n)
  const requestedFee = variableFee > 1n ? variableFee : 1n
  const feeCents = side === 'buy' ? requestedFee : requestedFee > grossCents ? grossCents : requestedFee
  return {
    grossCents,
    feeCents,
    totalCents: side === 'buy' ? grossCents + feeCents : 0n,
    proceedsCents: side === 'sell' ? grossCents - feeCents : 0n,
  }
}

/** Maximum quantity financed by a wallet: logarithmic BigInt binary search. */
export function affordableExactQuantity(
  cashCents: bigint, quote: ExactFraction, decimals: number, feeBps: bigint,
): bigint {
  if (cashCents <= 0n || quote.numerator <= 0n || quote.denominator <= 0n ||
    !Number.isSafeInteger(decimals) || decimals < 0 || decimals > 100) return 0n
  // Price alone gives a conservative bound on the search interval. The final
  // verification below includes fee and minimum one-cent charge.
  const ceiling = (cashCents * quote.denominator * 10n ** BigInt(decimals)) /
    (quote.numerator * 100n)
  let low = 0n
  let high = ceiling
  while (low < high) {
    const middle = low + (high - low + 1n) / 2n
    const order = exactTradeCost(quote, middle, decimals, feeBps, 'buy')
    if (order && order.totalCents <= cashCents) low = middle
    else high = middle - 1n
  }
  return low
}

/** Allocate a cost basis exactly and deterministically on partial sales. */
export function divideCostBasis(
  originalCents: bigint, soldUnits: bigint, ownedUnits: bigint,
): readonly [soldCents: bigint, remainingCents: bigint] {
  if (originalCents < 0n || soldUnits < 0n || ownedUnits <= 0n || soldUnits > ownedUnits) {
    throw new RangeError('Invalid cost basis allocation')
  }
  const soldCents = soldUnits === ownedUnits ? originalCents :
    multiplyRatio(originalCents, soldUnits, ownedUnits, 'nearest')
  return [soldCents, originalCents - soldCents]
}
