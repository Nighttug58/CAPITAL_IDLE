import { migratePrestigeShop } from './ascension/v2.ts'
import { migrateV8ToFameV4 } from './prestige/fame-v4-ledger.ts'
/**
 * Transaction-safe candidate migration: validate the source v7 with the
 * existing strict importer, then produce and check an exact v8 snapshot.
 * This module never mutates localStorage itself: the active V8 persistence
 * boundary validates and writes the converted state atomically.
 */
import { getAsset } from './trading/catalog.ts'
import { MAX_IMPORT_FILE_BYTES, prepareSaveImport, SAVE_FILE_FORMAT,
  SAVE_FILE_FORMAT_VERSION } from './save-transfer.ts'
import { projectValidatedV7ToExactV8 } from './exact-save-v8.ts'
import { validateExactV8State } from './exact-save-validation.ts'
import { migratePreV2V8Save } from './fame-cycle-v8.ts'
import type { V8CapitalState } from './exact-state-v8.ts'

export type ExactMigrationResult =
  | { ok: true; v8Json: string; convertedState: Record<string, unknown>; sourceVersion: number }
  | { ok: false; error: string }

/** Pure preflight. The input file, previous save and process state are unchanged. */
export function previewV8Migration(sourceJson: string, now = Date.now()): ExactMigrationResult {
  const imported = prepareSaveImport(sourceJson, now)
  if (!imported.ok) return { ok: false, error: 'Legacy import rejected: ' + imported.error }
  try {
    const getDecimals = (id: string) => getAsset(id)?.quantityDecimals ?? null
    const legacy = projectValidatedV7ToExactV8(imported.preview.state, getDecimals)
    const oldChecked = validateExactV8State(legacy, getDecimals)
    if (!oldChecked.valid) return { ok: false, error: 'Legacy V8 validation rejected: ' + oldChecked.reason }
    const convertedState = migrateV8ToFameV4(migratePrestigeShop(migratePreV2V8Save(legacy as unknown as V8CapitalState)))
    const checked = validateExactV8State(convertedState, getDecimals)
    if (!checked.valid) return { ok: false, error: 'V8 validation rejected: ' + checked.reason }
    const v8Json = JSON.stringify({
      format: SAVE_FILE_FORMAT,
      formatVersion: SAVE_FILE_FORMAT_VERSION,
      exportedAt: now,
      state: convertedState,
    })
    if (new TextEncoder().encode(v8Json).byteLength > MAX_IMPORT_FILE_BYTES) {
      return { ok: false, error: 'Converted file is too large' }
    }
    return { ok: true, convertedState: convertedState as unknown as Record<string, unknown>, v8Json, sourceVersion: imported.preview.sourceVersion }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unrecognized migration error' }
  }
}
