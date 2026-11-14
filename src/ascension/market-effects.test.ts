import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState } from '../capital.ts'
import { performPrestige } from './engine.ts'
import { buyAscensionUpgrade } from './shop.ts'
import {
  MARKET_SPEEDS, marketSpeed, selectMarketSpeed, activateMarketFrenzy,
  frenzyActive, marketNewsEffects, peekUpcomingNews, volatilityRadar,
  FRENZY_COOLDOWN_MS, FRENZY_ACTIVE_MS,
} from './market-effects.ts'
import { advanceCapitalSecond } from '../trading/dividends.ts'
import { advanceNewsTick, getNewsPressure, getNewsTemplate } from '../trading/news.ts'
import { getAsset } from '../trading/catalog.ts'
import { availableMarketLiquidity, marketLiquidityCapacity, LIQUIDITY_REGEN_PER_MINUTE } from '../trading/liquidity.ts'
import { buyAsset, getMaximumBuyQuantity, sellAsset } from '../trading/trades.ts'
import { createSaveExport, prepareSaveImport } from '../save-transfer.ts'
import type { CapitalState } from '../capital.ts'
import type { MarketNews } from '../trading/types.ts'

const NOW = 1_800_000_000_000

function withPoints(wealth = 10_000_000_000): CapitalState {
  const start = createCapitalState({ balance: wealth, lifetimeEarned: wealth, purchasedUpgrades: 0 }, NOW)
  const result = performPrestige(start, NOW)
  assert.ok(result.ok)
  return result.state
}
function buyLevels(state: CapitalState, id: string, count: number): CapitalState {
  let current = state
  for (let level = 0; level < count; level++) {
    const result = buyAscensionUpgrade(current, id, level)
    assert.ok(result.ok, id + ' level ' + level)
    current = result.state
  }
  return current
}
function seconds(state: CapitalState, count: number): CapitalState {
  let current = state
  for (let i = 0; i < count; i++) {
    const advanced = advanceCapitalSecond(current)
    assert.notStrictEqual(advanced, current, 'second ' + i + ' must progress')
    current = advanced
  }
  return current
}

test('Accélérateur : cinq niveaux, six vitesses, refus des vitesses verrouillées', () => {
  let state = withPoints()
  assert.deepEqual(MARKET_SPEEDS, [1, 1.5, 2, 3, 4, 5])
  assert.equal(marketSpeed(state), 1)
  const locked = selectMarketSpeed(state, 5)
  assert.equal(locked.ok, false)
  state = buyLevels(state, 'time-accelerator', 5)
  assert.equal(state.ascension.progress.availablePoints, 50)
  const boosted = selectMarketSpeed(state, 5)
  assert.ok(boosted.ok)
  assert.equal(marketSpeed(boosted.state), 5)
  const invalid = selectMarketSpeed(boosted.state, 15)
  assert.equal(invalid.ok, false)
  const normal = selectMarketSpeed(boosted.state, 1)
  assert.ok(normal.ok)
  assert.equal(marketSpeed(normal.state), 1)
})

test('×5 : marchés accélérés, mais dividendes, News et impôts sur les secondes réelles', () => {
  const start = withPoints()
  const unlocked = buyLevels(start, 'time-accelerator', 5)
  const enabled = selectMarketSpeed(unlocked, 5)
  assert.ok(enabled.ok)
  const normal = seconds(start, 60)
  const fast = seconds(enabled.state, 60)
  assert.equal(normal.trading.dividendLastPaidAt, NOW + 60_000)
  assert.equal(fast.trading.dividendLastPaidAt, NOW + 60_000)
  assert.equal(normal.fiscal.periodStartedAt, NOW)
  assert.equal(fast.fiscal.periodStartedAt, NOW)
  assert.equal(normal.game.lifetimeEarned, 0)
  assert.equal(fast.game.lifetimeEarned, 0)
  assert.equal(normal.ascension.run.marketClock.simulatedAtMs, NOW + 60_000)
  assert.equal(fast.ascension.run.marketClock.simulatedAtMs, NOW + 300_000)
  assert.equal(fast.trading.lastTickAt, NOW + 60_000)
  assert.notEqual(fast.trading.seed, normal.trading.seed)
  assert.ok((fast.trading.history.nvideo?.length ?? 0) <= 14)
  assert.ok((normal.trading.history.nvideo?.length ?? 0) <= 14)
  assert.deepEqual(restoreCapitalState(JSON.parse(JSON.stringify(fast)), NOW + 60_000), fast)
})

test('News : ×2 durée et puissance symétrique sur prix/dividendes', () => {
  let state = withPoints()
  state = buyLevels(state, 'news-duration', 4)
  state = buyLevels(state, 'news-impact', 4)
  const effects = marketNewsEffects(state, NOW)
  assert.equal(effects.durationMultiplier, 2)
  assert.equal(effects.impactMultiplier, 2)
  const after = seconds(state, 5)
  const upcoming = after.trading.upcomingNews
  assert.ok(upcoming)
  assert.ok(upcoming.endsAt - upcoming.startedAt >= 240_000)
  assert.ok(upcoming.endsAt - upcoming.startedAt <= 3_600_000)
  const now = NOW + 120_000
  const make = (templateId: string, impact: number): MarketNews => ({
    id: 'news-test-' + templateId,
    templateId,
    startedAt: NOW,
    endsAt: NOW + 240_000,
    affectedAssetIds: ['nvideo'],
    impact,
    phase: 'active',
  })
  const positive = make('earnings-beat', 0.5)
  const negative = make('earnings-miss', -0.5)
  assert.ok(getNewsTemplate(positive.templateId))
  const plus = getNewsPressure([positive], now, 2)
  const plusBase = getNewsPressure([positive], now, 1)
  const minus = getNewsPressure([negative], now, 2)
  const minusBase = getNewsPressure([negative], now, 1)
  assert.ok(plus.price.nvideo! > 0 && plus.dividend.nvideo! > 0)
  assert.ok(minus.price.nvideo! < 0 && minus.dividend.nvideo! < 0)
  assert.equal(plus.price.nvideo, plusBase.price.nvideo! * 2)
  assert.equal(minus.price.nvideo, minusBase.price.nvideo! * 2)
})

test('Fréquence News, propagation des News single et prévision déterministe', () => {
  let state = withPoints(25_000_000_000)
  state = buyLevels(state, 'news-frequency', 10)
  state = buyLevels(state, 'news-propagation', 1)
  state = buyLevels(state, 'news-preview', 5)
  const effects = marketNewsEffects(state, NOW)
  assert.equal(effects.frequencyMultiplier, 1.5)
  assert.equal(effects.propagateSingle, true)
  const scheduled = advanceNewsTick([], NOW + 5_000, NOW, NOW, () => 0, {
    eager: true, propagateSingle: true, frequencyMultiplier: 1.5,
  })
  assert.ok(scheduled.upcomingNews)
  assert.equal(scheduled.upcomingNews.affectedAssetIds.length, 2)
  assert.notEqual(scheduled.upcomingNews.affectedAssetIds[0], scheduled.upcomingNews.affectedAssetIds[1])
  const previewState = {
    ...state, trading: {
      ...state.trading, nextNewsAt: scheduled.nextNewsAt,
      upcomingNews: scheduled.upcomingNews,
    },
  }
  assert.equal(peekUpcomingNews(previewState, NOW - 30_000)?.secondsRemaining, undefined)
  assert.equal(peekUpcomingNews(previewState, NOW)?.secondsRemaining, 5)
  assert.equal(peekUpcomingNews(previewState, NOW + 5_000), null)
  const confirmed = advanceNewsTick(scheduled.news, scheduled.nextNewsAt, NOW, NOW + 5_000, () => 0.5, {
    eager: true, upcomingNews: scheduled.upcomingNews,
  })
  assert.deepEqual(confirmed.news[0], scheduled.upcomingNews)
})

test('Frénésie : activation persistante et cooldown 30 min du temps réel', () => {
  let state = withPoints()
  const inaccessible = activateMarketFrenzy(state, NOW)
  assert.equal(inaccessible.ok, false)
  state = buyLevels(state, 'market-frenzy', 1)
  const activated = activateMarketFrenzy(state, NOW)
  assert.ok(activated.ok)
  assert.equal(activated.state.ascension.run.frenzyEndsAtRealMs, NOW + FRENZY_ACTIVE_MS)
  assert.equal(activated.state.ascension.run.frenzyReadyAtRealMs, NOW + FRENZY_COOLDOWN_MS)
  assert.equal(frenzyActive(activated.state, NOW + 30_000), true)
  assert.equal(frenzyActive(activated.state, NOW + 61_000), false)
  assert.equal(marketNewsEffects(activated.state, NOW + 30_000).impactMultiplier, 1.5)
  const blocked = activateMarketFrenzy(activated.state, NOW + 1_000)
  assert.equal(blocked.ok, false)
  const restored = prepareSaveImport(createSaveExport(activated.state, NOW), NOW)
  assert.ok(restored.ok)
  assert.deepEqual(restored.preview.state, activated.state)
  const resumed = {
    ...activated.state,
    trading: { ...activated.state.trading, dividendLastPaidAt: NOW + FRENZY_COOLDOWN_MS },
    ascension: {
      ...activated.state.ascension,
      run: {
        ...activated.state.ascension.run,
        marketClock: {
          ...activated.state.ascension.run.marketClock,
          realAnchorMs: NOW + FRENZY_COOLDOWN_MS,
        },
      },
    },
  }
  const next = activateMarketFrenzy(resumed, NOW + FRENZY_COOLDOWN_MS)
  assert.ok(next.ok)
})

test('Radar : classe les marchés avec les vrais échantillons historiques', () => {
  let state = withPoints()
  assert.deepEqual(volatilityRadar(state), [])
  state = buyLevels(state, 'volatility-radar', 1)
  state.trading.history.bitcoin = [
    { at: NOW, price: 100 }, { at: NOW + 5_000, price: 200 },
  ]
  state.trading.history.nvideo = [
    { at: NOW, price: 100 }, { at: NOW + 5_000, price: 105 },
  ]
  const radar = volatilityRadar(state)
  assert.equal(radar.length, 2)
  assert.equal(radar[0]?.id, 'bitcoin')
  assert.ok(radar[0]!.volatilityPercent > radar[1]!.volatilityPercent)
})

test('Liquidité : achat et vente séparés, ×3 profondeur, ×2,5 régénération', () => {
  const start = createCapitalState({ balance: 100_000_000, lifetimeEarned: 100_000_000, purchasedUpgrades: 0 }, NOW)
  const btc = getAsset('bitcoin')!
  assert.equal(marketLiquidityCapacity(btc, 0), 210)
  assert.equal(marketLiquidityCapacity(btc, 10), 630)
  assert.equal(availableMarketLiquidity(start, 'bitcoin', 'buy'), 210)
  assert.equal(getMaximumBuyQuantity(start, 'bitcoin'), 210)
  const tooMuch = buyAsset(start, 'bitcoin', 211)
  assert.equal(tooMuch.ok, false)
  if (!tooMuch.ok) assert.equal(tooMuch.error, 'insufficient-liquidity')
  const bought = buyAsset(start, 'bitcoin', 210)
  assert.ok(bought.ok)
  assert.equal(availableMarketLiquidity(bought.state, 'bitcoin', 'buy'), 0)
  assert.equal(availableMarketLiquidity(bought.state, 'bitcoin', 'sell'), 210)
  const sold = sellAsset(bought.state, 'bitcoin', 210)
  assert.ok(sold.ok)
  assert.equal(availableMarketLiquidity(sold.state, 'bitcoin', 'sell'), 0)
  const later = {
    ...sold.state,
    trading: { ...sold.state.trading, dividendLastPaidAt: NOW + 120_000 },
  }
  const regenerated = availableMarketLiquidity(later, 'bitcoin', 'buy')
  assert.ok(regenerated >= 210 * LIQUIDITY_REGEN_PER_MINUTE * 2 - 1e-8)
  assert.ok(regenerated < 210)
  const imported = prepareSaveImport(createSaveExport(sold.state, NOW), NOW)
  assert.ok(imported.ok)
  assert.deepEqual(imported.preview.state, sold.state)
})

test('v7 historique avant passe 4 : pools absents acceptés avec migration non destructrice', () => {
  const old = createCapitalState(undefined, NOW)
  const raw = JSON.parse(JSON.stringify(old))
  delete raw.trading.liquidity
  const imported = prepareSaveImport(JSON.stringify(raw), NOW)
  assert.ok(imported.ok)
  assert.deepEqual(imported.preview.state.trading.liquidity, {})
  assert.equal(imported.preview.state.game.balance, old.game.balance)
})
