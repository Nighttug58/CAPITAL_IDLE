import { INITIAL_GAME, migrateLegacyGame, migrateV2Game, restoreGame, type GameState } from './game.ts'

const STORAGE_KEY = 'capital-idle-save-v3'
const PREVIOUS_STORAGE_KEY = 'capital-idle-save-v2'
const LEGACY_STORAGE_KEY = 'capital-idle-save-v1'

export function loadGame(): GameState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved !== null) return restoreGame(JSON.parse(saved) as unknown)

    const previousSaved = localStorage.getItem(PREVIOUS_STORAGE_KEY)
    if (previousSaved !== null) {
      const migrated = migrateV2Game(JSON.parse(previousSaved) as unknown)
      saveGame(migrated)
      return migrated
    }

    const legacySaved = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacySaved !== null) {
      const migrated = migrateLegacyGame(JSON.parse(legacySaved) as unknown)
      saveGame(migrated)
      return migrated
    }
    return { ...INITIAL_GAME }
  } catch {
    return { ...INITIAL_GAME }
  }
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // La partie reste jouable si le stockage du navigateur est inaccessible.
  }
}
