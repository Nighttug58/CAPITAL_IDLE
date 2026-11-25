import { ASSETS } from './catalog.ts'
import { getSparklineSamples } from './market.ts'
import type { AssetDefinition, MarketQuote, PriceSample, TradingState } from './types.ts'

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
  // Afficher les microcours et les cours très élevés sans arrondir à zéro.
  if (value < 1e-11 || value >= 1e15) return value.toExponential(4).replace('.', ',') + ' $'
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

/** UI-only live tip. At accelerated market speeds quotes can move every real
 * second while persisted 1h history is sampled every 5s (720 points). Show
 * the authoritative current quote immediately without increasing save size.
 * Never mutate historical samples or duplicate a timestamp. */
export function withLiveQuote(samples: readonly PriceSample[], quote?: MarketQuote): readonly PriceSample[] {
  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0 ||
      !Number.isSafeInteger(quote.updatedAt) || samples.length === 0) return samples
  const last = samples[samples.length - 1]!
  if (quote.updatedAt < last.at ||
      (quote.updatedAt === last.at && quote.price === last.price)) return samples
  const current: PriceSample = {
    at: quote.updatedAt,
    price: quote.price,
    ...(quote.dividendYield !== null ? { dividendYield: quote.dividendYield } : {}),
  }
  return quote.updatedAt === last.at
    ? [...samples.slice(0, -1), current]
    : [...samples, current]
}

export function sparklinePoints(series: readonly PriceSample[], width = 112, height = 34, maxPoints = 40): string {
  if (series.length < 2) return ''
  const samples = getSparklineSamples(series, maxPoints)
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
      return { asset, price, changePercent, direction, sparkline: sparklinePoints(withLiveQuote(series, quotes[asset.id])) }
    })
}


/** Lower bound over the chronological, unmodified market history. */
export function historyLowerBound(samples:readonly PriceSample[],at:number):number {
  let low=0,high=samples.length
  while(low<high){
    const mid=low+Math.floor((high-low)/2)
    if(samples[mid]!.at<at)low=mid+1
    else high=mid
  }
  return low
}

/** Exact nearest real sample, with the same earlier-point tie rule as a scan. */
export function nearestPriceSample(samples:readonly PriceSample[],at:number):PriceSample|undefined {
  if(!samples.length||!Number.isFinite(at))return undefined
  const i=historyLowerBound(samples,at)
  if(i===0)return samples[0]
  const before=samples[i-1]!,after=samples[i]
  return !after||at-before.at<=after.at-at?before:after
}

/** One pass, no intermediate array or spread of all prices. */
export function priceExtremes(samples:readonly PriceSample[]):{min:number;max:number}{
  let min=Infinity,max=-Infinity
  for(const sample of samples){
    min=Math.min(min,sample.price)
    max=Math.max(max,sample.price)
  }
  return {min,max}
}
