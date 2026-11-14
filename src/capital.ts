import { INITIAL_GAME, getLevel, restoreGame, upgradeLegacyExperienceCents, UPGRADES, type GameState } from './game.ts'
import {
  createInitialEnterpriseState, createInitialFiscalState, createInitialStatsState,
  restoreEnterpriseState, restoreFiscalState, restoreStatsState,
  type EnterpriseState, type FiscalState, type StatsState,
} from './economy/state.ts'
import { createInitialTradingState, restoreTradingState } from './trading/state.ts'
import type { TradingState } from './trading/types.ts'
import { createInitialPrestigeState, restorePrestigeState, type PrestigeState } from './prestige/state.ts'

export const CAPITAL_SAVE_VERSION = 6 as const
const LEGACY_CAPITAL_SAVE_VERSIONS = [4, 5] as const

// Une seule autorité monétaire : game.balance, qui pourra être négatif
// après une échéance fiscale. game.lifetimeEarned reste un total monétaire,
// tandis que prestige.experienceCents est la seule autorité des niveaux.
export interface CapitalState {
  version: typeof CAPITAL_SAVE_VERSION
  game: GameState
  trading: TradingState
  enterprises: EnterpriseState
  fiscal: FiscalState
  stats: StatsState
  prestige: PrestigeState
}

export function createCapitalState(game: GameState = { ...INITIAL_GAME }, now = Date.now()): CapitalState {
  // Supplied game-only snapshots can originate from an old clicker save.
  // Preserve purchased click upgrades that were earned before the level curve
  // became 4x more demanding. Fresh players never use this migration.
  const clickRequirement = game.purchasedUpgrades > 0
    ? (UPGRADES[game.purchasedUpgrades - 1]?.requiredLevel ?? 1) : 1
  const olderClickProgress = getLevel(game.lifetimeEarned) < clickRequirement
  return {
    version: CAPITAL_SAVE_VERSION,
    game: { ...game },
    trading: createInitialTradingState(now),
    enterprises: createInitialEnterpriseState(now),
    fiscal: createInitialFiscalState(now),
    stats: createInitialStatsState(now, game.lifetimeEarned),
    prestige: createInitialPrestigeState(game.lifetimeEarned, olderClickProgress),
  }
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
}

export function restoreCapitalState(raw: unknown, now = Date.now()): CapitalState {
  if (!isRecord(raw) || (raw.version !== CAPITAL_SAVE_VERSION && !LEGACY_CAPITAL_SAVE_VERSIONS.includes(raw.version as 4 | 5))) {
    return createCapitalState(undefined, now)
  }

  // Migration v4 : ne pas remettre les revenus historiques dans une catégorie
  // inventée, ne pas imposer rétroactivement, conserver l'intégralité du Trading.
  if (raw.version === 4) {
    const historicalEarnings = isRecord(raw.game) && typeof raw.game.lifetimeEarned === 'number'
      ? raw.game.lifetimeEarned * 100 : 0
    const migratedExperience = upgradeLegacyExperienceCents(historicalEarnings)
    const game = restoreGame(raw.game, { experiencePoints: migratedExperience === null ? undefined : migratedExperience / 100 })
    return {
      version: CAPITAL_SAVE_VERSION,
      game,
      trading: restoreTradingState(raw.trading, now),
      enterprises: createInitialEnterpriseState(now),
      fiscal: createInitialFiscalState(now),
      stats: createInitialStatsState(now, game.lifetimeEarned),
      prestige: createInitialPrestigeState(game.lifetimeEarned, true),
    }
  }

  const historicalExperience = isRecord(raw.prestige) && typeof raw.prestige.experienceCents === 'number'
    ? raw.prestige.experienceCents : undefined
  const candidateExperience = historicalExperience === undefined ? undefined
    : raw.version === 6 && raw.prestige && isRecord(raw.prestige) && raw.prestige.xpCurveVersion === 2
      ? historicalExperience : upgradeLegacyExperienceCents(historicalExperience)
  const legacyEarnedCents = isRecord(raw.game) && typeof raw.game.lifetimeEarned === 'number'
    ? raw.game.lifetimeEarned * 100 : null
  const v5Experience = legacyEarnedCents === null ? null : upgradeLegacyExperienceCents(legacyEarnedCents)
  const restoredExperience = raw.version === 6 ? candidateExperience : v5Experience
  const game = restoreGame(raw.game, {
    allowNegativeBalance: true,
    experiencePoints: restoredExperience === null || restoredExperience === undefined
      ? undefined : restoredExperience / 100,
  })
  const prestige = raw.version === 6
    ? restorePrestigeState(raw.prestige, game.lifetimeEarned)
    : createInitialPrestigeState(game.lifetimeEarned, true)
  return {
    version: CAPITAL_SAVE_VERSION,
    game,
    trading: restoreTradingState(raw.trading, now),
    enterprises: restoreEnterpriseState(raw.enterprises, now),
    fiscal: restoreFiscalState(raw.fiscal, now),
    stats: restoreStatsState(raw.stats, now, game.lifetimeEarned),
    prestige,
  }
}
