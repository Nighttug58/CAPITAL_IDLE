import type { MarketNews, MarketQuote, Position, PriceSample, TradingState } from './types.ts'

const MAX_ASSETS = 45
const MAX_PRICE_SAMPLES = 720 // 1 heure à raison d'un tick toutes les 5 secondes
const MAX_NEWS_IN_SAVE = 64 // 10 expirées + actives (borne de sécurité)
const ID_PATTERN = /^[a-z0-9-]{1,48}$/
const MAX_MONEY = Number.MAX_SAFE_INTEGER

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_MONEY
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isAssetId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

function isMap<T>(value: unknown, validate: (item: unknown) => item is T): value is Record<string, T> {
  return isRecord(value) && Object.keys(value).length <= MAX_ASSETS &&
    Object.entries(value).every(([id, item]) => isAssetId(id) && validate(item))
}

function isQuote(value: unknown): value is MarketQuote {
  return isRecord(value) && isAmount(value.price) && value.price > 0 &&
    typeof value.momentum === 'number' && Number.isFinite(value.momentum) &&
    (value.dividendYield === null || (
      typeof value.dividendYield === 'number' && Number.isFinite(value.dividendYield) &&
      value.dividendYield >= 0.01 && value.dividendYield <= 0.30
    )) && isTimestamp(value.updatedAt)
}

function isHistory(value: unknown): value is PriceSample[] {
  if (!Array.isArray(value) || value.length > MAX_PRICE_SAMPLES) return false
  let previousTime = -1
  return value.every((point: unknown) => {
    if (!isRecord(point) || !isTimestamp(point.at) || !isAmount(point.price) || point.price <= 0 || point.at <= previousTime) return false
    previousTime = point.at
    return true
  })
}

function isPosition(value: unknown): value is Position {
  return isRecord(value) && isAmount(value.quantity) && value.quantity > 0 && isAmount(value.costBasis)
}

function isNews(value: unknown): value is MarketNews {
  return isRecord(value) && isAssetId(value.id) && isAssetId(value.templateId) &&
    isTimestamp(value.startedAt) && isTimestamp(value.endsAt) && value.endsAt > value.startedAt &&
    value.endsAt - value.startedAt <= 30 * 60 * 1000 &&
    Array.isArray(value.affectedAssetIds) && value.affectedAssetIds.length <= MAX_ASSETS &&
    value.affectedAssetIds.every(isAssetId) &&
    typeof value.impact === 'number' && Number.isFinite(value.impact) &&
    value.impact >= -1 && value.impact <= 1 &&
    ['rumor', 'active', 'confirmed', 'denied'].includes(value.phase as string)
}

export function createInitialTradingState(now = Date.now(), seed = Math.floor(Math.random() * 0xffffffff) + 1): TradingState {
  const timestamp = isTimestamp(now) ? now : 0
  return {
    schemaVersion: 1,
    seed: Number.isInteger(seed) && seed > 0 && seed <= 0xffffffff ? seed : 1,
    lastTickAt: timestamp,
    nextNewsAt: null,
    quotes: {},
    history: {},
    positions: {},
    news: [],
    realizedNetProfit: 0,
    dividendCarry: 0,
  }
}

// Validation à la frontière localStorage : conserver le clicker même si Trading est corrompu.
export function restoreTradingState(raw: unknown, now = Date.now()): TradingState {
  const fallback = () => createInitialTradingState(now)
  if (!isRecord(raw) || raw.schemaVersion !== 1 ||
    typeof raw.seed !== 'number' || !Number.isInteger(raw.seed) || raw.seed <= 0 || raw.seed > 0xffffffff ||
    !isTimestamp(raw.lastTickAt) ||
    !(raw.nextNewsAt === null || isTimestamp(raw.nextNewsAt)) ||
    !isMap(raw.quotes, isQuote) || !isMap(raw.history, isHistory) || !isMap(raw.positions, isPosition) ||
    !Array.isArray(raw.news) || raw.news.length > MAX_NEWS_IN_SAVE || !raw.news.every(isNews) ||
    typeof raw.realizedNetProfit !== 'number' || !Number.isFinite(raw.realizedNetProfit) ||
    Math.abs(raw.realizedNetProfit) > MAX_MONEY ||
    !isAmount(raw.dividendCarry) || raw.dividendCarry >= 1
  ) return fallback()

  return {
    schemaVersion: 1,
    seed: raw.seed,
    lastTickAt: raw.lastTickAt,
    nextNewsAt: raw.nextNewsAt,
    quotes: raw.quotes,
    history: raw.history,
    positions: raw.positions,
    news: raw.news,
    realizedNetProfit: raw.realizedNetProfit,
    dividendCarry: raw.dividendCarry,
  } as TradingState
}
