import type { CapitalState } from '../capital.ts'
import { getAsset } from '../trading/catalog.ts'
import { buyAsset, sellAsset, getMaximumBuyQuantity, getQuickQuantity, feeRate } from '../trading/trades.ts'
import { buyEnterprise, upgradeEnterprise } from '../economy/enterprises.ts'
import { ENTERPRISES, getEnterpriseUpgradeCostCents } from '../economy/catalog.ts'
import { earnCapitalClick } from '../economy/stats-ledger.ts'
import { getLevel } from '../game.ts'
import { AUTOMATION_BOT_INTERVAL_MS, AUTO_STOP_LOSS_BPS, AUTO_TAKE_PROFIT_BPS, isMarketOrderTriggered } from './automation-orders.ts'

function priceOf(state: CapitalState, id: string): number {
  const asset = getAsset(id)
  return state.trading.quotes[id]?.price ?? asset?.referencePrice ?? 0
}
function safeCents(dollars: number): number {
  const n = Math.round(dollars * 100)
  return Number.isSafeInteger(n) ? n : -1
}
function floorQuantity(quantity: number, decimals: number): number {
  const mult = 10 ** decimals
  return Math.floor(quantity * mult + 1e-8) / mult
}

/** Limit the order to the available budget and cash reserve, including fees.
 * All actual transactions are still validated by buyAsset/sellAsset. */
function buyWithinBudget(state: CapitalState, id: string, budgetCents: number): CapitalState {
  const asset = getAsset(id)
  const price = priceOf(state, id)
  const cashCents = safeCents(state.game.balance)
  const reserve = state.ascension.run.automation.cashReserveCents
  if (!asset || !Number.isFinite(price) || price <= 0 || cashCents < 0 ||
      !Number.isSafeInteger(budgetCents) || budgetCents <= 0) return state
  const spendingLimit = Math.min(budgetCents, cashCents - reserve)
  if (spendingLimit <= 1) return state
  const max = getMaximumBuyQuantity(state, id)
  if (max <= 0) return state
  let mult = 10 ** asset.quantityDecimals
  while (mult > 1 && max * mult > Number.MAX_SAFE_INTEGER) mult /= 10
  let high = Math.min(Number.MAX_SAFE_INTEGER,
    Math.floor(Math.min(max, spendingLimit / (100 * price)) * mult + 1e-8))
  let low = 0
  // Bound search by the exact same cent rounding rules as trades.ts.
  while (low < high) {
    const mid = low + Math.ceil((high - low) / 2)
    const gross = price * mid / mult * 100
    const total = Math.ceil(gross - 1e-8) +
      Math.max(1, Math.ceil(gross * feeRate(asset.kind) - 1e-8))
    if (Number.isSafeInteger(total) && total <= spendingLimit) low = mid
    else high = mid - 1
  }
  if (low <= 0) return state
  const quantity = low / mult
  const trade = buyAsset(state, id, quantity)
  return trade.ok && safeCents(trade.state.game.balance) >= reserve
    ? trade.state : state
}

function sellWithinBudget(state: CapitalState, id: string, budgetCents: number): CapitalState {
  const asset = getAsset(id)
  const price = priceOf(state, id)
  if (!asset || price <= 0 || !Number.isSafeInteger(budgetCents) || budgetCents <= 0) return state
  const max = getQuickQuantity(state, id, 'sell', 1)
  const q = floorQuantity(Math.min(max, budgetCents / (price * 100)), asset.quantityDecimals)
  if (!(q > 0)) return state
  const result = sellAsset(state, id, q)
  return result.ok ? result.state : state
}

/** One pending order at most per strategy step, ordered by monotonic ID. */
function performPendingOrder(state: CapitalState): CapitalState {
  if (!state.ascension.progress.upgradeLevels['automatic-orders']) return state
  for (const order of [...(state.ascension.run.marketOrders ?? [])].sort((a,b) => a.id-b.id)) {
    if (!isMarketOrderTriggered(order, priceOf(state, order.assetId))) continue
    const performed = order.side === 'buy'
      ? buyAsset(state, order.assetId, order.quantity)
      : sellAsset(state, order.assetId, order.quantity)
    if (!performed.ok ||
        (order.side === 'buy' &&
         safeCents(performed.state.game.balance) < state.ascension.run.automation.cashReserveCents)) continue
    return {
      ...performed.state,
      ascension: { ...performed.state.ascension, run: {
        ...performed.state.ascension.run,
        marketOrders: (performed.state.ascension.run.marketOrders ?? []).filter(item => item.id !== order.id),
      }},
    }
  }
  return state
}

function performAutoTrader(state: CapitalState): CapitalState {
  const config = state.ascension.run.automation
  if (!config.traderEnabled || !state.ascension.progress.upgradeLevels['auto-trader'] ||
      config.maxOrderCents <= 0) return state
  const target = config.takeProfitBps ?? AUTO_TAKE_PROFIT_BPS
  const stop = config.stopLossBps ?? AUTO_STOP_LOSS_BPS
  for (const id of [...config.allowedAssetIds].sort()) {
    const asset = getAsset(id)
    const pos = state.trading.positions[id]
    const price = priceOf(state,id)
    if (!asset || !pos || !(price > 0) || pos.quantity <= 0) continue
    const basis = pos.costBasis / pos.quantity
    const netPrice = price * (1 - feeRate(asset.kind))
    const gainBps = basis > 0 ? (netPrice / basis - 1) * 10_000 : 10_000
    if (gainBps < target && gainBps > -stop) continue
    const after = sellWithinBudget(state, id, config.maxOrderCents)
    if (after !== state) return after
  }
  return state
}

function performAutoInvestor(state: CapitalState): CapitalState {
  const config = state.ascension.run.automation
  if (!config.investorEnabled || !state.ascension.progress.upgradeLevels['auto-investor'] ||
      config.maxOrderCents <= 0) return state
  const allowed = [...config.allowedAssetIds].sort()
  for (const id of allowed) {
    const after = buyWithinBudget(state, id, config.maxOrderCents)
    if (after !== state) return after
  }
  return state
}

function performAutoEnterprise(state: CapitalState, at: number): CapitalState {
  const config = state.ascension.run.automation
  if (!config.enterpriseEnabled || !state.ascension.progress.upgradeLevels['auto-enterprise']) return state
  const cash = safeCents(state.game.balance)
  const limit = config.enterpriseBudgetCents ?? config.maxOrderCents
  const spending = Math.min(limit, cash - config.cashReserveCents)
  if (spending <= 0 || !Number.isSafeInteger(spending)) return state
  const level = getLevel(state.prestige.experienceCents / 100)
  const candidates: { id: string; kind: 'buy' | 'upgrade'; cost: number }[] = []
  for (const business of ENTERPRISES) {
    if (level < business.requiredPlayerLevel) continue
    const holding = state.enterprises.owned[business.id]
    if (!holding) candidates.push({ id: business.id, kind: 'buy', cost: business.purchaseCostCents })
    else {
      const cost = getEnterpriseUpgradeCostCents(business.id, holding.level)
      if (cost !== null) candidates.push({ id: business.id, kind: 'upgrade', cost })
    }
  }
  candidates.sort((a,b) => a.cost-b.cost || a.id.localeCompare(b.id))
  for (const item of candidates) {
    if (item.cost > spending) continue
    const result = item.kind === 'buy'
      ? buyEnterprise(state, item.id, at)
      : upgradeEnterprise(state, item.id, at)
    if (result.ok && safeCents(result.state.game.balance) >= config.cashReserveCents) return result.state
  }
  return state
}

/**
 * Called after market+fiscal replay by ONE foreground runtime. No offline
 * automatic clicks or transactions. At most 20 clicks per actual second and
 * 1 conditional order, 1 trader, 1 investor, 1 enterprise action per 5 s.
 * Persisted cursors ensure idempotence on pause/restart/import.
 */
export function runAutomationFrame(state: CapitalState, at: number, foreground: boolean): CapitalState {
  if (!foreground || !Number.isSafeInteger(at) || at < state.ascension.run.startedAtRealMs ||
      at - state.trading.dividendLastPaidAt >= 1_000 ||
      at - state.enterprises.lastAccruedAt >= 1_000 ||
      at < state.trading.dividendLastPaidAt || at < state.enterprises.lastAccruedAt) return state

  const config = state.ascension.run.automation
  const levels = state.ascension.progress.upgradeLevels
  const autoClicks = config.autoClickEnabled && levels['auto-click'] > 0
  const activeBots = (config.investorEnabled && levels['auto-investor'] > 0) ||
    (config.traderEnabled && levels['auto-trader'] > 0) ||
    (config.enterpriseEnabled && levels['auto-enterprise'] > 0) ||
    (levels['automatic-orders'] > 0 && (state.ascension.run.marketOrders?.length ?? 0) > 0)
  if (!autoClicks && !activeBots) return state

  let updated = state
  const seconds = Math.floor(at / 1_000) * 1_000
  const lastClick = state.ascension.run.lastAutomationAtRealMs ?? seconds - 1_000
  if (autoClicks && seconds > lastClick) {
    for (let n = 0; n < Math.min(20, levels['auto-click']); n++) {
      const next = earnCapitalClick(updated)
      if (next === updated) break
      updated = next
    }
  }
  if (autoClicks && seconds > lastClick) {
    updated = { ...updated, ascension: { ...updated.ascension, run: {
      ...updated.ascension.run, lastAutomationAtRealMs: seconds,
    }}}
  }

  const lastStrategy = state.ascension.run.lastStrategyAtRealMs ?? at - AUTOMATION_BOT_INTERVAL_MS
  if (activeBots && at - lastStrategy >= AUTOMATION_BOT_INTERVAL_MS) {
    updated = performPendingOrder(updated)
    updated = performAutoTrader(updated)
    updated = performAutoInvestor(updated)
    updated = performAutoEnterprise(updated, at)
    updated = { ...updated, ascension: { ...updated.ascension, run: {
      ...updated.ascension.run, lastStrategyAtRealMs: at,
    }}}
  }
  return updated
}
