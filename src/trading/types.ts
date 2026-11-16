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

/** Real-time market floor/ceiling event. The price cannot move during the hold. */
export interface MarketBoundaryState {
  readonly side: 'min' | 'max'
  readonly touchedAtRealMs: number
  readonly holdUntilRealMs: number
  readonly reboundUntilRealMs: number
  readonly reboundTargetPrice: number
}

export interface MarketQuote {
  price: number
  momentum: number
  dividendYield: number | null
  dividendMomentum?: number
  updatedAt: number
  // Facultatif pour restaurer les cotations v4 préexistantes (passe 1).
  regime?: MarketRegime
  regimeTicksLeft?: number
  shockDrift?: number
  shockTicksLeft?: number
  boundary?: MarketBoundaryState
}

export interface PriceSample {
  at: number
  price: number
  // Rendement propre à l'action, pour afficher une seconde courbe historique.
  // Facultatif : les sauvegardes v4 antérieures n'avaient pas cet historique.
  dividendYield?: number
}

// Le coût total d'acquisition inclut les frais et diminue proportionnellement aux ventes.
export interface Position {
  quantity: number
  costBasis: number
}

/** Staking locks a subset of the existing Trading position, never a second wallet. */
export interface StakingEntry {
  locked: number
  unlocking: number
  unlockAt: number | null
  awaitingCompound: number
  /** Newly minted units still held (liquid + locked + unlocking). */
  rewardHeld: number
  rewardLocked: number
  rewardUnlocking: number
  carryUnits: number
  lifetimeRewards: number
}
export interface StakingState {
  lastAccruedAt: number
  positions: Record<string, StakingEntry>
}

export type NewsPhase = 'rumor' | 'active' | 'confirmed' | 'denied'

export interface MarketNews {
  manuallyEnded?: true
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
  staking?: StakingState
  news: MarketNews[]
  /** News already selected in the persisted PRNG stream, shown by Vision anticipée. */
  upcomingNews?: MarketNews
  realizedNetProfit: number
  // Gains déjà crédités : historique conservé, puis somme des ventes positives.
  creditedTradingProfit: number
  // Fraction d'un centime et montants différés en cas de plafond monétaire.
  dividendCarry: number
  dividendPendingCents: number
  dividendLastPaidAt: number
}
