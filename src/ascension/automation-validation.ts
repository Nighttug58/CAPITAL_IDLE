import { getAsset } from '../trading/catalog.ts'
import type { AscensionAutomationSettings } from './contracts.ts'

const safe = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export function validAutomation(value: unknown): value is AscensionAutomationSettings {
  const base = [
    'autoClickEnabled', 'investorEnabled', 'traderEnabled', 'enterpriseEnabled',
    'allowedAssetIds', 'maxOrderCents', 'cashReserveCents',
  ]
  const optional = ['takeProfitBps', 'stopLossBps', 'enterpriseBudgetCents']
  if (!record(value) || !base.every(key => Object.hasOwn(value, key)) ||
      !Object.keys(value).every(key => base.includes(key) || optional.includes(key))) return false
  if (['autoClickEnabled', 'investorEnabled', 'traderEnabled', 'enterpriseEnabled']
    .some(id => typeof value[id] !== 'boolean')) return false
  if (!safe(value.maxOrderCents) || !safe(value.cashReserveCents) ||
      (value.takeProfitBps !== undefined && (!safe(value.takeProfitBps) || value.takeProfitBps < 100 || value.takeProfitBps > 10_000)) ||
      (value.stopLossBps !== undefined && (!safe(value.stopLossBps) || value.stopLossBps < 100 || value.stopLossBps > 9_000)) ||
      (value.enterpriseBudgetCents !== undefined && !safe(value.enterpriseBudgetCents)) ||
      !Array.isArray(value.allowedAssetIds) || value.allowedAssetIds.length > 45) return false
  return value.allowedAssetIds.every((id: unknown) => typeof id === 'string' && !!getAsset(id)) &&
    new Set(value.allowedAssetIds).size === value.allowedAssetIds.length
}

