import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeExactInteger, encodeExactInteger, legacyDollarsToCents, legacyInteger,
  parseDecimalUnits, formatDecimalUnits, multiplyRatio, percentOfWealthCents,
  suffixForTier, formatCompactUnits, makeExactSaveEnvelope,
} from './large-numbers.ts'

test('exact canonical serialization and billion-digit-compatible integers', () => {
  const gigantic = 10n ** 150n + 123n
  assert.equal(decodeExactInteger(encodeExactInteger(gigantic)), gigantic)
  assert.equal(decodeExactInteger(encodeExactInteger(-gigantic)), -gigantic)
  for (const bad of ['01', '-0', '1.2', '1e9', '+1', ' 1 ', 'Infinity', 10, 1.5, null])
    assert.equal(decodeExactInteger(bad), null)
  assert.equal(decodeExactInteger('-1', false), null)
  assert.equal(legacyInteger(Number.MAX_SAFE_INTEGER), BigInt(Number.MAX_SAFE_INTEGER))
  assert.equal(legacyInteger(Number.MAX_SAFE_INTEGER + 1), null)
})

test('legacy dollar cent migration matches v7 valid values and rejects unsafe ones', () => {
  assert.equal(legacyDollarsToCents(69_806_801_435.15), 6_980_680_143_515n)
  assert.equal(legacyDollarsToCents(-12.34), -1234n)
  assert.equal(legacyDollarsToCents(0), 0n)
  assert.equal(legacyDollarsToCents(Number.MAX_SAFE_INTEGER), null)
  assert.equal(legacyDollarsToCents(0.001), null)
  assert.equal(legacyDollarsToCents(-1, false), null)
})

test('precise fractional tokens and very tiny crypto price units', () => {
  assert.equal(parseDecimalUnits('0.00000001', 8), 1n)
  assert.equal(parseDecimalUnits('12345678901234567890.12345678', 8), 1_234_567_890_123_456_789_012_345_678n)
  assert.equal(formatDecimalUnits(1n, 8), '0.00000001')
  assert.equal(formatDecimalUnits(123400n, 5, true), '1.234')
  for (const bad of ['1.000000001', '1e3', '-0', '01', '1.', '.5'])
    assert.equal(parseDecimalUnits(bad, 8), null)
  assert.equal(parseDecimalUnits('-0.50', 2, true), -50n)
})

test('exact signed rounding without MAX_SAFE_INTEGER clamps', () => {
  const huge = 10n ** 130n
  assert.equal(multiplyRatio(huge, 2500n, 10_000n), huge / 4n)
  assert.equal(multiplyRatio(1n, 1n, 2n, 'ceil'), 1n)
  assert.equal(multiplyRatio(-1n, 1n, 2n, 'ceil'), 0n)
  assert.equal(multiplyRatio(-1n, 1n, 2n, 'floor'), -1n)
  assert.equal(multiplyRatio(-1n, 1n, 2n, 'nearest'), -1n)
  assert.equal(percentOfWealthCents(101n, 500n), 6n)
  assert.equal(percentOfWealthCents(101n, 1000n), 11n)
  assert.throws(() => percentOfWealthCents(-1n, 500n))
  assert.throws(() => multiplyRatio(1n, 2n, 0n))
})

test('unbounded suffixes and compact money formatting', () => {
  assert.deepEqual([0,1,2,3,4,5,6,7,8,9,32,33,682,683].map(suffixForTier),
    ['', 'K', 'M', 'B', 'T', 'Q', 'QQ', 'AA', 'AB', 'AC', 'AZ', 'BA', 'ZZ', 'AAA'])
  assert.equal(formatCompactUnits(1234n), '12.34 $')
  assert.equal(formatCompactUnits(-1234n), '-12.34 $')
  assert.equal(formatCompactUnits(100_000n), '1.00K $')
  assert.equal(formatCompactUnits(999_999_99n), '1.00M $')
  assert.equal(formatCompactUnits(10n ** 23n), '1.00AA $')
  assert.equal(formatCompactUnits(10n ** 29n), '1.00AC $')
  assert.equal(formatCompactUnits(10n ** 152n), '1.00' + suffixForTier(50) + ' $')
})

test('exact save envelope keeps integers as canonical JSON strings', () => {
  const serialized = JSON.stringify(makeExactSaveEnvelope({balanceCents:10n ** 100n, debtCents:-5n}))
  const parsed = JSON.parse(serialized)
  assert.equal(decodeExactInteger(parsed.balanceCents), 10n ** 100n)
  assert.equal(decodeExactInteger(parsed.debtCents), -5n)
  assert.equal(typeof parsed.balanceCents, 'string')
})
