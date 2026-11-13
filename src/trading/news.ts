import { ASSETS, getAsset } from './catalog.ts'
import type { AssetDefinition, AssetKind, MarketNews } from './types.ts'
import { INNOVATION_STORIES } from './news-library/innovation.ts'
import { FINANCE_STORIES } from './news-library/finance.ts'
import { SCANDAL_STORIES } from './news-library/scandal.ts'
import { MACRO_STORIES } from './news-library/macro.ts'
import { CRYPTO_STORIES } from './news-library/crypto.ts'
import { HACK_STORIES } from './news-library/hacks.ts'
import { SOCIAL_STORIES } from './news-library/social.ts'
import { RUMOR_STORIES } from './news-library/rumors.ts'


const TICK_MS = 5_000
export const MIN_NEWS_INTERVAL_MS = 120_000
export const MAX_NEWS_INTERVAL_MS = 480_000
export const MIN_NEWS_DURATION_MS = 120_000
export const MAX_NEWS_DURATION_MS = 1_800_000
export const EXPIRED_NEWS_HISTORY = 10

export type NewsCategory = 'innovation' | 'results' | 'finance' | 'scandal' | 'macro' | 'adoption' | 'regulation' | 'hack' | 'social' | 'rumor'
type Target = 'single' | 'sector' | 'kind' | 'global'
export interface NewsTemplate {
  readonly id: string
  readonly headline: string
  readonly description: string
  readonly scenario: string
  readonly category: NewsCategory
  readonly kind: AssetKind | 'all'
  readonly target: Target
  readonly direction: 1 | -1
  readonly priceWeight: number
  readonly dividendWeight: number
  readonly rumored: boolean
}

// 26 textes originaux fictifs ; le catalogue de 300 est prévu pour la passe 9.
export const NEWS_TEMPLATES: readonly NewsTemplate[] = Object.freeze([
  { id: 'chip-breakthrough', headline: '{asset} dévoile une technologie prometteuse', description: 'Un prototype dépasse les attentes. La mise en production et les coûts industriels restent à préciser.', scenario: 'Le marché réévalue la croissance et les investissements nécessaires.', category: 'innovation', kind: 'stock', target: 'single', direction: 1, priceWeight: 1, dividendWeight: -0.2, rumored: false },
  { id: 'research-progress', headline: 'Une percée est annoncée chez {asset}', description: 'Les premières démonstrations sont encourageantes mais aucune adoption commerciale ne peut encore être garantie.', scenario: 'Optimisme provisoire sur les perspectives de revenus.', category: 'innovation', kind: 'stock', target: 'single', direction: 1, priceWeight: 0.85, dividendWeight: 0.2, rumored: false },
  { id: 'earnings-beat', headline: '{asset} relève ses prévisions annuelles', description: 'Les commandes et les marges ont dépassé les objectifs internes. Des dépenses supplémentaires restent envisageables.', scenario: 'Le cours et le rendement pourraient progresser graduellement.', category: 'results', kind: 'stock', target: 'single', direction: 1, priceWeight: 0.95, dividendWeight: 0.75, rumored: false },
  { id: 'earnings-miss', headline: '{asset} déçoit sur son activité', description: 'La croissance ralentit et les stocks augmentent. La direction prépare des mesures correctives.', scenario: 'Les investisseurs pourraient revoir les profits futurs à la baisse.', category: 'results', kind: 'stock', target: 'single', direction: -1, priceWeight: 0.9, dividendWeight: 0.7, rumored: false },
  { id: 'investment-spree', headline: '{asset} prépare un vaste plan industriel', description: 'Une part importante de la trésorerie sera réinvestie dans de nouvelles installations.', scenario: 'Le cours peut bénéficier des perspectives malgré une moindre priorité aux dividendes.', category: 'finance', kind: 'stock', target: 'single', direction: 1, priceWeight: 0.4, dividendWeight: -1, rumored: false },
  { id: 'cash-surplus', headline: '{asset} révèle une trésorerie supérieure aux attentes', description: 'Le conseil examine les possibilités de redistribution après plusieurs trimestres positifs.', scenario: 'Le rendement pourrait augmenter progressivement sans certitude sur le cours.', category: 'finance', kind: 'stock', target: 'single', direction: 1, priceWeight: 0.35, dividendWeight: 1, rumored: false },
  { id: 'product-recall', headline: '{asset} lance un rappel de produits', description: 'Des défauts potentiels poussent la société à suspendre temporairement plusieurs livraisons.', scenario: 'Les coûts de réparation pourraient peser sur les marges.', category: 'scandal', kind: 'stock', target: 'single', direction: -1, priceWeight: 1, dividendWeight: 0.75, rumored: false },
  { id: 'privacy-investigation', headline: '{asset} ciblé par une enquête réglementaire', description: 'Des autorités demandent des explications sur le traitement de données. Le groupe conteste toute faute.', scenario: 'Une sanction reste possible mais non confirmée.', category: 'scandal', kind: 'stock', target: 'single', direction: -1, priceWeight: 0.85, dividendWeight: 0.4, rumored: false },
  { id: 'sector-demand', headline: 'Les commandes affluent dans {sector}', description: 'Plusieurs acteurs signalent une accélération des commandes. Les livraisons devront suivre.', scenario: 'Plusieurs sociétés du même secteur peuvent évoluer ensemble.', category: 'results', kind: 'stock', target: 'sector', direction: 1, priceWeight: 0.7, dividendWeight: 0.5, rumored: false },
  { id: 'sector-costs', headline: 'Les marges de {sector} sous pression', description: 'Les prix de l’énergie et des intrants augmentent plus rapidement que les revenus.', scenario: 'Les bénéfices et les dividendes pourraient ralentir.', category: 'finance', kind: 'stock', target: 'sector', direction: -1, priceWeight: 0.8, dividendWeight: 0.7, rumored: false },
  { id: 'macro-liquidity', headline: 'Un resserrement de liquidités secoue les marchés', description: 'Les gestionnaires réduisent leur exposition aux actifs risqués. La nervosité se propage.', scenario: 'La baisse peut toucher actions et crypto sans garantie sur chaque titre.', category: 'macro', kind: 'all', target: 'global', direction: -1, priceWeight: 0.8, dividendWeight: 0.4, rumored: false },
  { id: 'macro-recovery', headline: 'Des indicateurs rassurent les investisseurs', description: 'Les tensions de financement se relâchent et certains capitaux reviennent vers les marchés.', scenario: 'Le sentiment général s’améliore sans éliminer les risques.', category: 'macro', kind: 'all', target: 'global', direction: 1, priceWeight: 0.7, dividendWeight: 0.3, rumored: false },
  { id: 'macro-inflation', headline: 'Surprise inflationniste : les prévisions sont révisées', description: 'Les données de prix dépassent les estimations et relancent les débats sur les taux.', scenario: 'La volatilité peut s’étendre à plusieurs classes d’actifs.', category: 'macro', kind: 'all', target: 'global', direction: -1, priceWeight: 0.7, dividendWeight: 0.2, rumored: false },
  { id: 'crypto-institution', headline: 'Un investisseur institutionnel étudie les cryptos', description: 'Une grande société de gestion envisage une exposition supplémentaire aux actifs numériques.', scenario: 'Les flux spéculatifs pourraient augmenter.', category: 'adoption', kind: 'crypto', target: 'kind', direction: 1, priceWeight: 0.8, dividendWeight: 0, rumored: false },
  { id: 'crypto-upgrade', headline: '{asset} annonce une évolution majeure de réseau', description: 'Une mise à niveau promet des transactions plus efficaces. Les tests opérationnels restent en cours.', scenario: 'Une adoption plus large est possible mais incertaine.', category: 'innovation', kind: 'crypto', target: 'single', direction: 1, priceWeight: 0.9, dividendWeight: 0, rumored: false },
  { id: 'crypto-regulation', headline: 'De nouvelles règles crypto inquiètent le secteur', description: 'Les autorités examinent de nouvelles obligations pour les échanges et les intermédiaires.', scenario: 'Le coût de conformité pourrait freiner la croissance.', category: 'regulation', kind: 'crypto', target: 'kind', direction: -1, priceWeight: 0.95, dividendWeight: 0, rumored: false },
  { id: 'crypto-exploit', headline: 'Transactions suspectes autour de {asset}', description: 'Les équipes vérifient une anomalie qui pourrait provenir d’un service tiers compromis.', scenario: 'Une enquête prolongée pourrait réduire la confiance.', category: 'hack', kind: 'crypto', target: 'single', direction: -1, priceWeight: 1, dividendWeight: 0, rumored: false },
  { id: 'crypto-whales', headline: 'Des portefeuilles majeurs transfèrent des cryptos', description: 'Des mouvements importants vers les plateformes suscitent des spéculations sur de futures ventes.', scenario: 'La pression vendeuse n’est pas garantie.', category: 'finance', kind: 'crypto', target: 'kind', direction: -1, priceWeight: 0.75, dividendWeight: 0, rumored: false },
  { id: 'meme-viral', headline: '{asset} devient viral sur les réseaux', description: 'Des milliers de messages et de vidéos alimentent la spéculation. La valeur intrinsèque reste inconnue.', scenario: 'Un pump violent peut être suivi d’un crash.', category: 'social', kind: 'memecoin', target: 'single', direction: 1, priceWeight: 1, dividendWeight: 0, rumored: false },
  { id: 'meme-celebrity', headline: 'Une célébrité évoquerait {asset}', description: 'Un message ambigu est interprété comme un soutien, mais aucun partenariat officiel n’est annoncé.', scenario: 'Une confirmation ou un démenti pourrait inverser la tendance.', category: 'social', kind: 'memecoin', target: 'single', direction: 1, priceWeight: 0.9, dividendWeight: 0, rumored: true },
  { id: 'meme-mania', headline: 'Nouvelle fièvre spéculative sur les memecoins', description: 'Les créateurs de contenu font grimper les volumes et encouragent les prises de risque.', scenario: 'Plusieurs tokens peuvent s’emballer simultanément.', category: 'social', kind: 'memecoin', target: 'kind', direction: 1, priceWeight: 0.85, dividendWeight: 0, rumored: false },
  { id: 'meme-selloff', headline: 'Les acheteurs désertent les memecoins', description: 'Des ventes rapides se succèdent. Les portefeuilles les plus récents accusent des pertes.', scenario: 'Des mouvements baissiers importants restent possibles.', category: 'social', kind: 'memecoin', target: 'kind', direction: -1, priceWeight: 0.9, dividendWeight: 0, rumored: false },
  { id: 'meme-insiders', headline: 'Les mouvements de {asset} inquiètent sa communauté', description: 'Plusieurs grandes adresses déplacent des tokens, ce qui relance des soupçons de concentration.', scenario: 'La volatilité peut devenir extrême.', category: 'scandal', kind: 'memecoin', target: 'single', direction: -1, priceWeight: 1, dividendWeight: 0, rumored: false },
  { id: 'rumor-acquisition', headline: 'Rumeur de rachat concernant {asset}', description: 'Des discussions non confirmées évoquent une offre industrielle inattendue.', scenario: 'Le mouvement pourrait changer de sens après confirmation ou démenti.', category: 'rumor', kind: 'stock', target: 'single', direction: 1, priceWeight: 1, dividendWeight: 0.2, rumored: true },
  { id: 'rumor-crypto-ban', headline: 'Une interdiction de cryptos serait à l’étude', description: 'Un document anonyme évoque un durcissement majeur, sans communication officielle.', scenario: 'Un démenti pourrait modifier la pression sur les prix.', category: 'rumor', kind: 'crypto', target: 'kind', direction: -1, priceWeight: 0.85, dividendWeight: 0, rumored: true },
  { id: 'rumor-meme-listing', headline: '{asset} serait bientôt coté sur une grande plateforme', description: 'Des captures d’écran invérifiables alimentent les spéculations sur une cotation imminente.', scenario: 'L’issue de la rumeur peut provoquer un retournement.', category: 'rumor', kind: 'memecoin', target: 'single', direction: 1, priceWeight: 1, dividendWeight: 0, rumored: true },
  ...INNOVATION_STORIES,
  ...FINANCE_STORIES,
  ...SCANDAL_STORIES,
  ...MACRO_STORIES,
  ...CRYPTO_STORIES,
  ...HACK_STORIES,
  ...SOCIAL_STORIES,
  ...RUMOR_STORIES,
])

const templateIndex = new Map(NEWS_TEMPLATES.map((entry) => [entry.id, entry]))
const universes: Readonly<Record<AssetKind | 'all', readonly AssetDefinition[]>> = {
  all: ASSETS,
  stock: ASSETS.filter((asset) => asset.kind === 'stock'),
  crypto: ASSETS.filter((asset) => asset.kind === 'crypto'),
  memecoin: ASSETS.filter((asset) => asset.kind === 'memecoin'),
}

export function getNewsTemplate(id: string): NewsTemplate | undefined {
  return templateIndex.get(id)
}

export function getNewsRemainingMs(event: MarketNews, now: number): number {
  return Math.max(0, event.endsAt - now)
}

export function getNewsPresentation(event: MarketNews) {
  const template = getNewsTemplate(event.templateId)
  if (!template) return null
  const first = getAsset(event.affectedAssetIds[0] ?? '')
  const interpolate = (value: string) => value
    .replaceAll('{asset}', first?.name ?? 'un actif')
    .replaceAll('{sector}', first?.sector ?? 'le secteur concerné')
  return {
    headline: interpolate(template.headline),
    description: interpolate(template.description),
    scenario: interpolate(template.scenario),
    category: template.category,
    affectedAssets: event.affectedAssetIds.map(getAsset).filter((asset): asset is AssetDefinition => asset !== undefined),
  }
}

function randomInt(next: () => number, first: number, last: number): number {
  return first + Math.floor(next() * (last - first + 1))
}
function chooseTargets(template: NewsTemplate, next: () => number): string[] {
  const assets = universes[template.kind]
  if (template.target === 'global') return ASSETS.map((asset) => asset.id)
  if (template.target === 'kind') return assets.map((asset) => asset.id)
  const selected = assets[Math.floor(next() * assets.length)]!
  if (template.target === 'single') return [selected.id]
  return assets.filter((asset) => asset.sector === selected.sector).map((asset) => asset.id)
}
function createEvent(at: number, next: () => number, news: readonly MarketNews[]): MarketNews {
  const recent = new Set(news.slice(-3).map((entry) => entry.templateId))
  const choices = NEWS_TEMPLATES.filter((entry) => !recent.has(entry.id))
  const template = choices[Math.floor(next() * choices.length)]!
  const duration = randomInt(next, 24, 360) * TICK_MS
  const resolution = template.rumored ? (next() < 0.65 ? 'confirmed' : 'denied') : undefined
  const resolutionAt = resolution ? at + Math.floor((duration * 0.60) / TICK_MS) * TICK_MS : undefined
  return {
    id: 'news-' + at.toString(36),
    templateId: template.id,
    startedAt: at,
    endsAt: at + duration,
    affectedAssetIds: chooseTargets(template, next),
    impact: template.direction * (0.45 + next() * 0.55),
    phase: template.rumored ? 'rumor' : 'active',
    ...(resolution ? { resolution, resolutionAt } : {}),
  }
}

export function trimNews(news: readonly MarketNews[], at: number): MarketNews[] {
  const active: MarketNews[] = []
  const expired: MarketNews[] = []
  for (const event of news) {
    if (event.endsAt > at) active.push(event)
    else expired.push(event)
  }
  return [...expired.slice(-EXPIRED_NEWS_HISTORY), ...active].sort((a, b) => a.startedAt - b.startedAt)
}

export function advanceNewsTick(
  news: readonly MarketNews[],
  nextNewsAt: number | null,
  lastTickAt: number,
  at: number,
  random: () => number,
): { news: MarketNews[]; nextNewsAt: number } {
  let scheduledAt = nextNewsAt ?? (lastTickAt + randomInt(random, 24, 96) * TICK_MS)
  const events = news.map((event) =>
    event.phase === 'rumor' && event.resolutionAt !== undefined && at >= event.resolutionAt
      ? { ...event, phase: event.resolution ?? 'confirmed' } : event)
  if (at >= scheduledAt) {
    events.push(createEvent(at, random, events))
    scheduledAt = at + randomInt(random, 24, 96) * TICK_MS
  }
  return { news: trimNews(events, at), nextNewsAt: scheduledAt }
}

export function getNewsEnvelope(event: MarketNews, at: number): number {
  if (at <= event.startedAt || at >= event.endsAt) return 0
  const ramp = Math.max(TICK_MS, (event.endsAt - event.startedAt) * 0.2)
  return Math.min(1, (at - event.startedAt) / ramp, (event.endsAt - at) / ramp)
}

export interface NewsPressure {
  readonly price: Readonly<Record<string, number>>
  readonly dividend: Readonly<Record<string, number>>
}
export function getNewsPressure(news: readonly MarketNews[], at: number): NewsPressure {
  const price: Record<string, number> = {}
  const dividend: Record<string, number> = {}
  for (const event of news) {
    const template = getNewsTemplate(event.templateId)
    if (!template) continue
    const envelope = getNewsEnvelope(event, at)
    if (envelope === 0) continue
    const factor = envelope * event.impact * (event.phase === 'denied' ? -0.65 : 1)
    for (const id of event.affectedAssetIds) {
      price[id] = (price[id] ?? 0) + factor * template.priceWeight
      if (getAsset(id)?.kind === 'stock') {
        dividend[id] = (dividend[id] ?? 0) + factor * template.dividendWeight
      }
    }
  }
  const limit = (value: number) => Math.max(-1.25, Math.min(1.25, value))
  for (const id of Object.keys(price)) price[id] = limit(price[id]!)
  for (const id of Object.keys(dividend)) dividend[id] = limit(dividend[id]!)
  return { price, dividend }
}
