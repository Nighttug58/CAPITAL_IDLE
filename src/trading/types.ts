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
  readonly sector: string
  readonly inspiredBy: string | null
  readonly sourceTicker: string
  readonly priceSource: string
  readonly priceReferenceDate: string
  readonly referenceHighPrice: number
  readonly supplyBasis: 'fictional-issue' | 'protocol-cap' | 'launch-supply' | 'game-cap'
  readonly supplyNote: string
  readonly quantityDecimals: number
}

export type MarketRegime = 'steady' | 'bull' | 'bear' | 'frenzy'

export interface MarketQuote {
  price: number
  momentum: number
  dividendYield: number | null
  updatedAt: number
  // Facultatif pour restaurer les cotations v4 préexistantes (passe 1).
  regime?: MarketRegime
  regimeTicksLeft?: number
  shockDrift?: number
  shockTicksLeft?: number
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
  resolution?: 'confirmed' | 'denied'
  resolutionAt?: number
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
  // Plus haut cumul net atteint par les profits de ventes : protège les niveaux
  // contre un cycle perte -> récupération du même profit.
  creditedTradingProfit: number
  dividendCarry: number
}
