/**
 * Economic settlements in integer minor units, used to prepare V8 migration.
 * All sums and comparisons operate on bigint; rates are fixed rational bp.
 * Never coerce money into Number for XP, Fame, income, taxes or trade rewards.
 */
import { multiplyRatio } from './large-numbers.ts'
import { progressiveTaxNumerator } from './economy/tax-curve.ts'

export type ExactTaxSource = 'enterprises' | 'stocks' | 'crypto' | 'memecoins'
export type ExactIncomeSource = 'clicks' | 'dividends' | ExactTaxSource
export type ExactIncomeCarry = Readonly<{
  remainderNanodollars: bigint
  taxRemainderBps: bigint
}>

/** All dollar money and XP are integer cents. Fame is integer micro-Fame. */
export interface ExactEconomyLedger {
  readonly balanceCents: bigint
  readonly lifetimeEarnedCents: bigint
  readonly experienceCents: bigint
  readonly fameMicros: bigint
  readonly lifetimeFameMicros: bigint
  readonly prestigeAvailablePoints: bigint
  readonly prestigeLifetimePoints: bigint
  readonly taxesDueCents: bigint
  readonly taxesPaidCents: bigint
  readonly dueBySourceCents: Readonly<Record<ExactTaxSource, bigint>>
  readonly paidBySourceCents: Readonly<Record<ExactTaxSource, bigint>>
  readonly earnedBySourceCents: Readonly<Record<ExactIncomeSource, bigint>>
  readonly lossesBySourceCents: Readonly<Record<'stocks'|'crypto'|'memecoins', bigint>>
}

export function createExactEconomyLedger(): ExactEconomyLedger {
  return {
    balanceCents: 0n, lifetimeEarnedCents: 0n, experienceCents: 0n,
    fameMicros: 0n, lifetimeFameMicros: 0n, prestigeAvailablePoints: 0n,
    prestigeLifetimePoints: 0n, taxesDueCents: 0n, taxesPaidCents: 0n,
    dueBySourceCents: { enterprises: 0n, stocks: 0n, crypto: 0n, memecoins: 0n },
    paidBySourceCents: { enterprises: 0n, stocks: 0n, crypto: 0n, memecoins: 0n },
    earnedBySourceCents: { clicks: 0n, dividends: 0n, enterprises: 0n,
      stocks: 0n, crypto: 0n, memecoins: 0n },
    lossesBySourceCents: { stocks: 0n, crypto: 0n, memecoins: 0n },
  }
}

/** A positive income adds cash, lifetime earned, source total, and XP once. */
export function creditExactIncome(
  state: ExactEconomyLedger, source: ExactIncomeSource, amountCents: bigint,
  xpBasisPoints = 10_000n,
): ExactEconomyLedger {
  if (amountCents < 0n || xpBasisPoints < 0n) throw new RangeError('Negative income or XP rate')
  if (amountCents === 0n) return state
  return {
    ...state,
    balanceCents: state.balanceCents + amountCents,
    lifetimeEarnedCents: state.lifetimeEarnedCents + amountCents,
    experienceCents: state.experienceCents + multiplyRatio(amountCents, xpBasisPoints, 10_000n),
    earnedBySourceCents: { ...state.earnedBySourceCents,
      [source]: state.earnedBySourceCents[source] + amountCents },
  }
}

/** Spending cash never subtracts XP, Fame or lifetime earned. */
export function spendExactCash(state: ExactEconomyLedger, costCents: bigint): ExactEconomyLedger | null {
  if (costCents < 0n) throw new RangeError('Negative cost')
  if (state.balanceCents < costCents || state.balanceCents < 0n) return null
  return { ...state, balanceCents: state.balanceCents - costCents }
}

/**
 * Credit passive revenue from nanodollars (1 µ$/s × 1 ms = 1 n$).
 * One cent = 10 000 000 nanodollars. Increments are exact even at 10^100.
 */
export function accrueExactEnterpriseIncome(
  state: ExactEconomyLedger,
  rateMicrosPerSecond: bigint,
  elapsedRealMilliseconds: bigint,
  previousRemainderNanodollars: bigint,
  enterpriseTaxRemainderBps: bigint,
  incomeBonusBps = 10_000n,
  xpBonusBps = 10_000n,
): Readonly<{ state: ExactEconomyLedger; carry: ExactIncomeCarry; grossCents: bigint }> {
  if (rateMicrosPerSecond < 0n || elapsedRealMilliseconds < 0n ||
      previousRemainderNanodollars < 0n || previousRemainderNanodollars >= 10_000_000n ||
      enterpriseTaxRemainderBps < 0n || enterpriseTaxRemainderBps >= 10_000n ||
      incomeBonusBps < 0n || xpBonusBps < 0n) throw new RangeError('Invalid enterprise accrual')
  const nano = multiplyRatio(rateMicrosPerSecond * elapsedRealMilliseconds, incomeBonusBps, 10_000n) +
    previousRemainderNanodollars
  const earned = nano / 10_000_000n
  const rem = nano % 10_000_000n
  const credited = creditExactIncome(state, 'enterprises', earned, xpBonusBps)
  const taxNumerator = progressiveTaxNumerator(earned,
    credited.lifetimeEarnedCents - earned) + enterpriseTaxRemainderBps
  const taxCents = taxNumerator / 10_000n
  return {
    state: { ...credited,
      taxesDueCents: credited.taxesDueCents + taxCents,
      dueBySourceCents: { ...credited.dueBySourceCents,
        enterprises: credited.dueBySourceCents.enterprises + taxCents } },
    carry: { remainderNanodollars: rem, taxRemainderBps: taxNumerator % 10_000n },
    grossCents: earned,
  }
}

/** Same 15% trading tax, only on realized positive profit, not returned principal. */
export function recordExactTradeProfit(
  state: ExactEconomyLedger, source: 'stocks'|'crypto'|'memecoins', netProfitCents: bigint,
): ExactEconomyLedger {
  if (netProfitCents <= 0n) {
    return netProfitCents === 0n ? state : {
      ...state,
      lossesBySourceCents: { ...state.lossesBySourceCents,
        [source]: state.lossesBySourceCents[source] - netProfitCents },
    }
  }
  const tax = (progressiveTaxNumerator(netProfitCents,
    state.lifetimeEarnedCents) + 5_000n) / 10_000n
  // P&L is credited through a separate trade cash settlement; don't double
  // count it as cash here. Only XP, stats and tax accrue to the ledger.
  return {
    ...state,
    lifetimeEarnedCents: state.lifetimeEarnedCents + netProfitCents,
    experienceCents: state.experienceCents + netProfitCents,
    earnedBySourceCents: { ...state.earnedBySourceCents,
      [source]: state.earnedBySourceCents[source] + netProfitCents },
    taxesDueCents: state.taxesDueCents + tax,
    dueBySourceCents: { ...state.dueBySourceCents,
      [source]: state.dueBySourceCents[source] + tax },
  }
}

/** Fiscal settlement debits even into negative cash; no tax forgiveness. */
export function settleExactTaxes(state: ExactEconomyLedger): ExactEconomyLedger {
  return {
    ...state,
    balanceCents: state.balanceCents - state.taxesDueCents,
    taxesPaidCents: state.taxesPaidCents + state.taxesDueCents,
    taxesDueCents: 0n,
    paidBySourceCents: {
      enterprises: state.paidBySourceCents.enterprises + state.dueBySourceCents.enterprises,
      stocks: state.paidBySourceCents.stocks + state.dueBySourceCents.stocks,
      crypto: state.paidBySourceCents.crypto + state.dueBySourceCents.crypto,
      memecoins: state.paidBySourceCents.memecoins + state.dueBySourceCents.memecoins,
    },
    dueBySourceCents: { enterprises: 0n, stocks: 0n, crypto: 0n, memecoins: 0n },
  }
}

export function creditExactFame(state: ExactEconomyLedger, fameMicros: bigint): ExactEconomyLedger {
  if (fameMicros < 0n) throw new RangeError('Negative fame award')
  return { ...state, fameMicros: state.fameMicros + fameMicros,
    lifetimeFameMicros: state.lifetimeFameMicros + fameMicros }
}

export function spendExactFame(state: ExactEconomyLedger, fameMicros: bigint): ExactEconomyLedger | null {
  if (fameMicros < 0n) throw new RangeError('Negative fame cost')
  if (state.fameMicros < fameMicros) return null
  return { ...state, fameMicros: state.fameMicros - fameMicros }
}

export function creditExactPrestigePoints(state: ExactEconomyLedger, points: bigint): ExactEconomyLedger {
  if (points < 0n) throw new RangeError('Negative PP award')
  return { ...state, prestigeAvailablePoints: state.prestigeAvailablePoints + points,
    prestigeLifetimePoints: state.prestigeLifetimePoints + points }
}

export function spendExactPrestigePoints(state: ExactEconomyLedger, points: bigint): ExactEconomyLedger | null {
  if (points < 0n) throw new RangeError('Negative PP cost')
  if (state.prestigeAvailablePoints < points) return null
  return { ...state, prestigeAvailablePoints: state.prestigeAvailablePoints - points }
}
