import { ASSETS } from './catalog.ts'
import { getSparklineSamples } from './market.ts'
import type { AssetDefinition, PriceSample, TradingState } from './types.ts'

export type Direction = 'up' | 'down' | 'flat'
export interface AssetRow {
  asset: AssetDefinition
  price: number
  changePercent: number | null
  direction: Direction
  sparkline: string
}
const number = {
  standard: new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  small: new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
  tiny: new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 4, maximumFractionDigits: 8 }),
  micro: new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 6, maximumFractionDigits: 11 }),
  quantity: new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 8 }),
}
export function formatCash(value: number): string {
  return Number.isFinite(value) ? number.standard.format(value) + ' $' : '—'
}
export function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value === 0) return number.standard.format(0) + ' $'
  const n = value >= 1 ? number.standard : value >= .01 ? number.small :
    value >= .0001 ? number.tiny : number.micro
  return n.format(value) + ' $'
}
export function formatQuantity(value: number): string {
  return Number.isFinite(value) ? number.quantity.format(value) : '—'
}
export function formatRate(rate: number): string {
  return Number.isFinite(rate) ? number.standard.format(rate * 100) + ' %' : '—'
}
export function formatChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return (value > 0 ? '+' : '') + number.standard.format(value) + ' %'
}
export function formatPerSecond(value: number): string {
  return Number.isFinite(value) ? formatPrice(value) + '/s' : '—'
}
export function formatRemaining(endsAt: number, now: number): string {
  if (!Number.isFinite(endsAt) || !Number.isFinite(now)) return '—'
  const secs = Math.max(0, Math.ceil((endsAt - now) / 1000))
  return secs === 0 ? 'Terminé' : Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0')
}

export function sparklinePoints(series: readonly PriceSample[], width = 112, height = 34): string {
  if (series.length < 2) return ''
  const samples = getSparklineSamples(series, 40)
  const values = samples.map((entry) => entry.price)
  const min = Math.min(...values), max = Math.max(...values)
  const w = Math.max(4, width) - 4, h = Math.max(4, height) - 4
  return samples.map((entry, i) => {
    const x = 2 + (i / (samples.length - 1)) * w
    const y = max > min ? 2 + (1 - (entry.price - min) / (max - min)) * h : 2 + h / 2
    return x.toFixed(2) + ',' + y.toFixed(2)
  }).join(' ')
}

export function getAssetRows(
  kind: 'stock' | 'crypto',
  quotes: TradingState['quotes'],
  history: TradingState['history'],
): AssetRow[] {
  return ASSETS.filter((asset) => kind === 'stock' ? asset.kind === 'stock' : asset.kind !== 'stock')
    .map((asset) => {
      const price = quotes[asset.id]?.price ?? asset.referencePrice
      const series = history[asset.id] ?? []
      const baseline = series[0]?.price
      const changePercent = baseline !== undefined && baseline > 0 ? (price / baseline - 1) * 100 : null
      const direction: Direction = changePercent === null || Math.abs(changePercent) < 1e-10
        ? 'flat' : changePercent > 0 ? 'up' : 'down'
      return { asset, price, changePercent, direction, sparkline: sparklinePoints(series) }
    })
}
