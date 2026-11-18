/**
 * Pure, BigInt-backed V8 economic transitions. All monetary values are cents
 * serialized as decimal strings, including XP; Fame uses micro-Fame.
 * The active App routes economic mutations here. V7 entry points remain for
 * historical imports and their original regression tests.
 */
import type { V8CapitalState } from './exact-state-v8.ts'
import { getExactAmount as v, withExactAmount as s } from './exact-state-v8.ts'
import { getExactLevel } from './exact-levels.ts'
import { getClickValue, UPGRADES } from './game.ts'
import { currentCollectionId, getCollectionSlot, getVersionedPurchasedFameCost } from './prestige/catalog.ts'
import type { FameBoostId } from './prestige/catalog.ts'
import { getRewardRateUnits } from './prestige/bonuses.ts'
import { v8ExactRewardRate, v8ScaleRewardUnits, v8ScaleRewardCents, v8RateDisplayBonusBps } from './prestige/exact-bonuses-v8.ts'
import { prestigeCycleCount } from './ascension/prestige-count-v8.ts'
import { getAsset } from './trading/catalog.ts'
import { exactTradeCost, quoteToExactFraction, quantityStringToUnits, affordableExactQuantity,
  divideCostBasis } from './exact-trading.ts'
import { getEnterprise, getEnterpriseIncomeMicrosPerSecondExact, getEnterpriseUpgradeCostCentsExact, getEnterpriseUpgradeBatchCostCentsExact, isEnterpriseUnlocked }
  from './economy/catalog.ts'
import { FISCAL_PERIOD_MS, type TaxSource } from './economy/state.ts'
import { getV2NextFameBoostCost as fameCost } from './prestige/catalog.ts'
import { prestigeShop, prestigeCost } from './ascension/v2.ts'
import type { AscensionUpgradeId } from './ascension/contracts.ts'
import { ACHIEVEMENTS, type AchievementMetric } from './achievements.ts'

const TOTAL_RATE_DENOM = 10_000n * 1_000_000n
const FAME_MICROS = 1_000_000n
const TAX_BPS = 1_500n

/** Approximate display projections only; V8 transitions use exact rational rates. */
export function v8BonusBasisPoints(state: V8CapitalState, id: FameBoostId): number {
  return v8RateDisplayBonusBps(v8ExactRewardRate(state,id,false))
}
export function v8EarningBonusBps(state: V8CapitalState, id: FameBoostId): number {
  return v8RateDisplayBonusBps(v8ExactRewardRate(state,id))
}
/** Same fractional-cent rounding contract as the existing v7 bonus engine. */
export function v8BoostCents(amount: bigint, bonusBps: number, carryBps = 0): { amount: bigint; carryBps: number } {
  if (amount < 0n || !Number.isSafeInteger(carryBps) || carryBps < 0 || carryBps >= 10_000) {
    throw new RangeError('Invalid reward or carry')
  }
  const rate = getRewardRateUnits(bonusBps)
  if (rate === null) throw new RangeError('Invalid bonus rate')
  const scaled = amount * rate + BigInt(carryBps) * 1_000_000n
  const whole = scaled / TOTAL_RATE_DENOM
  const remainder = scaled % TOTAL_RATE_DENOM
  const carry = (remainder + 500_000n) / 1_000_000n
  return { amount: whole + (carry >= 10_000n ? 1n : 0n), carryBps: Number(carry >= 10_000n ? 0n : carry) }
}

function xpAward(state: V8CapitalState, newCents: bigint): V8CapitalState {
  if (newCents <= 0n) return state
  const scaled = v8ScaleRewardCents(newCents, v8ExactRewardRate(state, 'xp'), state.prestige.experienceCarryBps)
  const experienceCents = v(state.prestige.experienceCents) + scaled.amount
  const newLevel = getExactLevel(experienceCents)
  const highest = state.ascension.progress.highestFameAwardedLevel
  const updatedHighest = Math.max(highest, newLevel)
  // Fame is awarded for crossing a level ONCE IN THIS CYCLE. The historical
  // highest level remains an achievement record, never a Fame gate.
  const oldLevel = state.prestige.lastAwardedLevel
  const fameBaseMicros = (
    BigInt(newLevel) * (BigInt(newLevel) + 1n) -
    BigInt(oldLevel) * (BigInt(oldLevel) + 1n)
  ) / 2n * FAME_MICROS
  const fameAdded = v8ScaleRewardUnits(fameBaseMicros, v8ExactRewardRate(state, 'fame'))
  return {
    ...state,
    prestige: {
      ...state.prestige,
      experienceCents: s(experienceCents), experienceCarryBps: scaled.carryBps,
      lastAwardedLevel: newLevel,
      fameMicros: s(v(state.prestige.fameMicros) + fameAdded),
      lifetimeFameMicros: s(v(state.prestige.lifetimeFameMicros) + fameAdded),
      levelFameMicros: s(v(state.prestige.levelFameMicros) + fameAdded),
      cycleEarnedFameMicros: s(v(state.prestige.cycleEarnedFameMicros) + fameAdded),
      cycleLevelFameMicros: s(v(state.prestige.cycleLevelFameMicros) + fameAdded),
    },
    ascension: updatedHighest === highest ? state.ascension : {
      ...state.ascension,
      progress: { ...state.ascension.progress, highestFameAwardedLevel: updatedHighest },
    },
  }
}

export type V8Source = 'clicks' | 'dividends' | 'enterprises'
export function v8CreditIncome(state: V8CapitalState, source: V8Source,
  grossCents: bigint): V8CapitalState {
  if (grossCents < 0n) throw new RangeError('Negative income')
  if (grossCents === 0n) return state
  const credited: V8CapitalState = {
    ...state,
    game: { ...state.game,
      balance: s(v(state.game.balance) + grossCents),
      lifetimeEarned: s(v(state.game.lifetimeEarned) + grossCents) },
    stats: { ...state.stats, earnedBySource: { ...state.stats.earnedBySource,
      [source]: s(v(state.stats.earnedBySource[source]) + grossCents) } },
  }
  return xpAward(credited, grossCents)
}

export function v8Click(state: V8CapitalState): V8CapitalState {
  const base = BigInt(getClickValue(state.game.purchasedUpgrades)) * 100n
  const rate = v8ScaleRewardCents(base, v8ExactRewardRate(state, 'click'), state.prestige.clickCarryBps)
  const credited = v8CreditIncome(state, 'clicks', rate.amount)
  return { ...credited,
    stats: { ...credited.stats, clickCount: credited.stats.clickCount + 1 },
    prestige: { ...credited.prestige, clickCarryBps: rate.carryBps },
  }
}

export function v8UpgradeClick(state: V8CapitalState): V8CapitalState | null {
  const next = UPGRADES[state.game.purchasedUpgrades]
  const level = getExactLevel(v(state.prestige.experienceCents))
  const cost = next && BigInt(next.price) * 100n
  if (!next || level < next.requiredLevel || cost === null || v(state.game.balance) < cost) return null
  return { ...state, game: { ...state.game, balance: s(v(state.game.balance) - cost),
    purchasedUpgrades: state.game.purchasedUpgrades + 1 } }
}


/** Immutable dollar-price prefix for O(log 999) MAX quotes. */
const clickCostPrefix: readonly bigint[] = (() => {
  const sums: bigint[] = [0n]
  for (const row of UPGRADES) sums.push(sums[sums.length - 1]! + BigInt(row.price) * 100n)
  return sums
})()
export interface V8ClickMaxQuote {
  readonly levelsBought: number
  readonly targetLevel: number
  readonly costCents: bigint
}
export function quoteV8ClickMax(state: V8CapitalState): V8ClickMaxQuote | null {
  const current = state.game.purchasedUpgrades
  if (!Number.isSafeInteger(current) || current < 0 || current >= UPGRADES.length) return null
  const budget = v(state.game.balance)
  if (budget < 0n) return null
  const level = getExactLevel(v(state.prestige.experienceCents))
  let low = current, high = UPGRADES.length
  while (low < high) {
    const mid = low + Math.ceil((high - low) / 2)
    if (clickCostPrefix[mid]! - clickCostPrefix[current]! <= budget &&
        UPGRADES[mid - 1]!.requiredLevel <= level) low = mid
    else high = mid - 1
  }
  if (low === current) return null
  return {levelsBought:low-current,targetLevel:low,
    costCents:clickCostPrefix[low]!-clickCostPrefix[current]!}
}
/** The rank supplied by the UI prevents duplicate purchases against stale state. */
export function v8UpgradeClickMax(state: V8CapitalState, expectedLevel: number): V8CapitalState | null {
  if (state.game.purchasedUpgrades !== expectedLevel) return null
  const quote = quoteV8ClickMax(state)
  if (!quote) return null
  return {...state,game:{...state.game,
    balance:s(v(state.game.balance)-quote.costCents),
    purchasedUpgrades:quote.targetLevel}}
}

export type V8TradeResult =
  | { ok: true; state: V8CapitalState; grossCents: bigint; feeCents: bigint;
      cashDeltaCents: bigint; realizedNetProfitCents: bigint }
  | { ok: false; reason: string }
const rejectTrade = (reason: string): V8TradeResult => ({ ok:false, reason })

/** Exact market quote is a Number describing the simulation price, not money stored. */
function priceFor(state: V8CapitalState, assetId: string) {
  const asset = getAsset(assetId)
  if (!asset) return null
  const price = state.trading.quotes[assetId]?.price ?? asset.referencePrice
  if (!Number.isFinite(price) || price <= 0) return null
  const fraction = quoteToExactFraction(price)
  return fraction && { asset, price, fraction }
}
function feeBps(kind: 'stock'|'crypto'|'memecoin'): bigint {
  return kind === 'stock' ? 50n : kind === 'crypto' ? 100n : 150n
}
function reservedUnits(state: V8CapitalState, assetId: string): bigint {
  const entry = state.trading.staking.positions[assetId]
  return entry ? v(entry.locked) + v(entry.unlocking) + v(entry.awaitingCompound) : 0n
}

/** Supply is informational only: no issuer cap, market impact or slippage. */
export function v8BuyTrade(state: V8CapitalState, assetId: string, quantity: string): V8TradeResult {
  const entry = priceFor(state, assetId)
  if (!entry) return rejectTrade('unknown-asset-or-invalid-price')
  const {asset, fraction} = entry
  const units = quantityStringToUnits(quantity, asset.quantityDecimals)
  if (units === null || units <= 0n) return rejectTrade('invalid-quantity')
  const owned = state.trading.positions[assetId]
  const previous = owned ? v(owned.quantity) : 0n
  const cost = exactTradeCost(fraction, units, asset.quantityDecimals, feeBps(asset.kind), 'buy')
  if (!cost) return rejectTrade('invalid-cost')
  const sale = exactTradeCost(fraction, units, asset.quantityDecimals, feeBps(asset.kind), 'sell')
  if (!sale?.proceedsCents) return rejectTrade('amount-too-small')
  if (v(state.game.balance) < cost.totalCents) return rejectTrade('insufficient-funds')
  const next: V8CapitalState = { ...state,
    game: { ...state.game, balance: s(v(state.game.balance) - cost.totalCents) },
    trading: { ...state.trading, positions: { ...state.trading.positions,
      [assetId]: { quantity:s(previous + units),
        costBasis:s((owned ? v(owned.costBasis) : 0n) + cost.totalCents) } } },
  }
  return { ok:true, state:next, grossCents:cost.grossCents, feeCents:cost.feeCents,
    cashDeltaCents:-cost.totalCents, realizedNetProfitCents:0n }
}

export function v8MaximumBuyUnits(state: V8CapitalState, assetId: string): bigint {
  const entry = priceFor(state, assetId)
  if (!entry) return 0n
  return affordableExactQuantity(v(state.game.balance), entry.fraction,
    entry.asset.quantityDecimals, feeBps(entry.asset.kind))
}

export function v8SellTrade(state: V8CapitalState, assetId: string, quantity: string): V8TradeResult {
  const entry = priceFor(state, assetId)
  if (!entry) return rejectTrade('unknown-asset-or-invalid-price')
  const {asset, fraction} = entry
  const units = quantityStringToUnits(quantity, asset.quantityDecimals)
  if (units === null || units <= 0n) return rejectTrade('invalid-quantity')
  const current = state.trading.positions[assetId]
  if (!current || units > v(current.quantity)) return rejectTrade('insufficient-holdings')
  if (units > v(current.quantity) - reservedUnits(state, assetId)) return rejectTrade('staked-holdings')
  const order = exactTradeCost(fraction, units, asset.quantityDecimals, feeBps(asset.kind), 'sell')
  if (!order) return rejectTrade('invalid-cost')

  // Staking rewards are sold first at zero cost basis. Purchased units retain
  // their actual original cost basis across partial sales and compound events.
  const stakingEntry = state.trading.staking.positions[assetId]
  const rewardHeld = stakingEntry ? v(stakingEntry.rewardHeld) : 0n
  const availableReward = stakingEntry ? rewardHeld - v(stakingEntry.rewardLocked) -
    v(stakingEntry.rewardUnlocking) - v(stakingEntry.awaitingCompound) : 0n
  const rewardedSold = availableReward < units ? availableReward : units
  const purchasedHeld = v(current.quantity) - rewardHeld
  const purchasedSold = units - rewardedSold
  const [basisSold, basisRemaining] = units === v(current.quantity) ?
    [v(current.costBasis),0n] : purchasedHeld === 0n ? [0n,v(current.costBasis)] :
      divideCostBasis(v(current.costBasis), purchasedSold, purchasedHeld)
  const profit = order.proceedsCents - basisSold
  const boosted = profit > 0n ? v8ScaleRewardCents(profit, v8ExactRewardRate(state,'trading'),
    state.prestige.tradingCarryBps) : null
  const effectiveProfit = boosted?.amount ?? profit
  const bonusCents = effectiveProfit - profit
  const newBalance = v(state.game.balance) + order.proceedsCents + bonusCents
  const earnings = effectiveProfit > 0n ? effectiveProfit : 0n
  const source = asset.kind === 'stock' ? 'stocks' : asset.kind === 'crypto' ? 'crypto' : 'memecoins'
  const positions = { ...state.trading.positions }
  if (units === v(current.quantity)) delete positions[assetId]
  else positions[assetId] = { quantity:s(v(current.quantity) - units), costBasis:s(basisRemaining) }
  const staking = stakingEntry && rewardedSold > 0n ? {
    ...state.trading.staking,
    positions: { ...state.trading.staking.positions,
      [assetId]: { ...stakingEntry, rewardHeld:s(rewardHeld - rewardedSold) } },
  } : state.trading.staking
  let next: V8CapitalState = { ...state,
    game: { ...state.game, balance:s(newBalance),
      lifetimeEarned:s(v(state.game.lifetimeEarned) + earnings) },
    trading: { ...state.trading, positions, staking,
      realizedNetProfit:s(v(state.trading.realizedNetProfit) + effectiveProfit),
      creditedTradingProfit:s(v(state.trading.creditedTradingProfit) + earnings) },
    stats: { ...state.stats,
      earnedBySource: earnings > 0n ? { ...state.stats.earnedBySource,
        [source]:s(v(state.stats.earnedBySource[source]) + earnings) } : state.stats.earnedBySource,
      realizedLossesBySource: effectiveProfit < 0n ? { ...state.stats.realizedLossesBySource,
        [source]:s(v(state.stats.realizedLossesBySource[source]) - effectiveProfit) } : state.stats.realizedLossesBySource },
    prestige: boosted ? { ...state.prestige, tradingCarryBps: boosted.carryBps } : state.prestige,
  }
  if (earnings > 0n) {
    next = xpAward(next, earnings)
    next = v8AccrueTax(next, source, earnings)
  }
  return { ok:true, state:next, grossCents:order.grossCents, feeCents:order.feeCents,
    cashDeltaCents:order.proceedsCents + bonusCents, realizedNetProfitCents:effectiveProfit }
}

/** Adds an unpaid tax by source, so taxation never double-debits revenue. */
export function v8AccrueTax(state: V8CapitalState, source: TaxSource,
  profitCents: bigint): V8CapitalState {
  if (profitCents < 0n) throw new RangeError('Negative profit')
  if (profitCents === 0n) return state
  const residual = source === 'enterprises' ? BigInt(state.fiscal.enterpriseTaxRemainderBps) : 0n
  const raw = profitCents * TAX_BPS + residual
  const tax = source === 'enterprises' ? raw / 10_000n : (raw + 5_000n) / 10_000n
  return { ...state,
    fiscal: { ...state.fiscal,
      taxesDueCents:s(v(state.fiscal.taxesDueCents) + tax),
      dueBySourceCents:{ ...state.fiscal.dueBySourceCents,
        [source]:s(v(state.fiscal.dueBySourceCents[source]) + tax) },
      enterpriseTaxRemainderBps: source === 'enterprises' ? Number(raw % 10_000n) :
        state.fiscal.enterpriseTaxRemainderBps,
    },
  }
}

/** Pay taxes into negative cash exactly; optional fiscal anchor preservation. */
export function v8PayTaxes(state: V8CapitalState, at: number, preserveAnchor = false): V8CapitalState {
  if (!Number.isSafeInteger(at) || at < state.fiscal.periodStartedAt) {
    throw new RangeError('Invalid tax settlement time')
  }
  const due = v(state.fiscal.taxesDueCents)
  const paidBySource = { ...state.fiscal.paidBySourceCents }
  const dueBySourceCents = { ...state.fiscal.dueBySourceCents }
  for (const source of ['enterprises','stocks','crypto','memecoins'] as const) {
    paidBySource[source] = s(v(paidBySource[source]) + v(dueBySourceCents[source]))
    dueBySourceCents[source] = '0'
  }
  return { ...state,
    game: { ...state.game, balance:s(v(state.game.balance) - due) },
    fiscal: { ...state.fiscal,
      periodStartedAt: preserveAnchor ? state.fiscal.periodStartedAt : at,
      taxesDueCents:'0', taxesPaidCents:s(v(state.fiscal.taxesPaidCents) + due),
      dueBySourceCents, paidBySourceCents: paidBySource,
    },
  }
}

/** Exact bookstore ledgers remain permanent; Fame Shop prices change in pass 5. */
export function v8BuyFameUpgrade(state: V8CapitalState, id: FameBoostId,
  expectedLevel: number): V8CapitalState | null {
  const current = state.prestige.boosts[id]
  const price = fameCost(id, current)
  if (price === null || current !== expectedLevel ||
    v(state.prestige.fameMicros) < BigInt(price)*FAME_MICROS) return null
  const spent = getVersionedPurchasedFameCost(state.prestige.boosts, state.prestige.fameLegacyLevels)
  if (spent === null || v(state.prestige.fameSpentMicros) !== BigInt(spent)*FAME_MICROS ||
      v(state.prestige.lifetimeFameMicros) !== v(state.prestige.fameMicros) +
        v(state.prestige.fameSpentMicros) + v(state.prestige.fameForfeitedMicros)) return null
  return { ...state, prestige: { ...state.prestige,
    boosts: { ...state.prestige.boosts, [id]:current+1 },
    fameMicros:s(v(state.prestige.fameMicros) - BigInt(price)*FAME_MICROS),
    fameSpentMicros:s(v(state.prestige.fameSpentMicros) + BigInt(price)*FAME_MICROS),
  } }
}
export function v8BuyPrestigeUpgrade(state: V8CapitalState, id: AscensionUpgradeId,
  expectedLevel: number): V8CapitalState | null {
  // Former PP Auto Click is retired; its ledger is retained for the pass-6 refund.
  const offer=prestigeShop.find(row=>row.id===id)
  if (!offer || state.ascension.progress.shopVersion!==2 || state.ascension.progress.prestigeCount<offer.cycle) return null
  if (state.ascension.progress.upgradeLevels[id] !== expectedLevel) return null
  const price = prestigeCost(id, expectedLevel)
  if (price === null || v(state.ascension.progress.availablePoints) < BigInt(price)) return null
  return { ...state,
    ascension: { ...state.ascension, progress: { ...state.ascension.progress,
      availablePoints:s(v(state.ascension.progress.availablePoints) - BigInt(price)),
      upgradeLevels:{ ...state.ascension.progress.upgradeLevels, [id]:expectedLevel+1 },
    } },
  }
}

/** Purchases the maximum affordable Prestige ranks without intermediate saves. */
export function v8BuyPrestigeUpgradeMax(state: V8CapitalState, id: AscensionUpgradeId,
  expectedLevel: number): V8CapitalState | null {
  let next = v8BuyPrestigeUpgrade(state, id, expectedLevel)
  if (!next) return null
  let rank = expectedLevel + 1
  for (;;) {
    const further = v8BuyPrestigeUpgrade(next, id, rank)
    if (!further) break
    next = further
    rank++
  }
  return next
}

export function v8CollectionReward(state: V8CapitalState, fame: number): bigint {
  return v8ScaleRewardUnits(BigInt(fame) * FAME_MICROS, v8ExactRewardRate(state,'fame'))
}

export function v8BuyCollection(state: V8CapitalState, id: string): V8CapitalState | null {
  const key = currentCollectionId(id)
  const item = getCollectionSlot('v2:' + key)
  if (!item || state.prestige.ownedCollectionIds.some(owned => currentCollectionId(owned) === key) ||
      v(state.game.balance) < BigInt(item.priceCents)) return null
  const gained = v8CollectionReward(state, item.fame)
  return { ...state,
    game:{ ...state.game, balance:s(v(state.game.balance) - BigInt(item.priceCents)) },
    prestige:{ ...state.prestige,
      ownedCollectionIds:[...state.prestige.ownedCollectionIds, item.id],
      fameMicros:s(v(state.prestige.fameMicros) + gained),
      lifetimeFameMicros:s(v(state.prestige.lifetimeFameMicros) + gained),
      collectionFameMicros:s(v(state.prestige.collectionFameMicros) + gained),
      cycleEarnedFameMicros:s(v(state.prestige.cycleEarnedFameMicros) + gained),
      cycleCollectionFameMicros:s(v(state.prestige.cycleCollectionFameMicros) + gained),
    },
  }
}

function claimProgress(state: V8CapitalState, metric: AchievementMetric): bigint {
  switch(metric) {
    case 'stocks': case 'crypto': case 'memecoins': case 'dividends': return v(state.stats.earnedBySource[metric])/100n
    case 'level': return BigInt(Math.max(state.ascension.progress.highestFameAwardedLevel,state.prestige.lastAwardedLevel))
    case 'clicks': return BigInt(state.stats.clickCount)
    case 'earnings': return v(state.game.lifetimeEarned) / 100n
    case 'enterprises': return BigInt(Object.keys(state.enterprises.owned).length)
    case 'collections': return BigInt(state.prestige.ownedCollectionIds.length)
    case 'prestiges': return prestigeCycleCount(state.ascension.progress)
  }
}
export function v8ClaimAchievement(state: V8CapitalState, id: string): V8CapitalState | null {
  const group = ACHIEVEMENTS.find(g=>g.tiers.some(t=>t.id===id))
  const tier = group?.tiers.find(t=>t.id===id)
  if (!group || !tier || state.achievements.claimedIds.includes(id) ||
    claimProgress(state,group.id)< BigInt(tier.target)) return null
  return { ...state,
    game:{ ...state.game, balance:s(v(state.game.balance) + BigInt(tier.rewardCents)) },
    achievements:{ ...state.achievements,
      claimedIds:[...state.achievements.claimedIds,id],
      cycleGiftCents:s(v(state.achievements.cycleGiftCents)+BigInt(tier.rewardCents)),
    },
  }
}

/** Atomically credit every available gift from one or all achievement families. */
export function v8ClaimAvailableAchievements(state: V8CapitalState, groupId?: AchievementMetric):
  { state: V8CapitalState; count: number; rewardCents: bigint } | null {
  const claimed = new Set(state.achievements.claimedIds)
  const newIds: string[] = []
  let rewardCents = 0n
  for (const group of ACHIEVEMENTS) {
    if (groupId !== undefined && group.id !== groupId) continue
    const progress = claimProgress(state, group.id)
    for (const tier of group.tiers) {
      if (BigInt(tier.target) > progress) break
      if (claimed.has(tier.id)) continue
      newIds.push(tier.id)
      rewardCents += BigInt(tier.rewardCents)
    }
  }
  if (!newIds.length) return null
  return {
    count: newIds.length, rewardCents,
    state: { ...state,
      game: { ...state.game, balance: s(v(state.game.balance) + rewardCents) },
      achievements: { ...state.achievements,
        claimedIds: [...state.achievements.claimedIds, ...newIds],
        cycleGiftCents: s(v(state.achievements.cycleGiftCents) + rewardCents),
      },
    },
  }
}

export type V8EnterprisePurchase = {ok:true; state:V8CapitalState; costCents:bigint} | {ok:false;reason:string}
export function v8BuyEnterprise(state: V8CapitalState, id: string, at: number, upgrade = false): V8EnterprisePurchase {
  const business = getEnterprise(id)
  if (!business) return {ok:false,reason:'unknown-enterprise'}
  const previous = state.enterprises.owned[id]
  if (!upgrade && previous) return {ok:false,reason:'already-owned'}
  if (upgrade && !previous) return {ok:false,reason:'not-owned'}
  if (!previous && !isEnterpriseUnlocked(id,getExactLevel(v(state.prestige.experienceCents))))
    return {ok:false,reason:'level-locked'}
  if (!Number.isSafeInteger(at) || at < state.enterprises.lastAccruedAt)
    return {ok:false,reason:'invalid-clock'}
  const settled = v8AccrueEnterpriseUntil(state,at)
  const targetLevel = previous ? previous.level+1:1
  if (!Number.isSafeInteger(targetLevel) || targetLevel < 1 || targetLevel >= Number.MAX_SAFE_INTEGER)
    return {ok:false,reason:'max-level'}
  const cost = previous ? getEnterpriseUpgradeCostCentsExact(id,previous.level) ?? -1n : BigInt(business.purchaseCostCents)
  if (cost < 0n || v(settled.game.balance)<cost) return {ok:false,reason:cost < 0n?'max-level':'insufficient-funds'}
  const invested = previous ? v(previous.investedCents) : 0n
  const updated:V8CapitalState = { ...settled,
    game:{...settled.game,balance:s(v(settled.game.balance)-cost)},
    enterprises:{...settled.enterprises,owned:{...settled.enterprises.owned,
      [id]:{level:targetLevel,investedCents:s(invested+cost)},
    }},
  }
  return {ok:true,state:updated,costCents:cost}
}


export interface V8EnterpriseMaxQuote {
  readonly previousLevel: number
  readonly targetLevel: number
  readonly levelsBought: number
  readonly costCents: bigint
}
/** Pure exact preview including initial acquisition when not owned. */
export function quoteV8EnterpriseMax(state: V8CapitalState, id: string): V8EnterpriseMaxQuote | null {
  const business = getEnterprise(id)
  if (!business) return null
  const current = state.enterprises.owned[id]?.level ?? 0
  const max = Number.MAX_SAFE_INTEGER - 1
  if (!Number.isSafeInteger(current) || current < 0 || current >= max) return null
  if (current === 0 && !isEnterpriseUnlocked(id,getExactLevel(v(state.prestige.experienceCents)))) return null
  const budget = v(state.game.balance)
  const acquisition = current === 0 ? BigInt(business.purchaseCostCents) : 0n
  const start = Math.max(1,current)
  const costTo = (target: number) => acquisition +
    getEnterpriseUpgradeBatchCostCentsExact(id,start,target)!
  if (budget < costTo(current + 1)) return null
  let low = current + 1, high = max
  while (low < high) {
    const mid = low + Math.ceil((high-low)/2)
    if (costTo(mid) <= budget) low = mid
    else high = mid - 1
  }
  return {previousLevel:current,targetLevel:low,
    levelsBought:low-current,costCents:costTo(low)}
}
export type V8EnterpriseMaxPurchase =
  | {ok:true;state:V8CapitalState;costCents:bigint;levelsBought:number}
  | {ok:false;reason:string}
/** Settle the enterprise/fiscal clock and buy in one V8 mutation/save. */
export function v8BuyEnterpriseMax(
  state: V8CapitalState,id: string,at: number,expectedLevel: number,
): V8EnterpriseMaxPurchase {
  const business = getEnterprise(id)
  if (!business) return {ok:false,reason:'unknown-enterprise'}
  const previous = state.enterprises.owned[id]
  if ((previous?.level??0)!==expectedLevel) return {ok:false,reason:'stale-level'}
  if (!Number.isSafeInteger(at) || at<state.enterprises.lastAccruedAt ||
      at<state.fiscal.periodStartedAt) return {ok:false,reason:'invalid-clock'}
  const settled = v8AdvanceFiscalEconomy(state,at)
  if (settled.enterprises.lastAccruedAt!==at) return {ok:false,reason:'money-overflow'}
  if (!previous && !isEnterpriseUnlocked(id,getExactLevel(v(settled.prestige.experienceCents))))
    return {ok:false,reason:'level-locked'}
  const quote = quoteV8EnterpriseMax(settled,id)
  if (!quote) return {ok:false,reason:(previous?.level??0)>=Number.MAX_SAFE_INTEGER-1?'max-level':'insufficient-funds'}
  const invested = previous ? v(previous.investedCents) : 0n
  const updated: V8CapitalState = {...settled,
    game:{...settled.game,balance:s(v(settled.game.balance)-quote.costCents)},
    enterprises:{...settled.enterprises,owned:{...settled.enterprises.owned,
      [id]:{level:quote.targetLevel,investedCents:s(invested+quote.costCents)}}}}
  return {ok:true,state:updated,costCents:quote.costCents,levelsBought:quote.levelsBought}
}

/**
 * Real-time enterprise income, including a persistent 1/10-millionth cent
 * carry and the original 15% tax debt. Rebalanced ROI is applied to future accrual only.
 */
export function v8AccrueEnterpriseUntil(state:V8CapitalState, now:number):V8CapitalState {
  const elapsed=now-state.enterprises.lastAccruedAt
  if(!Number.isSafeInteger(now)||elapsed<0||!Number.isSafeInteger(elapsed))return state
  if(elapsed===0)return state
  let rate=0n
  for(const [id,holding] of Object.entries(state.enterprises.owned)) {
    const micros=getEnterpriseIncomeMicrosPerSecondExact(id,holding.level)
    if(micros!==null)rate+=micros
  }
  const enterpriseRate = v8ExactRewardRate(state,'enterprise')
  const nano=rate*BigInt(elapsed)*enterpriseRate.numerator/enterpriseRate.denominator +
    (state.enterprises.revenueCarryNanoCents!==undefined ? v(state.enterprises.revenueCarryNanoCents):
      BigInt(Math.round(state.enterprises.revenueCarryCents*10_000_000)))
  const earned=nano/10_000_000n
  const carry=nano%10_000_000n
  let next:V8CapitalState={...state,enterprises:{...state.enterprises,
    lastAccruedAt:now,revenueCarryNanoCents:s(carry),revenueCarryCents:Number(carry)/10_000_000,
  }}
  if(earned>0n){
    next=v8CreditIncome(next,'enterprises',earned)
    next=v8AccrueTax(next,'enterprises',earned)
  }
  return next
}

/** Catch-up crosses fiscal boundaries without refunding taxable income. */
export function v8AdvanceFiscalEconomy(state:V8CapitalState,now:number):V8CapitalState {
  const {periodStartedAt:start}=state.fiscal
  const last=state.enterprises.lastAccruedAt
  if(!Number.isSafeInteger(now)||now<start||now<last)return state
  const periods=Math.floor((now-start)/FISCAL_PERIOD_MS)
  if(periods===0)return v8AccrueEnterpriseUntil(state,now)
  const deadline=start+periods*FISCAL_PERIOD_MS
  if(!Number.isSafeInteger(deadline))return state
  const prepared=last>deadline?state:v8AccrueEnterpriseUntil(state,deadline)
  if(prepared.enterprises.lastAccruedAt<deadline)return state
  const paid=v8PayTaxes(prepared,deadline)
  return v8AccrueEnterpriseUntil(paid,now)
}
