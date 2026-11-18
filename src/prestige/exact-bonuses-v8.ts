/**
 * V8 income rates are rational BigInts and are additive on ONE base stream.
 * Fame absolute enhances only the six Fame Shop levels; ultimate reserve
 * enhances only five Transcendent economic branches. Collections and Museum
 * never pass through either of those multipliers.
 */
import type { V8CapitalState } from '../exact-state-v8.ts'
import type { FameBoostId } from './catalog.ts'
import { FAME_BOOST_BPS_PER_LEVEL } from './catalog.ts'
import { collectionV3BonusBps, collectionV3Snapshot } from './collections-v3.ts'
import { FAME_FACTOR_SCALE, v8AbsoluteFameStatus } from './absolute-v8.ts'
import { transcendentEconomicBps, transcendentReserveRatio } from '../ascension/transcendent-v1.ts'

export interface V8ExactRate {
  readonly numerator: bigint
  readonly denominator: bigint
}
const ECONOMIC_IDS = {
  enterprise: 'empire', trading: 'trading', dividend: 'rentier', xp: 'xp', fame: 'fame',
} as const

export function v8ExactRewardRate(
  state: V8CapitalState, id: FameBoostId, includeTranscendent = true,
): V8ExactRate {
  const absolute = v8AbsoluteFameStatus(state)
  const collection = collectionV3BonusBps(collectionV3Snapshot(state.prestige.ownedCollectionIds), id)
  const fameShopBps = BigInt(state.prestige.boosts[id] * FAME_BOOST_BPS_PER_LEVEL)
  const economicId = includeTranscendent ? ECONOMIC_IDS[id as keyof typeof ECONOMIC_IDS] : undefined
  const transcendentBps = economicId
    ? BigInt(transcendentEconomicBps(state.ascension.progress, economicId)) : 0n
  const reserve = economicId ? transcendentReserveRatio(state.ascension.progress) :
    { numerator: 1n, denominator: 1n }
  const numerator = (10_000n + BigInt(collection)) * FAME_FACTOR_SCALE * reserve.denominator +
    fameShopBps * absolute.factorUnits * reserve.denominator +
    transcendentBps * FAME_FACTOR_SCALE * reserve.numerator
  const denominator = 10_000n * FAME_FACTOR_SCALE * reserve.denominator
  return { numerator, denominator }
}

/** Exact unit rewards, no changes to principal or source accounting. */
export function v8ScaleRewardUnits(base: bigint, rate: V8ExactRate): bigint {
  if (base < 0n || rate.denominator <= 0n || rate.numerator < 0n)
    throw new RangeError('Invalid exact reward')
  return base * rate.numerator / rate.denominator
}

/** Fractional cents retain existing 1/10,000-cent carry semantics. */
export function v8ScaleRewardCents(base: bigint, rate: V8ExactRate, carryBps = 0):
  { readonly amount: bigint; readonly carryBps: number } {
  if (base < 0n || !Number.isSafeInteger(carryBps) || carryBps < 0 ||
      carryBps >= 10_000 || rate.denominator <= 0n || rate.numerator < 0n)
    throw new RangeError('Invalid exact reward or carry')
  const numerator = base * rate.numerator * 10_000n + BigInt(carryBps) * rate.denominator
  const denominator = rate.denominator * 10_000n
  const whole = numerator / denominator
  const remainder = numerator % denominator
  const nextCarry = (remainder + rate.denominator / 2n) / rate.denominator
  const rolled = nextCarry >= 10_000n
  return { amount: whole + (rolled ? 1n : 0n), carryBps: rolled ? 0 : Number(nextCarry) }
}

/** Display-only approximate basis points, never used by a V8 settlement. */
export function v8RateDisplayBonusBps(rate: V8ExactRate): number {
  if(rate.denominator<=0n)throw new RangeError('Invalid exact rate')
  const scaled=(rate.numerator-rate.denominator)*10_000n*1_000_000n/rate.denominator
  if(scaled>=BigInt(Number.MAX_SAFE_INTEGER))return Number.MAX_SAFE_INTEGER / 1_000_000
  return Number(scaled)/1_000_000
}
