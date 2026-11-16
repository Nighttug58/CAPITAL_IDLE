/**
 * Pass 5 — One-time V8 XP and Fame ledger migration.
 *
 * The previous V8 schema used XP curve v3 and derived all Fame expenditures
 * from the immutable OLD shop costs. We preserve those prices for previously
 * bought ranks and do not grant Fame while rebasing XP. Historic totals remain
 * historical; distinct cycle counters are credited only for new awards.
 *
 * This module never touches localStorage. Callers must validate the source,
 * validate the output, then atomically write to the active V8 key.
 */
import type { V8CapitalState } from './exact-state-v8.ts'
import { getExactAmount as exact, withExactAmount as encode } from './exact-state-v8.ts'
import { rebaseV3ExperienceCents } from './exact-levels.ts'
import { getPurchasedFameBoostCost } from './prestige/catalog.ts'

export const V8_FAME_LEDGER_VERSION = 2 as const
export const V8_XP_CURVE_VERSION = 4 as const
const FAME_MICROS = 1_000_000n
/**
 * For existing players with previous Prestiges, prior-cycle Fame cannot be
 * separated from old totals. We therefore initialize current-cycle counters
 * conservatively to 0, without changing a single previously earned/owned
 * Fame unit. For a new player with no Prestige, all earned Fame is in-cycle.
 */
export function migratePreV2V8Save(source: V8CapitalState): V8CapitalState {
  const prestige = source.prestige
  if (prestige.xpCurveVersion === V8_XP_CURVE_VERSION &&
      prestige.fameShopLedgerVersion === V8_FAME_LEDGER_VERSION) return source
  if ((prestige.xpCurveVersion as number) !== 3 || prestige.fameShopLedgerVersion !== undefined)
    throw new RangeError('Unknown legacy XP/Fame ledger version')
  const spent = getPurchasedFameBoostCost(prestige.boosts)
  if (spent === null) throw new RangeError('Invalid original Fame boost levels')
  const current = exact(prestige.fameMicros)
  const minted = exact(prestige.lifetimeFameMicros)
  if (minted - current !== BigInt(spent) * FAME_MICROS)
    throw new RangeError('Invalid original Fame ledger')
  const rebased = rebaseV3ExperienceCents(exact(prestige.experienceCents))
  const firstCycle = source.ascension.progress.prestigeCount === 0
  return {
    ...source,
    prestige: {
      ...prestige,
      xpCurveVersion: V8_XP_CURVE_VERSION,
      // Retain detailed rebase evidence for ordinary snapshots. For extreme
      // old XP (hundreds of digits), the immutable pre-migration backup is
      // the evidence instead: recomputing an enormous old threshold on every
      // click/save would stall the browser.
      ...(prestige.experienceCents.length <= 40 ?
        {xpRebaseV4: { fromCents: prestige.experienceCents, toCents: encode(rebased) }} : {}),
      experienceCents: encode(rebased),
      fameShopLedgerVersion: V8_FAME_LEDGER_VERSION,
      fameLegacyLevels: { ...prestige.boosts },
      fameSpentMicros: encode(BigInt(spent) * FAME_MICROS),
      fameForfeitedMicros: '0',
      cycleEarnedFameMicros: firstCycle ? prestige.lifetimeFameMicros : '0',
      cycleLevelFameMicros: firstCycle ? prestige.levelFameMicros : '0',
      cycleCollectionFameMicros: firstCycle ? prestige.collectionFameMicros : '0',
    },
  }
}
