import { ASCENSION_UPGRADES } from './catalog.ts'
import type { AscensionUpgradeId } from './contracts.ts'

export type AscensionCategory = 'automatisation' | 'news' | 'trading' | 'marches' | 'staking'

export interface AscensionUpgradePresentation {
  readonly id: AscensionUpgradeId
  readonly label: string
  readonly description: string
  readonly category: AscensionCategory
  readonly phase: 4 | 5 | 6
  readonly effect: string
}

/** Texte/UI uniquement ; la seule source des prix et niveaux reste catalog.ts. */
export const ASCENSION_PRESENTATION: readonly AscensionUpgradePresentation[] = Object.freeze([
  { id: 'auto-click', label: 'Auto Click', description: 'Un clic automatique par seconde et par niveau, jusqu’à 20/s.', category: 'automatisation', phase: 6, effect: '20 clics/s' },
  { id: 'auto-investor', label: 'Auto Investisseur', description: 'Achats automatiques selon une sélection d’actifs et un budget.', category: 'automatisation', phase: 6, effect: 'Achats programmables' },
  { id: 'auto-trader', label: 'Auto Trader', description: 'Ventes automatiques déclenchées selon tes règles.', category: 'automatisation', phase: 6, effect: 'Trading automatisé' },
  { id: 'auto-enterprise', label: 'Auto Entreprise', description: 'Réinvestit dans tes entreprises en respectant une réserve de cash.', category: 'automatisation', phase: 6, effect: 'Réinvestissement automatique' },
  { id: 'news-duration', label: 'Événements prolongés', description: '+25 % de durée des news par niveau, jusqu’à deux fois plus longtemps.', category: 'news', phase: 4, effect: 'Durée ×2' },
  { id: 'news-impact', label: 'Marché extrême', description: '+25 % de puissance des news, favorables ET défavorables.', category: 'news', phase: 4, effect: 'Puissance ×2' },
  { id: 'news-frequency', label: 'Fréquence médiatique', description: '+5 % de fréquence des news par niveau.', category: 'news', phase: 4, effect: '+50 % de fréquence' },
  { id: 'news-preview', label: 'Vision anticipée', description: 'Révèle les annonces futures jusqu’à 30 secondes en avance.', category: 'news', phase: 4, effect: 'Jusqu’à 30 s d’avance' },
  { id: 'news-propagation', label: 'Propagation médiatique', description: 'Une annonce ciblée peut affecter un deuxième actif.', category: 'news', phase: 4, effect: 'Deux actifs touchés' },
  { id: 'volatility-radar', label: 'Radar de volatilité', description: 'Classe les actifs selon leur volatilité réelle dans le jeu.', category: 'trading', phase: 4, effect: 'Radar des marchés' },
  { id: 'automatic-orders', label: 'Ordres automatiques', description: 'Débloque les ordres limites, Stop Loss et Take Profit.', category: 'trading', phase: 6, effect: 'Ordres avancés' },
  { id: 'market-frenzy', label: 'Frénésie boursière', description: 'Pouvoir actif : news +50 % pendant 60 s, avec recharge réelle.', category: 'news', phase: 4, effect: 'Pouvoir de marché' },
  { id: 'time-accelerator', label: 'Accélérateur temporel', description: 'Accélère les cours en temps simulé de ×1,5 à ×5.', category: 'marches', phase: 4, effect: 'Vitesse du marché ×5' },
  { id: 'market-liquidity', label: 'Liquidité institutionnelle', description: '+20 % de liquidité à la vente par niveau.', category: 'marches', phase: 4, effect: 'Liquidités ×3' },
  { id: 'liquidity-recovery', label: 'Régénération de liquidité', description: '+15 % de régénération de la liquidité à la vente par niveau.', category: 'marches', phase: 4, effect: 'Régénération ×2,5' },
  { id: 'crypto-staking', label: 'Staking crypto', description: 'Débloque le dépôt de coins pour recevoir des récompenses.', category: 'staking', phase: 5, effect: 'Staking débloqué' },
  { id: 'staking-yield', label: 'Rendement de staking', description: '+10 % de récompenses en coins par niveau.', category: 'staking', phase: 5, effect: 'Rendements ×2' },
  { id: 'auto-compound', label: 'Staking composé', description: 'Réinvestit automatiquement les récompenses de staking.', category: 'staking', phase: 5, effect: 'Capitalisation automatique' },
])
export const ASCENSION_CATEGORIES: readonly { id: AscensionCategory; label: string }[] = Object.freeze([
  { id: 'automatisation', label: 'Automatisation' },
  { id: 'news', label: 'Actualités de marché' },
  { id: 'trading', label: 'Outils de trading' },
  { id: 'marches', label: 'Temps et liquidités' },
  { id: 'staking', label: 'Staking crypto' },
])
const infoById = new Map(ASCENSION_PRESENTATION.map(row => [row.id, row]))
export function ascensionPresentation(id: AscensionUpgradeId): AscensionUpgradePresentation {
  const row = infoById.get(id)
  if (!row) throw new Error('Missing Prestige presentation for ' + id)
  return row
}
if (ASCENSION_UPGRADES.length !== ASCENSION_PRESENTATION.length ||
    ASCENSION_UPGRADES.some(row => !infoById.has(row.id))) {
  throw new Error('The Prestige presentation must cover all catalog upgrades.')
}
