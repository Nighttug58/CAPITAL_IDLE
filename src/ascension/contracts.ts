/**
 * CAPITAL_IDLE — Prestige économique (à ne pas confondre avec src/prestige/ Fame).
 *
 * Passe 1 : contrats et calibrage purs, AUCUN effet sur CapitalState ni runtime.
 * Les transitions de cycle, la migration v7 et la boutique seront développées
 * dans les passes suivantes. Les montants sont des dollars fictifs du jeu.
 */
export const ASCENSION_MIN_LEVEL = 100 as const
export const ASCENSION_MIN_WORTH_USD = 100_000_000 as const
export const ASCENSION_POINT_BASE = 20 as const
export const ASCENSION_SHOP_EXPECTED_LEVELS = 87 as const
export const ASCENSION_SHOP_EXPECTED_TOTAL_PP = 1_637 as const

export const ASCENSION_UPGRADE_IDS = [
  'auto-click', 'auto-investor', 'auto-trader', 'auto-enterprise',
  'news-duration', 'news-impact', 'news-frequency', 'news-preview',
  'news-propagation', 'volatility-radar', 'automatic-orders',
  'market-frenzy', 'time-accelerator', 'market-liquidity',
  'liquidity-recovery', 'crypto-staking', 'staking-yield',
  'auto-compound',
] as const
export type AscensionUpgradeId = typeof ASCENSION_UPGRADE_IDS[number]
export type AscensionSpeed = 1 | 1.5 | 2 | 3 | 4 | 5

/** Contrat v7 envisagé : seule autorité persistante de la monnaie PP. */
export interface AscensionProgress {
  readonly availablePoints: number
  readonly lifetimePoints: number
  readonly prestigeCount: number
  readonly upgradeLevels: Readonly<Record<AscensionUpgradeId, number>>
  /** Record global, jamais abaissé lors du retour au niveau 1. */
  readonly highestFameAwardedLevel: number
  readonly history: readonly AscensionCycleSummary[]
}

export interface AscensionCycleSummary {
  readonly cycle: number
  readonly completedAtRealMs: number
  readonly eligibleWorthCents: number
  readonly earnedPoints: number
  readonly levelAtCompletion: number
}

/** Config de bots propre au cycle : ne survit pas à une réinitialisation. */
export interface AscensionAutomationSettings {
  readonly autoClickEnabled: boolean
  readonly investorEnabled: boolean
  readonly traderEnabled: boolean
  readonly enterpriseEnabled: boolean
  readonly allowedAssetIds: readonly string[]
  readonly maxOrderCents: number
  readonly cashReserveCents: number
}

/**
 * L'horloge de marché est virtuelle. realAnchorMs est un timestamp civil.
 * Les news, impôts, dividendes, staking et cooldowns restent en temps réel.
 */
export interface AscensionMarketClock {
  readonly simulatedAtMs: number
  readonly realAnchorMs: number
  readonly selectedSpeed: AscensionSpeed
}

export interface AscensionRunState {
  readonly startedAtRealMs: number
  readonly marketClock: AscensionMarketClock
  readonly automation: AscensionAutomationSettings
  /** Les ordres/stakes/liquidités appartiendront au cycle, pas aux points PP. */
}

export interface AscensionSaveSection {
  readonly progress: AscensionProgress
  readonly run: AscensionRunState
}

/**
 * Assiette du Prestige : patrimoine Stats MOINS valeur comptable des objets
 * permanents. Aucun objet conservé ne doit rapporter des PP au cycle suivant.
 * Le moteur de la passe 2 utilisera l'état économique rattrapé et validé.
 */
export function eligiblePrestigeWorthFromOverview(
  overview: Readonly<{ netWorth: number; collectionBookValue: number }>,
): number | null {
  if (!Number.isFinite(overview.netWorth) ||
      !Number.isFinite(overview.collectionBookValue) ||
      overview.collectionBookValue < 0) return null
  const cents = Math.round((overview.netWorth - overview.collectionBookValue) * 100)
  return Number.isSafeInteger(cents) ? cents / 100 : null
}

/**
 * Projection pure seulement : PAS de crédit de PP ni de reset en passe 1.
 * Formule validée : floor(20 * sqrt(patrimoine éligible / 100 M$)).
 */
export function previewPrestigePoints(eligibleWorthUsd: number, playerLevel: number): number {
  if (!Number.isSafeInteger(playerLevel) || playerLevel < ASCENSION_MIN_LEVEL ||
      !Number.isFinite(eligibleWorthUsd) || eligibleWorthUsd < ASCENSION_MIN_WORTH_USD ||
      !Number.isSafeInteger(Math.round(eligibleWorthUsd * 100))) return 0
  return Math.floor(ASCENSION_POINT_BASE * Math.sqrt(eligibleWorthUsd / ASCENSION_MIN_WORTH_USD))
}
