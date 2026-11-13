import assert from 'node:assert/strict'
import test from 'node:test'
import { ASSETS, createInitialQuotes } from './catalog.ts'
import {
  formatCash, formatPrice, formatQuantity, formatRate, formatChange, formatRemaining,
  getAssetRows, sparklinePoints,
} from './presentation.ts'
import type { PriceSample } from './types.ts'

const NOW = 1_800_000_000_000

test('20 actions, 15 cryptos et 10 memecoins affichés sans duplication', () => {
  const quotes = createInitialQuotes(NOW)
  const stocks = getAssetRows('stock', quotes, {})
  const coins = getAssetRows('crypto', quotes, {})
  assert.equal(stocks.length, 20)
  assert.equal(coins.length, 25)
  assert.equal(stocks.filter((row) => row.asset.kind !== 'stock').length, 0)
  assert.equal(coins.filter((row) => row.asset.kind === 'crypto').length, 15)
  assert.equal(coins.filter((row) => row.asset.kind === 'memecoin').length, 10)
  assert.equal(new Set([...stocks, ...coins].map((row) => row.asset.id)).size, ASSETS.length)
})

test('cours initial sans historique : variation indisponible, pas de performance fictive', () => {
  const quote = createInitialQuotes(NOW)
  const stocks = getAssetRows('stock', quote, {})
  assert.ok(stocks.every((row) => row.changePercent === null && row.direction === 'flat' && row.sparkline === ''))
  assert.equal(formatChange(null), '—')
})

test('variation depuis la première cotation de l historique, hausse et baisse', () => {
  const quote = createInitialQuotes(NOW)
  const a = quote.nvideo!
  quote.nvideo = { ...a, price: a.price * 1.25 }
  const nvideoHistory: PriceSample[] = [{ at: NOW, price: a.price }, { at: NOW + 5_000, price: a.price * 1.25 }]
  const nvideo = getAssetRows('stock', quote, { nvideo: nvideoHistory }).find((row) => row.asset.id === 'nvideo')!
  assert.ok(Math.abs(nvideo.changePercent! - 25) < 1e-10)
  assert.equal(nvideo.direction, 'up')
  assert.notEqual(nvideo.sparkline, '')

  quote.nvideo = { ...a, price: a.price * .5 }
  const down = getAssetRows('stock', quote, { nvideo: [{ at: NOW, price: a.price }, { at: NOW + 5_000, price: a.price * .5 }] }).find((row) => row.asset.id === 'nvideo')!
  assert.ok(Math.abs(down.changePercent! + 50) < 1e-10)
  assert.equal(down.direction, 'down')
})

test('mini-graphe : SVG borné, ordre des points et conservation des extrêmes', () => {
  const prices = Array.from({ length: 720 }, (_, i) =>
    ({ at: NOW + i * 5_000, price: i === 180 ? 1000 : i === 430 ? .01 : 100 }))
  const points = sparklinePoints(prices)
  const values = points.split(' ').map((coord) => coord.split(',').map(Number))
  assert.ok(values.length <= 40 && values.length >= 4)
  assert.ok(values.every(([x, y]) => x !== undefined && x >= 2 && x <= 110 && y !== undefined && y >= 2 && y <= 32))
  assert.ok(values.some(([, y]) => y === 2))
  assert.ok(values.some(([, y]) => y === 32))
  assert.ok(values.every((coordinates, i) => i === 0 || coordinates[0]! > values[i - 1]![0]!))
  assert.equal(sparklinePoints([]), '')
  assert.equal(sparklinePoints([{ at: NOW, price: 100 }]), '')
})

test('mini-graphe horizontal lorsqu un cours est stable', () => {
  const values = sparklinePoints([{ at: NOW, price: 1 }, { at: NOW + 5000, price: 1 }]).split(' ')
  assert.equal(values.length, 2)
  assert.equal(values[0]!.split(',')[1], values[1]!.split(',')[1])
})

test('format monétaire : centimes conservés, memecoins sans arrondir à zéro', () => {
  assert.match(formatCash(1234.56), /1.234,56|1.234.56|1 234,56|1’234.56/)
  assert.match(formatPrice(.00000434), /[1-9]/)
  assert.doesNotMatch(formatPrice(.00000434), /^0[,\.]0+\s\$$/)
  assert.match(formatPrice(.00000000434), /434/)
  assert.equal(formatPrice(Number.NaN), '—')
  assert.equal(formatCash(Infinity), '—')
  assert.equal(formatQuantity(.00000001), '0,00000001')
  assert.equal(formatRate(.185), '18,50 %')
  assert.equal(formatChange(1.25), '+1,25 %')
  assert.equal(formatChange(-2.5), '-2,50 %')
})

test('compte à rebours : bornes, seconde montante et expiration exacte', () => {
  assert.equal(formatRemaining(NOW + 120_000, NOW), '2:00')
  assert.equal(formatRemaining(NOW + 120_001, NOW), '2:01')
  assert.equal(formatRemaining(NOW + 1000, NOW), '0:01')
  assert.equal(formatRemaining(NOW, NOW), 'Terminé')
  assert.equal(formatRemaining(NOW - 1000, NOW), 'Terminé')
  assert.equal(formatRemaining(NaN, NOW), '—')
})

test('calcule 45 séries avec 720 points sans données non finies', () => {
  const history = Object.fromEntries(ASSETS.map((asset) => [asset.id,
    Array.from({ length: 720 }, (_, i) => ({
      at: NOW + i * 5_000, price: asset.referencePrice * (1 + 0.08 * Math.sin(i / 18)),
    }))
  ]))
  const quotes = createInitialQuotes(NOW)
  const start = performance.now()
  const rows = [...getAssetRows('stock', quotes, history), ...getAssetRows('crypto', quotes, history)]
  assert.equal(rows.length, 45)
  assert.ok(rows.every((row) => row.sparkline.length > 10 && !row.sparkline.includes('NaN')))
  assert.ok(performance.now() - start < 2_000)
})
