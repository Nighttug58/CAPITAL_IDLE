import { migratePrestigeShop } from './ascension/v2.ts'
import { migrateTranscendentV1, type TranscendentShopV1 } from './ascension/transcendent-v1.ts'
/**
 * Version 8 domain contract: economic values are CANONICAL decimal strings.
 * BigInts are materialized only inside transaction functions and never
 * serialized by JSON.stringify. Market prices, rates, PRNG and timestamps
 * remain finite Numbers; no money is derived from them without rationalization.
 */
import type { GameState } from './game.ts'
import type { TradingState, Position, StakingEntry } from './trading/types.ts'
import type { EnterpriseState, FiscalState, StatsState, TaxSource, EarningsSource } from './economy/state.ts'
import type { PrestigeState } from './prestige/state.ts'
import type { AscensionSaveSection, AscensionCycleSummary, AscensionProgress, AscensionRunState, AscensionMarketOrder } from './ascension/contracts.ts'
import type { AchievementsState } from './achievements.ts'
import { decodeExactInteger, encodeExactInteger } from './large-numbers.ts'
import { getAsset } from './trading/catalog.ts'
import { createCapitalState, type CapitalState } from './capital.ts'
import { projectValidatedV7ToExactV8 } from './exact-save-v8.ts'
import { validateExactV8State } from './exact-save-validation.ts'
import { migratePreV2V8Save } from './fame-cycle-v8.ts'

export type ExactAmount = string
export interface V8GameState extends Omit<GameState, 'balance'|'lifetimeEarned'> {
  balance: ExactAmount  // cents
  lifetimeEarned: ExactAmount // cents
}
export interface V8Position extends Omit<Position, 'quantity'|'costBasis'> {
  quantity: ExactAmount // 10^-asset.quantityDecimals of the instrument
  costBasis: ExactAmount // cents
}
export interface V8StakingEntry extends Omit<StakingEntry,
  'locked'|'unlocking'|'awaitingCompound'|'rewardHeld'|'rewardLocked'|'rewardUnlocking'|'lifetimeRewards'> {
  locked: ExactAmount
  unlocking: ExactAmount
  awaitingCompound: ExactAmount
  rewardHeld: ExactAmount
  rewardLocked: ExactAmount
  rewardUnlocking: ExactAmount
  lifetimeRewards: ExactAmount
  /** 10^-12 minimum token unit carry, never full tokens. */
  carryPicoUnits?: ExactAmount
}
export interface V8TradingState extends Omit<TradingState, 'positions'|'staking'|'realizedNetProfit'|'creditedTradingProfit'|'dividendPendingCents'> {
  /** Per-asset user preferences; optional for pre-feature V8 saves. */
  autoSellRules?: Record<string,{greenEnd:boolean;redStart:boolean}>
  positions: Record<string,V8Position>
  staking: Readonly<{lastAccruedAt:number; positions:Record<string,V8StakingEntry>}>
  realizedNetProfit: ExactAmount // signed cents
  creditedTradingProfit: ExactAmount // cents
  dividendPendingCents: ExactAmount // cents
  /** Sub-cent dividend remainder, counted in 1e-12 cents. */
  dividendCarryPicoCents?: ExactAmount
}
export interface V8EnterpriseHolding { readonly level: number; readonly investedCents: ExactAmount }
export interface V8EnterpriseState extends Omit<EnterpriseState, 'owned'> {
  owned: Record<string, V8EnterpriseHolding>
  /** Legacy float remainder is retained only for migration compatibility. */
  revenueCarryNanoCents?: ExactAmount
}
export type V8TaxBreakdown = Record<TaxSource, ExactAmount>
export type V8EarningsBreakdown = Record<EarningsSource, ExactAmount>
export type V8LossBreakdown = Record<'stocks'|'crypto'|'memecoins', ExactAmount>
export interface V8FiscalState extends Omit<FiscalState,'taxesDueCents'|'taxesPaidCents'|'dueBySourceCents'|'paidBySourceCents'> {
  taxesDueCents: ExactAmount
  taxesPaidCents: ExactAmount
  dueBySourceCents: V8TaxBreakdown
  paidBySourceCents: V8TaxBreakdown
}
export interface V8StatsState extends Omit<StatsState, 'earnedBySource'|'realizedLossesBySource'> {
  earnedBySource: V8EarningsBreakdown // cents, no dollar floats
  realizedLossesBySource: V8LossBreakdown // cents
}
export interface V8PrestigeState extends Omit<PrestigeState,
  'experienceCents'|'fameMicros'|'lifetimeFameMicros'|'levelFameMicros'|'collectionFameMicros'|'xpRebase'|'xpCurveVersion'> {
  /** Active XP curve: existing v8-3 saves are migrated once before gameplay. */
  xpCurveVersion: 4
  /** Historical purchases remain at their original prices, future ranks use V2. */
  fameShopLedgerVersion: 2
  fameLegacyLevels: PrestigeState['boosts']
  fameSpentMicros: ExactAmount
  /** Total Fame removed when completing past cycles (activated in pass 6). */
  fameForfeitedMicros: ExactAmount
  /** Newly earned Fame in the current Prestige cycle (not lifetime history). */
  cycleEarnedFameMicros: ExactAmount
  cycleLevelFameMicros: ExactAmount
  cycleCollectionFameMicros: ExactAmount
  xpRebaseV4?: { readonly fromCents: ExactAmount; readonly toCents: ExactAmount }
  experienceCents: ExactAmount
  fameMicros: ExactAmount
  lifetimeFameMicros: ExactAmount
  levelFameMicros: ExactAmount
  collectionFameMicros: ExactAmount
  xpRebase?: { readonly fromCents: ExactAmount; readonly toCents: ExactAmount }
}
export interface V8CycleSummary extends Omit<AscensionCycleSummary,'eligibleWorthCents'|'earnedPoints'> {
  /** Canonical receipt index above Number.MAX_SAFE_INTEGER; legacy rows keep numeric cycle. */
  cycleExact?: ExactAmount
  formulaVersion?: 2 | 3 | 4 | 5
  eligibleWorthCents: ExactAmount
  earnedPoints: ExactAmount
  /** V3/V4 legacy or V5 current receipts: immutable PP and rank snapshots. */
  basePoints?: ExactAmount
  heritageLevelAtCycle?: number
  museumCompleteAtCycle?: boolean
  bonusBps?: number
  /** Optional on old V3 receipts; new receipts attest the grant. */
  startingCapitalLevelAtCycle?: number
  startingCapitalGrantedCents?: ExactAmount
}
export interface V8AscensionProgress extends Omit<AscensionProgress,'availablePoints'|'lifetimePoints'|'history'> {
  availablePoints: ExactAmount
  lifetimePoints: ExactAmount
  shopVersion?: 2
  legacyRanks?: AscensionProgress['upgradeLevels']
  /** Versioned exact-PP advanced shop; missing on old V8 saves means zero ranks. */
  transcendentV1?: TranscendentShopV1
  /** Optional canonical cycle counter after 2^53-1. prestigeCount becomes a safe projection. */
  prestigeCountExact?: ExactAmount
  history: readonly V8CycleSummary[]
}
export interface V8MarketOrder extends Omit<AscensionMarketOrder,'quantity'> {
  quantity: ExactAmount
}
export interface V8AscensionRun extends Omit<AscensionRunState,'automation'|'marketOrders'> {
  /** Auto Click purchased in dollars for this cycle (missing in older V8 saves = 0). */
  autoClickLevel?: number
  /** Absent in pre-pass-5 V8 means exactly zero. */
  startingCapitalGrantedCents?: ExactAmount
  automation?: Omit<AscensionRunState['automation'],'maxOrderCents'|'cashReserveCents'|'enterpriseBudgetCents'> & {
    maxOrderCents: ExactAmount
    cashReserveCents: ExactAmount
    enterpriseBudgetCents?: ExactAmount
  }
  marketOrders?: readonly V8MarketOrder[]
}
export interface V8Ascension extends Omit<AscensionSaveSection,'progress'|'run'> {
  progress: V8AscensionProgress
  run: V8AscensionRun
}
export interface V8Achievements extends Omit<AchievementsState,'cycleGiftCents'> {
  cycleGiftCents: ExactAmount
}
export interface V8CapitalState extends Omit<CapitalState,'version'|'game'|'trading'|'enterprises'|'fiscal'|'stats'|'prestige'|'ascension'|'achievements'> {
  newsPowers?: { count:number; spentCents:string; recent:readonly {eventId:string; action:"generate"|"end"; at:number; costCents:string}[] }
  version: 8
  game: V8GameState
  trading: V8TradingState
  enterprises: V8EnterpriseState
  fiscal: V8FiscalState
  stats: V8StatsState
  prestige: V8PrestigeState
  ascension: V8Ascension
  achievements: V8Achievements
}

export function getExactAmount(text: ExactAmount): bigint {
  const value = decodeExactInteger(text)
  if (value === null) throw new TypeError('Malformed exact amount')
  return value
}
export function withExactAmount(value: bigint): ExactAmount { return encodeExactInteger(value) }
export function createV8CapitalState(now = Date.now()): V8CapitalState {
  const v7 = createCapitalState(undefined, now)
  return convertValidatedV7ToV8(v7)
}
export function convertValidatedV7ToV8(source: CapitalState): V8CapitalState {
  const decimals = (id: string) => getAsset(id)?.quantityDecimals ?? null
  const converted = projectValidatedV7ToExactV8(source, decimals)
  const checked = validateExactV8State(converted, decimals)
  if (!checked.valid) throw new Error('V8 conversion invalid: ' + checked.reason)
  return migrateTranscendentV1(migratePrestigeShop(migratePreV2V8Save(converted as unknown as V8CapitalState)))
}
