import { INITIAL_GAME, LEVEL_THRESHOLD_FACTOR, migrateLegacyGame, migrateV2Game, restoreGame, type GameState } from './game.ts'
import { createCapitalState, restoreCapitalState, type CapitalState } from './capital.ts'
import { createInitialPrestigeState } from './prestige/state.ts'
import { createInitialAscensionState } from './ascension/state.ts'

const STORAGE_KEY = 'capital-idle-save-v7'
const V6_STORAGE_KEY = 'capital-idle-save-v6'
const V5_STORAGE_KEY = 'capital-idle-save-v5'
const V4_STORAGE_KEY = 'capital-idle-save-v4'
const V3_STORAGE_KEY = 'capital-idle-save-v3'
const V2_STORAGE_KEY = 'capital-idle-save-v2'
const V1_STORAGE_KEY = 'capital-idle-save-v1'

function readStorage(key: string): unknown {
  try {
    const text = localStorage.getItem(key)
    return text === null ? undefined : JSON.parse(text) as unknown
  } catch { return undefined }
}

function readPreviousGame(): GameState {
  const v3 = readStorage(V3_STORAGE_KEY)
  if (v3 !== undefined) {
    const legacy = v3 as Partial<GameState>
    const oldXp = typeof legacy?.lifetimeEarned === 'number' ? legacy.lifetimeEarned * LEVEL_THRESHOLD_FACTOR : undefined
    return restoreGame(v3, { experiencePoints: oldXp })
  }
  const v2 = readStorage(V2_STORAGE_KEY)
  if (v2 !== undefined) return migrateV2Game(v2)
  const v1 = readStorage(V1_STORAGE_KEY)
  if (v1 !== undefined) return migrateLegacyGame(v1)
  return { ...INITIAL_GAME }
}

export function loadCapitalState(now = Date.now()): CapitalState {
  // Current key is authoritative even when corrupt: never resurrect an
  // obsolete save after a reset. The explicit import path remains available.
  let currentText: string | null = null
  try { currentText = localStorage.getItem(STORAGE_KEY) } catch { /* unavailable */ }
  if (currentText !== null) return restoreCapitalState(readStorage(STORAGE_KEY), now)

  for (const key of [V6_STORAGE_KEY, V5_STORAGE_KEY, V4_STORAGE_KEY]) {
    const legacy = readStorage(key)
    if (legacy === undefined) continue
    const migrated = restoreCapitalState(legacy, now)
    saveCapitalState(migrated)
    return migrated
  }

  const previousGame = readPreviousGame()
  const base = createCapitalState(previousGame, now)
  const prestige = createInitialPrestigeState(previousGame.lifetimeEarned, true)
  const migrated: CapitalState = {
    ...base, prestige,
    ascension: createInitialAscensionState(now, prestige.lastAwardedLevel),
  }
  saveCapitalState(migrated)
  return migrated
}

export function saveCapitalState(state: CapitalState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
  catch { /* noncritical autosave failure */ }
}

/** Import, full reset and cycle transitions must never partially replace state. */
export function replaceCapitalSave(state: CapitalState): boolean {
  try {
    if (state.version !== 7) return false
    const data = JSON.stringify(state)
    localStorage.setItem(STORAGE_KEY, data)
    if (localStorage.getItem(STORAGE_KEY) !== data) return false
  } catch { return false }
  for (const key of [V6_STORAGE_KEY, V5_STORAGE_KEY, V4_STORAGE_KEY, V3_STORAGE_KEY, V2_STORAGE_KEY, V1_STORAGE_KEY]) {
    try { localStorage.removeItem(key) } catch { /* current v7 remains authoritative */ }
  }
  return true
}
