import { INITIAL_GAME, restoreGame, type GameState } from './game.ts'

const STORAGE_KEY = 'capital-idle-save-v1'

export function loadGame(): GameState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? restoreGame(JSON.parse(saved) as unknown) : { ...INITIAL_GAME }
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
