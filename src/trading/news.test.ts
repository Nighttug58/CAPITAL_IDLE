import assert from 'node:assert/strict'
import test from 'node:test'
import { ASSETS } from './catalog.ts'
import { catchUpMarket, MAX_CATCH_UP_TICKS } from './clock.ts'
import { advanceMarketTick, MARKET_TICK_MS } from './market.ts'
import {
  advanceNewsTick, EXPIRED_NEWS_HISTORY, getNewsEnvelope, getNewsPresentation,
  getNewsPressure, getNewsRemainingMs, getNewsTemplate, MAX_NEWS_DURATION_MS,
  MAX_NEWS_INTERVAL_MS, MIN_NEWS_DURATION_MS, MIN_NEWS_INTERVAL_MS,
  NEWS_TEMPLATES, trimNews,
} from './news.ts'
import { createInitialTradingState, restoreTradingState } from './state.ts'
import type { MarketNews, TradingState } from './types.ts'

const START = 1_800_000_000_000
const TICK = MARKET_TICK_MS
const HOUR = 3_600_000

function event(overrides: Partial<MarketNews> = {}): MarketNews {
  return {
    id: 'news-test', templateId: 'earnings-beat',
    startedAt: START - 120_000, endsAt: START + 480_000,
    affectedAssetIds: ['nvideo'], impact: 1, phase: 'active', ...overrides,
  }
}

test('26 fiches originales, identifiants uniques, descriptions et catégories cohérentes', () => {
  assert.equal(NEWS_TEMPLATES.length, 26)
  assert.equal(new Set(NEWS_TEMPLATES.map((story) => story.id)).size, 26)
  for (const story of NEWS_TEMPLATES) {
    assert.ok(story.headline.length > 20, story.id)
    assert.ok(story.description.length > 65, story.id)
    assert.ok(story.scenario.length > 30, story.id)
    assert.ok(story.priceWeight >= 0 && story.priceWeight <= 1)
    assert.ok(Math.abs(story.dividendWeight) <= 1)
    assert.equal(getNewsTemplate(story.id), story)
  }
  assert.equal(getNewsTemplate('unknown'), undefined)
  assert.ok(NEWS_TEMPLATES.some((story) => story.target === 'sector'))
  assert.ok(NEWS_TEMPLATES.some((story) => story.target === 'global'))
  assert.ok(NEWS_TEMPLATES.some((story) => story.rumored))
})

test('première News : attente de 2–8 minutes sans génération instantanée', () => {
  const scheduled = advanceNewsTick([], null, START, START + TICK, () => 0)
  assert.equal(scheduled.nextNewsAt, START + MIN_NEWS_INTERVAL_MS)
  assert.equal(scheduled.news.length, 0)
  const notYet = advanceNewsTick(scheduled.news, scheduled.nextNewsAt, START + TICK, START + MIN_NEWS_INTERVAL_MS - TICK, () => 0.5)
  assert.equal(notYet.news.length, 0)
  const due = advanceNewsTick(notYet.news, notYet.nextNewsAt, START + MIN_NEWS_INTERVAL_MS - TICK, START + MIN_NEWS_INTERVAL_MS, () => 0)
  assert.equal(due.news.length, 1)
  assert.equal(due.news[0]?.startedAt, START + MIN_NEWS_INTERVAL_MS)
  assert.equal(due.news[0]?.endsAt, START + MIN_NEWS_INTERVAL_MS + MIN_NEWS_DURATION_MS)
  assert.equal(due.nextNewsAt, START + MIN_NEWS_INTERVAL_MS * 2)
  assert.equal(getNewsRemainingMs(due.news[0]!, due.news[0]!.endsAt), 0)
  assert.equal(getNewsRemainingMs(due.news[0]!, due.news[0]!.startedAt), MIN_NEWS_DURATION_MS)
})

test('les échéances tirées couvrent les bornes 2–8 min et 2–30 min', () => {
  const high = advanceNewsTick([], null, START, START + TICK, () => 0.999999)
  assert.equal(high.nextNewsAt, START + MAX_NEWS_INTERVAL_MS)
  const due = advanceNewsTick([], START + TICK, START, START + TICK, () => 0.999999)
  assert.equal(due.news[0]?.endsAt - due.news[0]!.startedAt, MAX_NEWS_DURATION_MS)
  assert.equal(due.nextNewsAt, START + TICK + MAX_NEWS_INTERVAL_MS)
})

test('événements tirés par le moteur : cadence indépendante et durée fixe', () => {
  let state = createInitialTradingState(START, 225)
  const generated: MarketNews[] = []
  for (let index = 0; index < 3_600; index++) {
    state = advanceMarketTick(state)
    const fresh = state.news.find((item) => item.startedAt === state.lastTickAt)
    if (fresh) generated.push(fresh)
  }
  assert.ok(generated.length >= 20 && generated.length <= 150)
  assert.equal(new Set(generated.map((item) => item.id)).size, generated.length)
  for (let index = 0; index < generated.length; index++) {
    const item = generated[index]!
    const duration = item.endsAt - item.startedAt
    assert.ok(duration >= MIN_NEWS_DURATION_MS && duration <= MAX_NEWS_DURATION_MS)
    assert.equal(duration % TICK, 0)
    assert.ok(item.affectedAssetIds.length > 0)
    assert.ok(item.affectedAssetIds.every((id) => ASSETS.some((asset) => asset.id === id)))
    assert.ok(item.impact >= -1 && item.impact <= 1)
    if (index > 0) {
      const interval = item.startedAt - generated[index - 1]!.startedAt
      assert.ok(interval >= MIN_NEWS_INTERVAL_MS && interval <= MAX_NEWS_INTERVAL_MS)
    }
  }
})

test('expiration : les 10 dernières News expirées restent, et toutes les actives', () => {
  const list = Array.from({ length: 18 }, (_, index) => event({
    id: 'news-' + index,
    startedAt: START - 900_000 + index * 20_000,
    endsAt: START - 200_000 + index * 20_000,
  }))
  const active = [
    event({ id: 'news-active-a', startedAt: START - 20_000, endsAt: START + 200_000 }),
    event({ id: 'news-active-b', startedAt: START - 10_000, endsAt: START + 500_000 }),
  ]
  const trimmed = trimNews([...list, ...active], START)
  const expired = trimmed.filter((item) => item.endsAt <= START)
  assert.equal(expired.length, EXPIRED_NEWS_HISTORY)
  assert.equal(trimmed.filter((item) => item.endsAt > START).length, 2)
  assert.ok(trimmed.some((item) => item.id === 'news-active-a'))
  assert.ok(trimmed.some((item) => item.id === 'news-active-b'))
  assert.ok(trimmed.every((item, index) => index === 0 || item.startedAt >= trimmed[index - 1]!.startedAt))
})

test('l influence est progressive et disparaît sans changement instantané de cours', () => {
  const item = event()
  assert.equal(getNewsEnvelope(item, item.startedAt), 0)
  assert.ok(getNewsEnvelope(item, item.startedAt + TICK) > 0)
  assert.ok(getNewsEnvelope(item, item.startedAt + TICK) < 0.1)
  assert.equal(getNewsEnvelope(item, START + 180_000), 1)
  assert.ok(getNewsEnvelope(item, item.endsAt - TICK) > 0)
  assert.equal(getNewsEnvelope(item, item.endsAt), 0)
  assert.equal(getNewsPressure([item], item.endsAt).price.nvideo, undefined)
})

test('chevauchement, annulation partielle et saturation des effets globaux', () => {
  const good = event()
  const bad = event({ id: 'news-bad', templateId: 'earnings-miss', impact: -0.7 })
  const goodPressure = getNewsPressure([good], START)
  const combined = getNewsPressure([good, bad], START)
  assert.ok(goodPressure.price.nvideo! > combined.price.nvideo!)
  assert.ok(goodPressure.dividend.nvideo! > combined.dividend.nvideo!)
  assert.equal(combined.price.bitcoin, undefined)
  const macro = event({
    id: 'news-macro', templateId: 'macro-liquidity',
    affectedAssetIds: ASSETS.map((asset) => asset.id), impact: -1,
  })
  const multiple = getNewsPressure(Array.from({ length: 30 }, (_, i) => ({ ...macro, id: 'news-macro-' + i })), START)
  assert.equal(Object.keys(multiple.price).length, 45)
  assert.equal(multiple.price.bitcoin, -1.25)
  assert.equal(multiple.dividend.nvideo, -1.25)
  assert.equal(multiple.dividend.bitcoin, undefined)
})

test('rumeur : démenti choisi une seule fois et conservé par les sauvegardes', () => {
  const picks = [0.94, 0.5, 0.9, 0.6, 0.4, 0.4]
  let i = 0
  const initial = advanceNewsTick([], START + TICK, START, START + TICK, () => picks[i++] ?? 0.4)
  assert.equal(initial.news.length, 1)
  const rumor = initial.news[0]!
  assert.equal(rumor.templateId, 'rumor-crypto-ban')
  assert.equal(rumor.phase, 'rumor')
  assert.equal(rumor.resolution, 'denied')
  assert.ok(rumor.resolutionAt! > rumor.startedAt && rumor.resolutionAt! < rumor.endsAt)
  const resolved = advanceNewsTick(initial.news, rumor.endsAt + HOUR, rumor.resolutionAt! - TICK, rumor.resolutionAt!, () => 0.3)
  assert.equal(resolved.news[0]?.phase, 'denied')
  const before = getNewsPressure([rumor], rumor.resolutionAt! + TICK).price.bitcoin!
  const after = getNewsPressure(resolved.news, rumor.resolutionAt! + TICK).price.bitcoin!
  assert.ok(before < 0 && after > 0)
  const state = createInitialTradingState(START, 42)
  state.news = resolved.news
  state.nextNewsAt = resolved.nextNewsAt
  const restored = restoreTradingState(JSON.parse(JSON.stringify(state)), START)
  assert.deepEqual(restored.news, resolved.news)
  assert.equal(restored.nextNewsAt, resolved.nextNewsAt)
})

test('presentation : titres contextualisés et liens vers actifs impactés', () => {
  const item = event({ templateId: 'chip-breakthrough' })
  const presented = getNewsPresentation(item)
  assert.ok(presented)
  assert.ok(presented.headline.includes('Nvideo'))
  assert.equal(presented.affectedAssets[0]?.id, 'nvideo')
  const sector = getNewsPresentation(event({ templateId: 'sector-costs' }))
  assert.ok(sector?.headline.includes('Semi-conducteurs'))
  assert.equal(getNewsPresentation(event({ templateId: 'unknown' })), null)
})

test('une News influe réellement sur les 45 prix sans modifier immédiatement les dividendes', () => {
  const baseline = createInitialTradingState(START, 1093)
  baseline.nextNewsAt = START + HOUR
  const macro = event({
    id: 'news-broad', templateId: 'macro-liquidity',
    startedAt: START - 120_000, endsAt: START + 480_000,
    affectedAssetIds: ASSETS.map((asset) => asset.id), impact: -1,
  })
  const affected = { ...baseline, news: [macro] }
  const quiet = advanceMarketTick(baseline)
  const loud = advanceMarketTick(affected)
  let lower = 0
  for (const asset of ASSETS) {
    if (loud.quotes[asset.id]!.price < quiet.quotes[asset.id]!.price) lower++
    assert.equal(loud.quotes[asset.id]!.dividendYield, quiet.quotes[asset.id]!.dividendYield)
    assert.ok(loud.quotes[asset.id]!.price >= asset.minPrice)
  }
  assert.ok(lower >= 35, 'une nouvelle globale doit réellement influer sur les tendances')
})

test('24 h hors ligne : News, prix et PRNG identiques à un rattrapage découpé', () => {
  const initial = createInitialTradingState(START, 500)
  const target = START + 24 * HOUR
  let replay = initial
  for (let tick = 0; tick < 24 * HOUR / TICK; tick++) replay = advanceMarketTick(replay)
  let catchup = initial
  while (catchup.lastTickAt < target) {
    const next = catchUpMarket(catchup, target, MAX_CATCH_UP_TICKS)
    assert.ok(next.processedTicks > 0)
    catchup = next.state
  }
  assert.equal(catchup.seed, replay.seed)
  assert.equal(catchup.nextNewsAt, replay.nextNewsAt)
  assert.deepEqual(catchup.news, replay.news)
  assert.deepEqual(catchup.quotes, replay.quotes)
  assert.deepEqual(catchup.history, replay.history)
  assert.ok(catchup.news.filter((item) => item.endsAt <= target).length <= 10)
  assert.ok(catchup.news.length <= 26)
})

test('reprise après sauvegarde en milieu de rattrapage : aucune nouvelle en double', () => {
  const now = START + 4 * HOUR
  let state = createInitialTradingState(START, 567)
  for (let i = 0; i < 380; i++) state = advanceMarketTick(state)
  const persisted = restoreTradingState(JSON.parse(JSON.stringify(state)), now)
  let a = state
  let b = persisted
  while (a.lastTickAt < now) {
    a = catchUpMarket(a, now).state
    b = catchUpMarket(b, now).state
  }
  assert.deepEqual(a, b)
  assert.equal(new Set(a.news.map((item) => item.id)).size, a.news.length)
})
