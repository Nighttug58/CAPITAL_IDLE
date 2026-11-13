// Contrats métier : un seul portefeuille monétaire dans GameState, aucun solde parallèle.
export type AssetKind = 'stock' | 'crypto' | 'memecoin'

export interface AssetDefinition {
  readonly id: string
  readonly symbol: string
  readonly name: string
  readonly kind: AssetKind
  readonly referencePrice: number
  readonly minPrice: number
  readonly maxPrice: number
  readonly totalSupply: number
  readonly initialDividendYield: number | null
}

export interface MarketQuote {
  price: number
  momentum: number
  dividendYield: number | null
  updatedAt: number
}

export interface PriceSample {
  at: number
  price: number
}

// Le coût total d'acquisition inclut les frais et diminue proportionnellement aux ventes.
export interface Position {
  quantity: number
  costBasis: number
}

export type NewsPhase = 'rumor' | 'active' | 'confirmed' | 'denied'

export interface MarketNews {
  id: string
  templateId: string
  startedAt: number
  endsAt: number
  affectedAssetIds: string[]
  impact: number
  phase: NewsPhase
}

export interface TradingState {
  schemaVersion: 1
  seed: number
  lastTickAt: number
  nextNewsAt: number | null
  quotes: Record<string, MarketQuote>
  history: Record<string, PriceSample[]>
  positions: Record<string, Position>
  news: MarketNews[]
  realizedNetProfit: number
  dividendCarry: number
}
