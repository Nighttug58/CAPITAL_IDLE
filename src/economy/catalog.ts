import { MAX_ENTERPRISE_LEVEL } from './state.ts'

/**
 * Catalogue économique fictif et IMMUTABLE.
 * Indépendant du Trading, des News, de l'horloge et du solde du joueur.
 *
 * Devises : coûts en CENTIMES entiers de $, recettes en MICRODOLLARS entiers
 * par seconde (1 $ = 1 000 000 microdollars). Cela permet d'accumuler les
 * fractions de centime en passe 3 sans arrondir un revenu à zéro.
 */
export type EnterpriseCategory = 'small' | 'local' | 'services' | 'industry' | 'major'

export interface EnterpriseMilestone {
  readonly level: 5 | 10 | 15 | 20
  readonly name: string
  readonly bonusBps: number // BONUS additionnel au +12 % du niveau normal.
}

export interface EnterpriseDefinition {
  readonly id: string
  readonly name: string
  readonly category: EnterpriseCategory
  readonly requiredPlayerLevel: number
  readonly purchaseCostCents: number
  readonly baseIncomeMicrosPerSecond: number
  readonly targetPaybackHours: number
  readonly upgradeCostsCents: readonly number[] // indices 0..18 => niveaux 2..20
  readonly incomesMicrosPerSecond: readonly number[] // indices 0..19 => niveaux 1..20
}

interface EnterpriseRow {
  readonly id: string
  readonly name: string
  readonly category: EnterpriseCategory
  readonly requiredPlayerLevel: number
  readonly priceDollars: number
  readonly targetPaybackHours: number
}

/** Progression simple, sans franchise ni prestige après le niveau 20. */
const REGULAR_INCOME_INCREASE_BPS = 1_200 // +12 % / niveau.
const UPGRADE_BASE_COST_BPS = 2_000       // première amélioration = 20 % de l'achat.
const UPGRADE_COST_GROWTH_BPS = 1_800     // puis +18 % / niveau suivant.
const BASIS_POINTS = 10_000
const MICROS_PER_DOLLAR = 1_000_000
const CENTS_PER_DOLLAR = 100

export const ENTERPRISE_MILESTONES: readonly EnterpriseMilestone[] = Object.freeze([
  Object.freeze({ level: 5, name: 'Expansion', bonusBps: 2_000 }),          // +20 %
  Object.freeze({ level: 10, name: 'Automatisation', bonusBps: 2_500 }),   // +25 %
  Object.freeze({ level: 15, name: 'Modernisation', bonusBps: 3_000 }),    // +30 %
  Object.freeze({ level: 20, name: 'Prestige', bonusBps: 4_000 }),         // +40 %
])

const milestoneByLevel = new Map<number, EnterpriseMilestone>(
  ENTERPRISE_MILESTONES.map((milestone) => [milestone.level, milestone] as const),
)

/**
 * Prix indicatifs en dollars pour l'acquisition/constitution d'entreprises réelles,
 * du microcommerce au groupe multinational (ordre de grandeur, taille spécifiée
 * par la documentation). Sources et hypothèses : ENTREPRISES_ECONOMIE.md.
 * Les revenus restent volontairement accélérés pour le gameplay : retour brut
 * d'environ 8 à 64 heures réelles, pas un rendement financier IRL.
 * Les investissements des entreprises déjà achetées ne sont pas réécrits.
 */
const rows: readonly EnterpriseRow[] = [
  { id: 'kiosque', name: 'Kiosque', category: 'small', requiredPlayerLevel: 3, priceDollars: 75_000, targetPaybackHours: 8 },
  { id: 'cafe', name: 'Café', category: 'small', requiredPlayerLevel: 5, priceDollars: 180_000, targetPaybackHours: 9 },
  { id: 'laverie', name: 'Laverie automatique', category: 'small', requiredPlayerLevel: 7, priceDollars: 300_000, targetPaybackHours: 10 },
  { id: 'boulangerie', name: 'Boulangerie', category: 'small', requiredPlayerLevel: 9, priceDollars: 420_000, targetPaybackHours: 11 },
  { id: 'superette', name: 'Supérette', category: 'local', requiredPlayerLevel: 12, priceDollars: 600_000, targetPaybackHours: 12 },
  { id: 'restaurant', name: 'Restaurant', category: 'local', requiredPlayerLevel: 14, priceDollars: 800_000, targetPaybackHours: 13 },
  { id: 'station-lavage', name: 'Station de lavage', category: 'local', requiredPlayerLevel: 16, priceDollars: 1_200_000, targetPaybackHours: 14 },
  { id: 'garage', name: 'Garage automobile', category: 'local', requiredPlayerLevel: 18, priceDollars: 1_800_000, targetPaybackHours: 15 },
  { id: 'salle-sport', name: 'Salle de sport', category: 'services', requiredPlayerLevel: 21, priceDollars: 2_500_000, targetPaybackHours: 16 },
  { id: 'cinema', name: 'Cinéma', category: 'services', requiredPlayerLevel: 23, priceDollars: 8_000_000, targetPaybackHours: 18 },
  { id: 'hotel', name: 'Hôtel', category: 'services', requiredPlayerLevel: 25, priceDollars: 16_000_000, targetPaybackHours: 20 },
  { id: 'concession', name: 'Concession automobile', category: 'services', requiredPlayerLevel: 27, priceDollars: 35_000_000, targetPaybackHours: 22 },
  { id: 'entrepot', name: 'Entrepôt logistique', category: 'industry', requiredPlayerLevel: 30, priceDollars: 80_000_000, targetPaybackHours: 24 },
  { id: 'usine', name: 'Usine de production', category: 'industry', requiredPlayerLevel: 32, priceDollars: 220_000_000, targetPaybackHours: 27 },
  { id: 'centre-commercial', name: 'Centre commercial', category: 'industry', requiredPlayerLevel: 34, priceDollars: 500_000_000, targetPaybackHours: 30 },
  { id: 'laboratoire', name: 'Laboratoire', category: 'industry', requiredPlayerLevel: 36, priceDollars: 1_200_000_000, targetPaybackHours: 34 },
  { id: 'data-center', name: 'Data center', category: 'major', requiredPlayerLevel: 40, priceDollars: 3_000_000_000, targetPaybackHours: 39 },
  { id: 'compagnie-aerienne', name: 'Compagnie aérienne', category: 'major', requiredPlayerLevel: 43, priceDollars: 20_000_000_000, targetPaybackHours: 45 },
  { id: 'groupe-energetique', name: 'Entreprise énergétique', category: 'major', requiredPlayerLevel: 46, priceDollars: 85_000_000_000, targetPaybackHours: 54 },
  { id: 'groupe-technologique', name: 'Groupe technologique', category: 'major', requiredPlayerLevel: 50, priceDollars: 300_000_000_000, targetPaybackHours: 64 },
]

export const ENTERPRISE_CATEGORIES: Readonly<Record<EnterpriseCategory, string>> = Object.freeze({
  small: 'Petits commerces',
  local: 'Commerces locaux',
  services: 'Services',
  industry: 'Industrie',
  major: 'Grandes entreprises',
})

function buildDefinition(row: EnterpriseRow): EnterpriseDefinition {
  const purchaseCostCents = row.priceDollars * CENTS_PER_DOLLAR
  const baseIncomeMicrosPerSecond = Math.round(
    row.priceDollars * MICROS_PER_DOLLAR / (row.targetPaybackHours * 60 * 60),
  )
  const upgradeCostsCents: number[] = []
  const incomesMicrosPerSecond: number[] = [baseIncomeMicrosPerSecond]

  for (let targetLevel = 2; targetLevel <= MAX_ENTERPRISE_LEVEL; targetLevel++) {
    const upgradeCost = Math.round(
      purchaseCostCents * (UPGRADE_BASE_COST_BPS / BASIS_POINTS) *
      (1 + UPGRADE_COST_GROWTH_BPS / BASIS_POINTS) ** (targetLevel - 2),
    )
    upgradeCostsCents.push(upgradeCost)

    const bonusBps = milestoneByLevel.get(targetLevel)?.bonusBps ?? 0
    const previousIncome = incomesMicrosPerSecond[incomesMicrosPerSecond.length - 1]!
    const nextIncome = Math.round(
      previousIncome * (1 + REGULAR_INCOME_INCREASE_BPS / BASIS_POINTS) *
      (1 + bonusBps / BASIS_POINTS),
    )
    incomesMicrosPerSecond.push(nextIncome)
  }

  return Object.freeze({
    id: row.id,
    name: row.name,
    category: row.category,
    requiredPlayerLevel: row.requiredPlayerLevel,
    purchaseCostCents,
    baseIncomeMicrosPerSecond,
    targetPaybackHours: row.targetPaybackHours,
    upgradeCostsCents: Object.freeze(upgradeCostsCents),
    incomesMicrosPerSecond: Object.freeze(incomesMicrosPerSecond),
  })
}

export const ENTERPRISES: readonly EnterpriseDefinition[] = Object.freeze(rows.map(buildDefinition))
const enterprisesById = new Map<string, EnterpriseDefinition>(ENTERPRISES.map((enterprise) => [enterprise.id, enterprise] as const))

export function getEnterprise(id: string): EnterpriseDefinition | undefined {
  return enterprisesById.get(id)
}

export function isEnterpriseUnlocked(id: string, playerLevel: number): boolean {
  const enterprise = getEnterprise(id)
  return enterprise !== undefined && Number.isSafeInteger(playerLevel) &&
    playerLevel >= enterprise.requiredPlayerLevel
}

export function getEnterprisePurchaseCostCents(id: string): number | null {
  return getEnterprise(id)?.purchaseCostCents ?? null
}

/** L'argument est le niveau ACTUEL possédé. Au niveau 20 : null. */
export function getEnterpriseUpgradeCostCents(id: string, currentLevel: number): number | null {
  const enterprise = getEnterprise(id)
  if (!enterprise || !Number.isSafeInteger(currentLevel) || currentLevel < 1 ||
    currentLevel >= MAX_ENTERPRISE_LEVEL) return null
  return enterprise.upgradeCostsCents[currentLevel - 1] ?? null
}

/** Revenu fixe au niveau possédé, en microdollars / seconde. */
export function getEnterpriseIncomeMicrosPerSecond(id: string, ownedLevel: number): number | null {
  const enterprise = getEnterprise(id)
  if (!enterprise || !Number.isSafeInteger(ownedLevel) || ownedLevel < 1 ||
    ownedLevel > MAX_ENTERPRISE_LEVEL) return null
  return enterprise.incomesMicrosPerSecond[ownedLevel - 1] ?? null
}

export function getEnterpriseMilestone(level: number): EnterpriseMilestone | null {
  return milestoneByLevel.get(level) ?? null
}
