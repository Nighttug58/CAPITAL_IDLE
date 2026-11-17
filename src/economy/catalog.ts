
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
  readonly level: number
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
}

interface EnterpriseRow {
  readonly id: string
  readonly name: string
  readonly category: EnterpriseCategory
  readonly requiredPlayerLevel: number
  readonly priceDollars: number
  readonly targetPaybackHours: number
}

/** Revenus très rapides au niveau 1 ; améliorations sans plafond métier. */
const REGULAR_INCOME_INCREASE_BPS = 1_200 // +12 % / niveau.
const UPGRADE_BASE_COST_BPS = 2_000       // première amélioration = 20 % de l'achat.
const UPGRADE_COST_GROWTH_BPS = 1_800     // puis +18 % / niveau suivant.
const BASIS_POINTS = 10_000
const LEGACY_MILESTONE_END = 20
const CONTINUOUS_MILESTONE_STEP = 25
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
 * de 10 minutes à 4 heures réelles, pas un rendement financier IRL.
 * Les valeurs sont écrites en minutes / 60 pour conserver le contrat heures.
 * Les investissements des entreprises déjà achetées ne sont pas réécrits.
 */
const rows: readonly EnterpriseRow[] = [
  { id: 'kiosque', name: 'Kiosque', category: 'small', requiredPlayerLevel: 3, priceDollars: 75_000, targetPaybackHours: 12 / 60 },
  { id: 'cafe', name: 'Café', category: 'small', requiredPlayerLevel: 5, priceDollars: 180_000, targetPaybackHours: 14 / 60 },
  { id: 'laverie', name: 'Laverie automatique', category: 'small', requiredPlayerLevel: 7, priceDollars: 300_000, targetPaybackHours: 16 / 60 },
  { id: 'boulangerie', name: 'Boulangerie', category: 'small', requiredPlayerLevel: 9, priceDollars: 420_000, targetPaybackHours: 18 / 60 },
  { id: 'superette', name: 'Supérette', category: 'local', requiredPlayerLevel: 12, priceDollars: 600_000, targetPaybackHours: 22 / 60 },
  { id: 'restaurant', name: 'Restaurant', category: 'local', requiredPlayerLevel: 14, priceDollars: 800_000, targetPaybackHours: 25 / 60 },
  { id: 'station-lavage', name: 'Station de lavage', category: 'local', requiredPlayerLevel: 16, priceDollars: 1_200_000, targetPaybackHours: 29 / 60 },
  { id: 'garage', name: 'Garage automobile', category: 'local', requiredPlayerLevel: 18, priceDollars: 1_800_000, targetPaybackHours: 33 / 60 },
  { id: 'salle-sport', name: 'Salle de sport', category: 'services', requiredPlayerLevel: 21, priceDollars: 2_500_000, targetPaybackHours: 40 / 60 },
  { id: 'cinema', name: 'Cinéma', category: 'services', requiredPlayerLevel: 23, priceDollars: 8_000_000, targetPaybackHours: 45 / 60 },
  { id: 'hotel', name: 'Hôtel', category: 'services', requiredPlayerLevel: 25, priceDollars: 16_000_000, targetPaybackHours: 52 / 60 },
  { id: 'concession', name: 'Concession automobile', category: 'services', requiredPlayerLevel: 27, priceDollars: 35_000_000, targetPaybackHours: 58 / 60 },
  { id: 'entrepot', name: 'Entrepôt logistique', category: 'industry', requiredPlayerLevel: 30, priceDollars: 80_000_000, targetPaybackHours: 70 / 60 },
  { id: 'usine', name: 'Usine de production', category: 'industry', requiredPlayerLevel: 32, priceDollars: 220_000_000, targetPaybackHours: 85 / 60 },
  { id: 'centre-commercial', name: 'Centre commercial', category: 'industry', requiredPlayerLevel: 34, priceDollars: 500_000_000, targetPaybackHours: 100 / 60 },
  { id: 'laboratoire', name: 'Laboratoire', category: 'industry', requiredPlayerLevel: 36, priceDollars: 1_200_000_000, targetPaybackHours: 120 / 60 },
  { id: 'data-center', name: 'Data center', category: 'major', requiredPlayerLevel: 40, priceDollars: 3_000_000_000, targetPaybackHours: 135 / 60 },
  { id: 'compagnie-aerienne', name: 'Compagnie aérienne', category: 'major', requiredPlayerLevel: 43, priceDollars: 20_000_000_000, targetPaybackHours: 170 / 60 },
  { id: 'groupe-energetique', name: 'Entreprise énergétique', category: 'major', requiredPlayerLevel: 46, priceDollars: 85_000_000_000, targetPaybackHours: 205 / 60 },
  { id: 'groupe-technologique', name: 'Groupe technologique', category: 'major', requiredPlayerLevel: 50, priceDollars: 300_000_000_000, targetPaybackHours: 240 / 60 },
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
  // The first-level stream remains a whole number of microdollars/s.
  const baseIncomeMicrosPerSecond = Math.round(
    row.priceDollars * MICROS_PER_DOLLAR / (row.targetPaybackHours * 60 * 60),
  )
  return Object.freeze({
    id: row.id, name: row.name, category: row.category,
    requiredPlayerLevel: row.requiredPlayerLevel,
    purchaseCostCents, baseIncomeMicrosPerSecond,
    targetPaybackHours: row.targetPaybackHours,
  })
}

export const ENTERPRISES: readonly EnterpriseDefinition[] = Object.freeze(rows.map(buildDefinition))
const enterprisesById = new Map<string, EnterpriseDefinition>(ENTERPRISES.map((enterprise) => [enterprise.id, enterprise] as const))
const isLevel = (value: number): boolean => Number.isSafeInteger(value) && value >= 1

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

/**
 * Pure, O(1)-arithmetic upgrade prices. Up to level 20 the original 20%-base
 * 18%-growth price curve is preserved (only the ROI has changed). Afterwards,
 * price growth is quadratic, NOT an exponential depending on the user's level.
 * No table, loops proportional to ownedLevel or artificial business-level cap.
 */
export function getEnterpriseUpgradeCostCentsExact(id: string, currentLevel: number): bigint | null {
  const item = getEnterprise(id)
  if (!item || !isLevel(currentLevel) || currentLevel === Number.MAX_SAFE_INTEGER) return null
  if (currentLevel < LEGACY_MILESTONE_END) {
    return BigInt(Math.round(item.purchaseCostCents * UPGRADE_BASE_COST_BPS / BASIS_POINTS *
      (1 + UPGRADE_COST_GROWTH_BPS / BASIS_POINTS) ** (currentLevel - 1)))
  }
  const anchor = BigInt(Math.round(item.purchaseCostCents * UPGRADE_BASE_COST_BPS / BASIS_POINTS *
    (1 + UPGRADE_COST_GROWTH_BPS / BASIS_POINTS) ** (LEGACY_MILESTONE_END - 1)))
  const x = BigInt(currentLevel - LEGACY_MILESTONE_END)
  // At level 20, the price of level 21 is the same curve's next term.
  const scale = 20n + x
  return (anchor * scale * scale + 200n) / 400n
}

/** Historical 1..20 levels use exactly the same incremental rounding. */
function legacyIncomeAtLevel(item: EnterpriseDefinition, level: number): bigint {
  let income = item.baseIncomeMicrosPerSecond
  for (let i = 2; i <= Math.min(level, LEGACY_MILESTONE_END); i++) {
    const boost = milestoneByLevel.get(i)?.bonusBps ?? 0
    income = Math.round(income * (1 + REGULAR_INCOME_INCREASE_BPS / BASIS_POINTS) *
      (1 + boost / BASIS_POINTS))
  }
  return BigInt(income)
}

/**
 * Exact income stream after level 20: cubic scaling, with +10% for each
 * additional 25-level milestone. This avoids unbounded exponentiation, and
 * costs per upgrade remain economically useful at very high levels.
 */
export function getEnterpriseIncomeMicrosPerSecondExact(id: string, ownedLevel: number): bigint | null {
  const item = getEnterprise(id)
  if (!item || !isLevel(ownedLevel)) return null
  if (ownedLevel <= LEGACY_MILESTONE_END) return legacyIncomeAtLevel(item, ownedLevel)
  const baseline = legacyIncomeAtLevel(item, LEGACY_MILESTONE_END)
  const x = BigInt(ownedLevel - LEGACY_MILESTONE_END)
  const growth = 20n + x
  const milestones = BigInt(Math.floor(ownedLevel / CONTINUOUS_MILESTONE_STEP))
  return (baseline * growth * growth * growth * (10n + milestones) + 40_000n) / 80_000n
}

/** Old numeric engine / compatibility UI only; authoritative v8 uses BigInt. */
function safeLegacy(exact: bigint | null): number | null {
  return exact !== null && exact <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(exact) : null
}
export function getEnterpriseUpgradeCostCents(id: string, currentLevel: number): number | null {
  return safeLegacy(getEnterpriseUpgradeCostCentsExact(id, currentLevel))
}
export function getEnterpriseIncomeMicrosPerSecond(id: string, ownedLevel: number): number | null {
  return safeLegacy(getEnterpriseIncomeMicrosPerSecondExact(id, ownedLevel))
}

export function getEnterpriseMilestone(level: number): EnterpriseMilestone | null {
  if (!isLevel(level)) return null
  const milestone = milestoneByLevel.get(level)
  if (milestone) return milestone
  return level > LEGACY_MILESTONE_END && level % CONTINUOUS_MILESTONE_STEP === 0
    ? { level, name: 'Expansion continue', bonusBps: 1_000 } : null
}

export function getNextEnterpriseMilestone(level: number): EnterpriseMilestone | null {
  if (!Number.isSafeInteger(level) || level < 0 || level === Number.MAX_SAFE_INTEGER) return null
  const historical = ENTERPRISE_MILESTONES.find(m => m.level > level)
  if (historical) return historical
  const next = (Math.floor(level / CONTINUOUS_MILESTONE_STEP) + 1) * CONTINUOUS_MILESTONE_STEP
  return Number.isSafeInteger(next) && next > level ? getEnterpriseMilestone(next) : null
}


/**
 * Sum individually rounded enterprise upgrades exactly, without one loop per
 * level. The quadratic tier has a modulo-400 correction repeating every 200
 * levels, so a constant-size prefix makes huge purchases O(1).
 */
const upgradeResidueCache = new Map<string, { anchor: bigint; prefix: readonly bigint[] }>()
const ROUND_DENOMINATOR = 400n
const PRICE_PERIOD = 200n
function upgradeResidues(id: string): { anchor: bigint; prefix: readonly bigint[] } {
  const cached = upgradeResidueCache.get(id)
  if (cached) return cached
  const anchor = getEnterpriseUpgradeCostCentsExact(id, 20)!
  const prefix: bigint[] = [0n]
  for (let n = 0n; n < PRICE_PERIOD; n++) {
    const remainder = anchor * n * n % ROUND_DENOMINATOR
    const correction = (remainder >= 200n ? ROUND_DENOMINATOR : 0n) - remainder
    prefix.push(prefix[prefix.length - 1]! + correction)
  }
  const result = { anchor, prefix }
  upgradeResidueCache.set(id, result)
  return result
}
function squaresBefore(end: bigint): bigint {
  return (end - 1n) * end * (2n * end - 1n) / 6n
}
function correctionsBefore(end: bigint, prefix: readonly bigint[]): bigint {
  return end / PRICE_PERIOD * prefix[200]! + prefix[Number(end % PRICE_PERIOD)]!
}
export function getEnterpriseUpgradeBatchCostCentsExact(
  id: string, fromLevel: number, toLevel: number,
): bigint | null {
  if (!getEnterprise(id) || !Number.isSafeInteger(fromLevel) ||
      !Number.isSafeInteger(toLevel) || fromLevel < 1 ||
      toLevel < fromLevel || toLevel >= Number.MAX_SAFE_INTEGER) return null
  if (toLevel === fromLevel) return 0n
  let total = 0n
  for (let level = fromLevel; level < Math.min(toLevel, 20); level++)
    total += getEnterpriseUpgradeCostCentsExact(id, level)!
  const first = Math.max(fromLevel, 20)
  if (first < toLevel) {
    const a = BigInt(first), b = BigInt(toLevel)
    const { anchor, prefix } = upgradeResidues(id)
    const squareTotal = squaresBefore(b) - squaresBefore(a)
    const corrections = correctionsBefore(b, prefix) - correctionsBefore(a, prefix)
    total += (anchor * squareTotal + corrections) / ROUND_DENOMINATOR
  }
  return total
}
