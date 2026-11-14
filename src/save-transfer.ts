import {
  CAPITAL_SAVE_VERSION, restoreCapitalState, type CapitalState,
} from './capital.ts'
import { restoreGame } from './game.ts'
import { restoreTradingState } from './trading/state.ts'

/**
 * Export manuel indépendant du localStorage. Les horloges de simulation
 * appartiennent à state et ne sont jamais avancées par l'export lui-même.
 */
export const SAVE_FILE_FORMAT = 'CAPITAL_IDLE_SAVE' as const
export const SAVE_FILE_FORMAT_VERSION = 1 as const
export const MAX_IMPORT_FILE_BYTES = 16 * 1024 * 1024

export interface SaveImportPreview {
  readonly state: CapitalState
  readonly sourceVersion: 4 | 5 | 6 | 7
  readonly exportedAt: number | null
}

export type SaveImportResult =
  | { readonly ok: true; readonly preview: SaveImportPreview }
  | { readonly ok: false; readonly error: 'file-too-large' | 'invalid-json' | 'unsupported-version' | 'invalid-save' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Compare les valeurs et les clés sans dépendre de l'ordre d'un JSON importé. */
function sameValue(a: unknown, b: unknown, depth = 0): boolean {
  if (Object.is(a, b)) return true
  if (depth > 20) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((entry, index) => sameValue(entry, b[index], depth + 1))
  }
  if (!isRecord(a) || !isRecord(b)) return false
  const ak = Object.keys(a).sort()
  const bk = Object.keys(b).sort()
  return ak.length === bk.length && ak.every((key, index) =>
    key === bk[index] && sameValue(a[key], b[key], depth + 1))
}

/**
 * Adapte UNIQUEMENT les champs réellement facultatifs des anciens schémas.
 * Toutes les autres différences avec l'état restauré signifient qu'un champ a
 * été modifié / invalidé ou qu'une section a été réinitialisée silencieusement.
 */
function normalizeLegacyOptionalFields(raw: Record<string, unknown>, restored: CapitalState): unknown {
  const input = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>
  const trading = input.trading
  if (isRecord(trading)) {
    if (!('creditedTradingProfit' in trading)) trading.creditedTradingProfit = 0
    if (!('dividendPendingCents' in trading)) trading.dividendPendingCents = 0
    if (!('dividendLastPaidAt' in trading)) trading.dividendLastPaidAt = trading.lastTickAt
  }
  if (input.version === 5) {
    const fiscal = input.fiscal
    if (isRecord(fiscal) && !('enterpriseTaxRemainderBps' in fiscal)) {
      fiscal.enterpriseTaxRemainderBps = 0
    }
    const stats = input.stats
    if (isRecord(stats) && !('sourceTrackingVersion' in stats)) {
      // Première v5 : les gains anciens non ventilés sont complétés par la
      // migration de la passe 6, sans inventer de clic ou de dividende.
      stats.sourceTrackingVersion = 1
      if (isRecord(stats.earnedBySource)) {
        stats.earnedBySource.unclassified = restored.stats.earnedBySource.unclassified
      }
    }
  }
  if (input.version === 6) {
    const prestige = input.prestige
    if (isRecord(prestige) && isRecord(restored.prestige)) {
      // Preserve valid Fame acquired before sub-cent carry fields existed.
      for (const field of ['experienceCarryBps', 'clickCarryBps', 'tradingCarryBps'] as const) {
        if (!(field in prestige)) prestige[field] = 0
      }
      // One-time migration of older v6 files to the stricter XP thresholds.
      // The actual Gold, Fame, levels and purchases remain identical.
      if (!('xpCurveVersion' in prestige)) {
        prestige.experienceCents = restored.prestige.experienceCents
        prestige.xpCurveVersion = restored.prestige.xpCurveVersion
      }
    }
  }
  return input
}

/**
 * Parse + valide AVANT confirmation.
 * Rejette les restaurations partielles : ne jamais laisser restoreCapitalState
 * masquer un portefeuille, un solde ou une fiscalité corrompus.
 *
 * Supporte le conteneur d'export actuel, les fichiers bruts v5, et v4 avec
 * migration conservant le Trading sans taxer le passé.
 */
export function prepareSaveImport(text: string, now = Date.now()): SaveImportResult {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, error: 'file-too-large' }
  }
  if (!validTime(now)) return { ok: false, error: 'invalid-save' }
  let parsed: unknown
  try { parsed = JSON.parse(text) as unknown }
  catch { return { ok: false, error: 'invalid-json' } }

  let saved: unknown = parsed
  let exportedAt: number | null = null
  if (isRecord(parsed) && 'format' in parsed) {
    if (parsed.format !== SAVE_FILE_FORMAT || parsed.formatVersion !== SAVE_FILE_FORMAT_VERSION ||
        !validTime(parsed.exportedAt) || !('state' in parsed)) {
      return { ok: false, error: 'unsupported-version' }
    }
    if (parsed.exportedAt > now + 5 * 60_000) return { ok: false, error: 'invalid-save' }
    exportedAt = parsed.exportedAt
    saved = parsed.state
  }

  if (!isRecord(saved) || (saved.version !== CAPITAL_SAVE_VERSION && saved.version !== 6 && saved.version !== 5 && saved.version !== 4)) {
    return { ok: false, error: 'unsupported-version' }
  }
  const version = saved.version as 4 | 5 | 6 | 7
  const restored = restoreCapitalState(saved, now)

  // V4 n'a que les sections game/trading. Les deux doivent être entièrement
  // cohérentes pour être importées ; les nouveaux compteurs commencent à zéro.
  if (version === 4) {
    if (!isRecord(saved.game) || !isRecord(saved.trading) ||
        !sameValue(saved.game, restoreGame(saved.game, {
          experiencePoints: isRecord(saved.game) && typeof saved.game.lifetimeEarned === 'number'
            ? saved.game.lifetimeEarned * 4 : undefined,
        }))) {
      return { ok: false, error: 'invalid-save' }
    }
    const canonicalTrading = restoreTradingState(saved.trading, now)
    const normalized = normalizeLegacyOptionalFields(saved, restored) as Record<string, unknown>
    if (!sameValue(normalized.trading, canonicalTrading)) return { ok: false, error: 'invalid-save' }
  } else {
    // Un fichier v5 ne possède pas encore la section prestige, que la migration
    // crédite une seule fois. Un fichier v6 doit en revanche la fournir intacte.
    const required = version === 7
      ? ['game', 'trading', 'enterprises', 'fiscal', 'stats', 'prestige', 'ascension']
      : version === 6
        ? ['game', 'trading', 'enterprises', 'fiscal', 'stats', 'prestige']
        : ['game', 'trading', 'enterprises', 'fiscal', 'stats']
    if (!required.every((key) => isRecord(saved[key]))) {
      return { ok: false, error: 'invalid-save' }
    }
    const normalized = normalizeLegacyOptionalFields(saved, restored)
    if (version === 5) {
      const legacyProjection: Record<string, unknown> = { ...restored }
      delete legacyProjection.prestige
      delete legacyProjection.ascension
      // v5 lacked both Fame and the new Prestige currency.
      if (!sameValue(normalized, { ...legacyProjection, version: 5 })) return { ok: false, error: 'invalid-save' }
    } else if (version === 6) {
      const legacyProjection: Record<string, unknown> = { ...restored }
      delete legacyProjection.ascension
      if (!sameValue(normalized, { ...legacyProjection, version: 6 })) return { ok: false, error: 'invalid-save' }
    } else if (!sameValue(normalized, restored)) return { ok: false, error: 'invalid-save' }
  }

  const dates = [
    restored.trading.lastTickAt, restored.trading.dividendLastPaidAt,
    restored.enterprises.lastAccruedAt, restored.fiscal.periodStartedAt,
    restored.stats.startedAt,
    restored.ascension.run.startedAtRealMs, restored.ascension.run.marketClock.realAnchorMs,
  ]
  if (dates.some((time) => time > now + 5 * 60_000)) return { ok: false, error: 'invalid-save' }
  if (restored.fiscal.periodStartedAt > restored.enterprises.lastAccruedAt ||
      restored.trading.lastTickAt > restored.trading.dividendLastPaidAt) {
    return { ok: false, error: 'invalid-save' }
  }

  return { ok: true, preview: { state: restored, sourceVersion: version, exportedAt } }
}

export function createSaveExport(state: CapitalState, now = Date.now()): string {
  if (!validTime(now)) throw new Error('Horodatage invalide')
  return JSON.stringify({
    format: SAVE_FILE_FORMAT,
    formatVersion: SAVE_FILE_FORMAT_VERSION,
    exportedAt: now,
    state,
  }, null, 2)
}

export function exportFileName(at = Date.now()): string {
  if (!validTime(at)) throw new Error('Horodatage invalide')
  return 'CAPITAL_IDLE_save_' + new Date(at).toISOString().slice(0, 10) + '.json'
}
