import { INITIAL_GAME, migrateLegacyGame, migrateV2Game, restoreGame, type GameState } from './game.ts'
import { createCapitalState, restoreCapitalState, type CapitalState } from './capital.ts'

const STORAGE_KEY = 'capital-idle-save-v4'
const V3_STORAGE_KEY = 'capital-idle-save-v3'
const V2_STORAGE_KEY = 'capital-idle-save-v2'
const V1_STORAGE_KEY = 'capital-idle-save-v1'

// Un stockage absent ou une version JSON endommagée ne bloque jamais le jeu.
function readStorage(key: string): unknown {
  try {
    const text = localStorage.getItem(key)
    return text === null ? undefined : JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function readPreviousGame(): GameState {
  const v3 = readStorage(V3_STORAGE_KEY)
  if (v3 !== undefined) return restoreGame(v3)

  const v2 = readStorage(V2_STORAGE_KEY)
  if (v2 !== undefined) return migrateV2Game(v2)

  const v1 = readStorage(V1_STORAGE_KEY)
  if (v1 !== undefined) return migrateLegacyGame(v1)

  return { ...INITIAL_GAME }
}

export function loadCapitalState(now = Date.now()): CapitalState {
  const current = readStorage(STORAGE_KEY)
  if (current !== undefined) return restoreCapitalState(current, now)

  // La migration ne supprime jamais les sauvegardes antérieures.
  const migrated = createCapitalState(readPreviousGame(), now)
  saveCapitalState(migrated)
  return migrated
}

export function saveCapitalState(state: CapitalState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // En l'absence d'accès au stockage, le jeu reste utilisable en session.
  }
}
