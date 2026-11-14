import type { CapitalState } from '../capital.ts'
import { getAsset } from '../trading/catalog.ts'
import { validAutomation } from './automation-validation.ts'
import type { AscensionAutomationSettings, AscensionMarketOrder } from './contracts.ts'

export const MAX_PENDING_ORDERS = 24
export const AUTOMATION_BOT_INTERVAL_MS = 5_000
export const AUTO_TAKE_PROFIT_BPS = 1_000
export const AUTO_STOP_LOSS_BPS = 500
export type AutomationError =
  | 'locked' | 'invalid-settings' | 'invalid-order' | 'too-many-orders'
  | 'order-not-found' | 'pending-replay' | 'storage-error'
export type AutomationActionResult =
  | { readonly ok: true; readonly state: CapitalState }
  | { readonly ok: false; readonly state: CapitalState; readonly error: AutomationError }
const reject = (state: CapitalState, error: AutomationError): AutomationActionResult =>
  ({ ok: false, state, error })

export function validMarketOrders(raw: unknown, nextOrderId: unknown, startedAt: number, now: number): raw is AscensionMarketOrder[] {
  if (!Array.isArray(raw) || raw.length > MAX_PENDING_ORDERS ||
      !Number.isSafeInteger(nextOrderId) || (nextOrderId as number) < 1) return false
  const seen = new Set<number>()
  return raw.every((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const item = value as Record<string, unknown>
    if (Object.keys(item).length !== 7 ||
        !['id','assetId','side','kind','triggerPrice','quantity','createdAtRealMs'].every(key => Object.hasOwn(item,key))) return false
    const asset = typeof item.assetId === 'string' ? getAsset(item.assetId) : undefined
    if (!asset || !Number.isSafeInteger(item.id) || (item.id as number) < 1 ||
        (item.id as number) >= (nextOrderId as number) || seen.has(item.id as number) ||
        !(item.side === 'buy' || item.side === 'sell') ||
        !['limit','stop-loss','take-profit'].includes(item.kind as string) ||
        (item.kind !== 'limit' && item.side !== 'sell') ||
        typeof item.triggerPrice !== 'number' || !Number.isFinite(item.triggerPrice) ||
        item.triggerPrice < asset.minPrice || item.triggerPrice > asset.maxPrice ||
        typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) ||
        item.quantity <= 0 || item.quantity > asset.totalSupply ||
        Math.abs(item.quantity * 10 ** asset.quantityDecimals -
          Math.round(item.quantity * 10 ** asset.quantityDecimals)) > 0.0001 ||
        !Number.isSafeInteger(item.createdAtRealMs) ||
        (item.createdAtRealMs as number) < startedAt ||
        (item.createdAtRealMs as number) > now + 5 * 60_000) return false
    seen.add(item.id as number)
    return true
  })
}

export function configureAutomation(
  state: CapitalState, patch: Partial<AscensionAutomationSettings>,
): AutomationActionResult {
  const old = state.ascension.run.automation
  const values = { ...old, ...patch }
  if (!validAutomation(values)) return reject(state, 'invalid-settings')
  const levels = state.ascension.progress.upgradeLevels
  if ((values.autoClickEnabled && levels['auto-click'] < 1) ||
      (values.investorEnabled && levels['auto-investor'] < 1) ||
      (values.traderEnabled && levels['auto-trader'] < 1) ||
      (values.enterpriseEnabled && levels['auto-enterprise'] < 1)) return reject(state, 'locked')
  if (Object.keys(patch).some(key =>
    !['autoClickEnabled','investorEnabled','traderEnabled','enterpriseEnabled',
      'allowedAssetIds','maxOrderCents','cashReserveCents','takeProfitBps',
      'stopLossBps','enterpriseBudgetCents'].includes(key))) return reject(state, 'invalid-settings')
  if (JSON.stringify(old) === JSON.stringify(values)) return { ok: true, state }
  return {
    ok: true, state: { ...state, ascension: {
      ...state.ascension, run: { ...state.ascension.run, automation: values },
    }},
  }
}

export function createMarketOrder(
  state: CapitalState, order: Omit<AscensionMarketOrder,'id'|'createdAtRealMs'>,
  at: number,
): AutomationActionResult {
  if (state.ascension.progress.upgradeLevels['automatic-orders'] < 1) return reject(state, 'locked')
  const run = state.ascension.run
  const orders = run.marketOrders ?? []
  if (orders.length >= MAX_PENDING_ORDERS) return reject(state, 'too-many-orders')
  if (!Number.isSafeInteger(at) || at < run.startedAtRealMs ||
      at < state.trading.dividendLastPaidAt ||
      at - state.trading.dividendLastPaidAt >= 1_000) return reject(state, 'pending-replay')
  const id = run.nextOrderId ?? 1
  const input: AscensionMarketOrder = { ...order, id, createdAtRealMs: at }
  const next = [...orders, input]
  if (!Number.isSafeInteger(id + 1) ||
      !validMarketOrders(next, id + 1, run.startedAtRealMs, at)) return reject(state, 'invalid-order')
  return { ok: true, state: {
    ...state, ascension: { ...state.ascension, run: {
      ...run, marketOrders: next, nextOrderId: id + 1,
    }},
  }}
}

export function cancelMarketOrder(state: CapitalState, id: number): AutomationActionResult {
  const orders = state.ascension.run.marketOrders ?? []
  if (!Number.isSafeInteger(id) || !orders.some(order => order.id === id)) return reject(state, 'order-not-found')
  return { ok: true, state: {
    ...state, ascension: { ...state.ascension, run: {
      ...state.ascension.run, marketOrders: orders.filter(order => order.id !== id),
    }},
  }}
}

export function isMarketOrderTriggered(order: AscensionMarketOrder, currentPrice: number): boolean {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return false
  if (order.kind === 'limit') {
    return order.side === 'buy' ? currentPrice <= order.triggerPrice : currentPrice >= order.triggerPrice
  }
  if (order.kind === 'stop-loss') return order.side === 'sell' && currentPrice <= order.triggerPrice
  if (order.kind === 'take-profit') return order.side === 'sell' && currentPrice >= order.triggerPrice
  return false
}
