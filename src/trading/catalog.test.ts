import assert from 'node:assert/strict'
import test from 'node:test'
import { ASSETS, CATALOG_SNAPSHOT_DATE, createInitialQuotes, getAsset, getAvailableSupply } from './trading/catalog.ts'

test('catalogue exactement 20 actions, 15 cryptos, 10 memecoins', () => {
  assert.equal(ASSETS.length, 45)
  assert.equal(ASSETS.filter((asset) => asset.kind === 'stock').length, 20)
  assert.equal(ASSETS.filter((asset) => asset.kind === 'crypto').length, 15)
  assert.equal(ASSETS.filter((asset) => asset.kind === 'memecoin').length, 10)
})

test('ticker et id uniques, contrats valides, prix de référence dans bornes', () => {
  assert.equal(new Set(ASSETS.map((a) => a.id)).size, 45)
  assert.equal(new Set(ASSETS.map((a) => a.symbol)).size, 45)
  for (const asset of ASSETS) {
    assert.match(asset.id, /^[a-z0-9-]+$/)
    assert.match(asset.symbol, /^[A-Z0-9]+$/)
    assert.ok(Number.isFinite(asset.referencePrice) && asset.referencePrice > 0)
    assert.ok(asset.minPrice > 0 && asset.minPrice < asset.referencePrice)
    assert.ok(asset.maxPrice > asset.referencePrice)
    assert.ok(Number.isSafeInteger(asset.totalSupply) && asset.totalSupply > 0)
    assert.ok(asset.quantityDecimals >= 0 && asset.quantityDecimals <= 8)
    assert.match(asset.priceSource, /^https:\/\//)
    assert.equal(asset.priceReferenceDate, CATALOG_SNAPSHOT_DATE)
    assert.ok(asset.supplyNote.length > 10)
    assert.ok(asset.sector.length > 2)
    assert.equal(getAsset(asset.id), asset)
  }
  assert.equal(getAsset('this-does-not-exist'), undefined)
})

test('actions parodiées, dividendes initialement bornés 1–30 %, émissions fictives', () => {
  const stocks = ASSETS.filter((a) => a.kind === 'stock')
  for (const a of stocks) {
    assert.ok(a.inspiredBy)
    assert.equal(a.supplyBasis, 'fictional-issue')
    assert.ok(a.initialDividendYield !== null && a.initialDividendYield >= 0.01 && a.initialDividendYield <= 0.30)
    assert.ok(Math.abs(a.minPrice / a.referencePrice - 0.10) < 1e-10)
    assert.ok(Math.abs(a.maxPrice / a.referencePrice - 6) < 1e-10)
  }
  assert.equal(getAsset('nvideo')?.name, 'Nvideo')
  assert.equal(getAsset('mike')?.name, 'Mike')
  assert.equal(getAsset('simsung')?.name, 'Simsung')
  assert.equal(getAsset('mcgonagal')?.name, 'McGonagal')
})

test('cryptos authentiques : bornes et absence de dividendes', () => {
  const coins = ASSETS.filter((a) => a.kind !== 'stock')
  for (const a of coins) {
    assert.equal(a.inspiredBy, null)
    assert.equal(a.initialDividendYield, null)
    assert.ok(Math.abs(a.minPrice / a.referencePrice - 0.05) < 1e-10)
    assert.ok(Math.abs(a.maxPrice / a.referenceHighPrice - 5) < 1e-10)
    assert.ok(['protocol-cap', 'launch-supply', 'game-cap'].includes(a.supplyBasis))
  }
  assert.equal(getAsset('bitcoin')?.totalSupply, 21_000_000)
  assert.equal(getAsset('shiba-inu')?.totalSupply, 1_000_000_000_000_000)
  assert.equal(getAsset('dogecoin')?.supplyBasis, 'game-cap')
  assert.equal(getAsset('monero')?.supplyBasis, 'game-cap')
})

test('l offre complète reste achetable et diminue seulement des unités détenues', () => {
  for (const asset of ASSETS) {
    assert.equal(getAvailableSupply(asset, 0), asset.totalSupply)
    assert.equal(getAvailableSupply(asset, asset.totalSupply), 0)
    assert.equal(getAvailableSupply(asset, asset.totalSupply * 2), 0)
    assert.equal(getAvailableSupply(asset, -1), 0)
    assert.equal(getAvailableSupply(asset, Number.NaN), 0)
    assert.ok(getAvailableSupply(asset, asset.totalSupply / 2) > 0)
  }
})

test('les 45 cotations initiales sont indexées par actif, sans état mutable partagé', () => {
  const a = createInitialQuotes(1_700_000_000_000)
  const b = createInitialQuotes(1_700_000_000_000)
  assert.equal(Object.keys(a).length, 45)
  for (const asset of ASSETS) {
    assert.deepEqual(a[asset.id], { price: asset.referencePrice, momentum: 0, dividendYield: asset.initialDividendYield, updatedAt: 1_700_000_000_000 })
  }
  a.bitcoin!.price = 1
  assert.notEqual(b.bitcoin!.price, 1)
})
