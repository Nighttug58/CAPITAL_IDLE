import { INITIAL_GAME, migrateLegacyGame, migrateV2Game, restoreGame, type GameState } from './game.ts'
import { createCapitalState, restoreCapitalState, type CapitalState } from './capital.ts'

const STORAGE_KEY = 'capital-idle-save-v5'
const V4_STORAGE_KEY = 'capital-idle-save-v4'
const V3_STORAGE_KEY = 'capital-idle-save-v3'
const V2_STORAGE_KEY = 'capital-idle-save-v2'
const V1_STORAGE_KEY = 'capital-idle-save-v1'

// Un stockage absent ou un JSON endommagé ne bloque jamais le jeu.
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
  // Une v5 présente est l'autorité, même corrompue : ne jamais ressusciter
  // silencieusement la v4 périmée après un reset (passe 7).
  const current = readStorage(STORAGE_KEY)
  if (current !== undefined) return restoreCapitalState(current, now)

  const oldCapital = readStorage(V4_STORAGE_KEY)
  if (oldCapital !== undefined) {
    const migrated = restoreCapitalState(oldCapital, now)
    saveCapitalState(migrated)
    return migrated
  }

  // Les sauvegardes clicker v1/v2/v3 n'avaient aucun état Trading.
  const migrated = createCapitalState(readPreviousGame(), now)
  saveCapitalState(migrated)
  return migrated
}

export function saveCapitalState(state: CapitalState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Si le stockage est saturé, le jeu reste accessible pendant la session.
  }
}
