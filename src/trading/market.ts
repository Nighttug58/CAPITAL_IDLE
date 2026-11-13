import { ASSETS, createInitialQuotes } from './catalog.ts'
import { advanceNewsTick, getNewsPressure } from './news.ts'
import type { AssetDefinition, MarketQuote, PriceSample, TradingState } from './types.ts'

export const MARKET_TICK_MS = 5_000
export const MARKET_HISTORY_MS = 60 * 60_000
export const MARKET_MAX_SAMPLES = MARKET_HISTORY_MS / MARKET_TICK_MS

type Regime = NonNullable<MarketQuote['regime']>

interface RiskProfile {
  noise: number
  drift: number
  shockProbability: number
  shockMin: number
  shockMax: number
}

// Volatilité intentionnellement arcade. Les chocs exceptionnels sont répartis
// sur plusieurs ticks plutôt qu'appliqués instantanément en une seule bougie.
const PROFILES: Readonly<Record<AssetDefinition['kind'], RiskProfile>> = {
  stock: { noise: 0.006, drift: 0.0012, shockProbability: 0.00018, shockMin: 0.12, shockMax: 0.55 },
  crypto: { noise: 0.013, drift: 0.0026, shockProbability: 0.00035, shockMin: 0.28, shockMax: 1.1 },
  memecoin: { noise: 0.030, drift: 0.0048, shockProbability: 0.0008, shockMin: 0.55, shockMax: 1.8 },
}

const REGIMES = ['steady', 'bull', 'bear', 'frenzy'] as const satisfies readonly Regime[]

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

function createRandom(seed: number) {
  // xorshift32 : le seul état aléatoire est la graine persistée.
  let value = seed >>> 0 || 1
  return {
    next(): number {
      value ^= value << 13
      value ^= value >>> 17
      value ^= value << 5
      value >>>= 0
      return value / 0x1_0000_0000
    },
    seed: () => value,
  }
}

function signed(random: { next: () => number }): number {
  return random.next() * 2 - 1
}

function assetVariation(asset: AssetDefinition): number {
  // Petite différence stable entre entreprises du même groupe, sans donnée
  // additionnelle à sauvegarder ou hasard dépendant du processus.
  let hash = 2166136261
  for (let i = 0; i < asset.id.length; i++) {
    hash = Math.imul(hash ^ asset.id.charCodeAt(i), 16777619)
  }
  return 0.82 + (hash >>> 0) % 45 / 100
}

function chooseRegime(random: { next: () => number }): Regime {
  const roll = random.next()
  if (roll < 0.26) return REGIMES[1]
  if (roll < 0.52) return REGIMES[2]
  if (roll < 0.70) return REGIMES[3]
  return REGIMES[0]
}

function updateQuote(
  asset: AssetDefinition,
  current: MarketQuote,
  at: number,
  sharedNoise: number,
  newsPressure: number,
  random: { next: () => number },
): MarketQuote {
  const profile = PROFILES[asset.kind]
  const variation = assetVariation(asset)

  let regime = current.regime ?? 'steady'
  let regimeTicksLeft = current.regimeTicksLeft ?? 0
  if (regimeTicksLeft <= 0) {
    regime = chooseRegime(random)
    regimeTicksLeft = regime === 'frenzy'
      ? 10 + Math.floor(random.next() * 31)
      : 24 + Math.floor(random.next() * 91)
  }
  regimeTicksLeft--

  let shockTicksLeft = current.shockTicksLeft ?? 0
  let shockDrift = current.shockDrift ?? 0
  if (shockTicksLeft <= 0 && random.next() < profile.shockProbability) {
    shockTicksLeft = 10 + Math.floor(random.next() * 31)
    const magnitude = profile.shockMin + random.next() * (profile.shockMax - profile.shockMin)
    shockDrift = (random.next() < 0.5 ? -1 : 1) * magnitude / shockTicksLeft
  }

  const regimeDirection = regime === 'bull' ? 1 : regime === 'bear' ? -1 : 0
  const regimeNoise = regime === 'frenzy' ? 2.2 : regime === 'steady' ? 0.7 : 1
  const noise = (signed(random) + sharedNoise * 0.45) * profile.noise * variation * regimeNoise
  const momentum = clamp(current.momentum, -0.08, 0.08)
  const newsMove = newsPressure * profile.noise * 0.62
  let logMove = noise + regimeDirection * profile.drift * variation + momentum * 0.20 + newsMove
  if (shockTicksLeft > 0) {
    logMove += shockDrift
    shockTicksLeft--
    if (shockTicksLeft === 0) shockDrift = 0
  }

  // Compression douce près des planchers/plafonds : aucune remontée forcée,
  // aucune inversion artificielle lors d'un crash. Le cours peut stagner.
  const upperRoom = Math.log(asset.maxPrice / current.price)
  const lowerRoom = Math.log(current.price / asset.minPrice)
  if (logMove > 0) logMove *= clamp(upperRoom / 0.28, 0, 1)
  if (logMove < 0) logMove *= clamp(lowerRoom / 0.28, 0, 1)

  const price = clamp(current.price * Math.exp(clamp(logMove, -0.25, 0.25)), asset.minPrice, asset.maxPrice)
  const actualMove = Math.log(price / current.price)

  return {
    price,
    momentum: clamp(momentum * 0.72 + actualMove * 0.28, -0.08, 0.08),
    dividendYield: current.dividendYield, // La courbe indépendante viendra en passe 7.
    updatedAt: at,
    regime,
    regimeTicksLeft,
    shockDrift,
    shockTicksLeft,
  }
}

function appendSample(
  previous: readonly PriceSample[] | undefined,
  previousTime: number,
  previousPrice: number,
  now: number,
  price: number,
): PriceSample[] {
  const old = previous ?? []
  const cutoff = now - MARKET_HISTORY_MS
  let start = 0
  while (start < old.length && old[start]!.at <= cutoff) start++
  const result = old.slice(start)
  // Garde le point de départ lors du premier tick, s'il est dans la fenêtre.
  if (result.length === 0 && old.length === 0 && previousTime > cutoff) {
    result.push({ at: previousTime, price: previousPrice })
  }
  if (result.length > 0 && result[result.length - 1]!.at >= now) return result.slice(-MARKET_MAX_SAMPLES)
  result.push({ at: now, price })
  return result.length <= MARKET_MAX_SAMPLES ? result : result.slice(-MARKET_MAX_SAMPLES)
}

// Un pas pur et reproductible, sans timer, réseau, Date.now() ni Math.random().
// La passe 4 appellera cette fonction pour le rattrapage des périodes fermées.
export function advanceMarketTick(state: TradingState, recordHistory = true): TradingState {
  const at = state.lastTickAt + MARKET_TICK_MS
  if (!Number.isSafeInteger(at)) return state

  const random = createRandom(state.seed)
  const sharedNoise = signed(random)
  const events = advanceNewsTick(state.news, state.nextNewsAt, state.lastTickAt, at, () => random.next())
  const pressure = getNewsPressure(events.news, at)
  const currentQuotes = Object.keys(state.quotes).length === 0
    ? createInitialQuotes(state.lastTickAt)
    : state.quotes

  const quotes: Record<string, MarketQuote> = {}
  const history: Record<string, PriceSample[]> = {}
  for (const asset of ASSETS) {
    const current = currentQuotes[asset.id] ?? {
      price: asset.referencePrice,
      momentum: 0,
      dividendYield: asset.initialDividendYield,
      updatedAt: state.lastTickAt,
    }
    const quote = updateQuote(asset, current, at, sharedNoise, pressure.price[asset.id] ?? 0, random)
    quotes[asset.id] = quote
    if (recordHistory) {
      history[asset.id] = appendSample(state.history[asset.id], state.lastTickAt, current.price, at, quote.price)
    }
  }

  return {
    ...state,
    lastTickAt: at,
    seed: random.seed(),
    quotes,
    history,
    news: events.news,
    nextNewsAt: events.nextNewsAt,
  }
}

// La liste doit dessiner peu de points sans masquer un pump/crash :
// min/max par groupe, gardés dans leur ordre temporel.
export function getSparklineSamples(
  samples: readonly PriceSample[],
  maxPoints = 40,
): PriceSample[] {
  const limit = Number.isFinite(maxPoints) ? Math.max(2, Math.floor(maxPoints)) : 40
  if (samples.length <= limit) return samples.slice()
  const bucketCount = Math.floor((limit - 2) / 2)
  if (bucketCount === 0) return [samples[0]!, samples[samples.length - 1]!]

  const result: PriceSample[] = [samples[0]!]
  const inner = samples.length - 2
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const first = 1 + Math.floor(bucket * inner / bucketCount)
    const last = 1 + Math.floor((bucket + 1) * inner / bucketCount)
    if (first >= last) continue
    let min = first
    let max = first
    for (let index = first + 1; index < last; index++) {
      if (samples[index]!.price < samples[min]!.price) min = index
      if (samples[index]!.price > samples[max]!.price) max = index
    }
    result.push(samples[Math.min(min, max)]!)
    if (min !== max) result.push(samples[Math.max(min, max)]!)
  }
  result.push(samples[samples.length - 1]!)
  return result
}
