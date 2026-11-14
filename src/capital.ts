import { INITIAL_GAME, getLevel, restoreGame, upgradeLegacyExperienceCents, UPGRADES, type GameState } from './game.ts'
import {
  createInitialEnterpriseState, createInitialFiscalState, createInitialStatsState,
  restoreEnterpriseState, restoreFiscalState, restoreStatsState,
  type EnterpriseState, type FiscalState, type StatsState,
} from './economy/state.ts'
import { createInitialTradingState, restoreTradingState } from './trading/state.ts'
import type { TradingState } from './trading/types.ts'
import { createInitialPrestigeState, restorePrestigeState, type PrestigeState } from './prestige/state.ts'
import { createInitialAscensionState, restoreAscensionState } from './ascension/state.ts'
import type { AscensionSaveSection } from './ascension/contracts.ts'

export const CAPITAL_SAVE_VERSION = 7 as const
const LEGACY_CAPITAL_SAVE_VERSIONS = [4, 5, 6] as const

// Une seule autorité cash : game.balance. L'XP du cycle et la Fame sont
// dans prestige (historique), les PP et le record Fame global dans ascension.
export interface CapitalState {
  version: typeof CAPITAL_SAVE_VERSION
  game: GameState
  trading: TradingState
  enterprises: EnterpriseState
  fiscal: FiscalState
  stats: StatsState
  prestige: PrestigeState
  ascension: AscensionSaveSection
}

export function createCapitalState(game: GameState = { ...INITIAL_GAME }, now = Date.now()): CapitalState {
  const clickRequirement = game.purchasedUpgrades > 0
    ? (UPGRADES[game.purchasedUpgrades - 1]?.requiredLevel ?? 1) : 1
  const olderClickProgress = getLevel(game.lifetimeEarned) < clickRequirement
  const prestige = createInitialPrestigeState(game.lifetimeEarned, olderClickProgress)
  return {
    version: CAPITAL_SAVE_VERSION,
    game: { ...game },
    trading: createInitialTradingState(now),
    enterprises: createInitialEnterpriseState(now),
    fiscal: createInitialFiscalState(now),
    stats: createInitialStatsState(now, game.lifetimeEarned),
    prestige,
    ascension: createInitialAscensionState(now, prestige.lastAwardedLevel),
  }
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
}

export function restoreCapitalState(raw: unknown, now = Date.now()): CapitalState {
  if (!isRecord(raw) || (raw.version !== CAPITAL_SAVE_VERSION &&
      !LEGACY_CAPITAL_SAVE_VERSIONS.includes(raw.version as 4 | 5 | 6))) {
    return createCapitalState(undefined, now)
  }

  // V4 preserves its Trading but has no historical fiscal ledger, Fame or PP.
  if (raw.version === 4) {
    const historicalEarnings = isRecord(raw.game) && typeof raw.game.lifetimeEarned === 'number'
      ? raw.game.lifetimeEarned * 100 : 0
    const migratedExperience = upgradeLegacyExperienceCents(historicalEarnings)
    const game = restoreGame(raw.game, { experiencePoints: migratedExperience === null ? undefined : migratedExperience / 100 })
    const prestige = createInitialPrestigeState(game.lifetimeEarned, true)
    return {
      version: CAPITAL_SAVE_VERSION,
      game, trading: restoreTradingState(raw.trading, now),
      enterprises: createInitialEnterpriseState(now),
      fiscal: createInitialFiscalState(now),
      stats: createInitialStatsState(now, game.lifetimeEarned),
      prestige, ascension: createInitialAscensionState(now, prestige.lastAwardedLevel),
    }
  }

  const historicalExperience = isRecord(raw.prestige) && typeof raw.prestige.experienceCents === 'number'
    ? raw.prestige.experienceCents : undefined
  const candidateExperience = historicalExperience === undefined ? undefined
    : (raw.version === 6 || raw.version === 7) && isRecord(raw.prestige) && raw.prestige.xpCurveVersion === 2
      ? historicalExperience : upgradeLegacyExperienceCents(historicalExperience)
  const legacyEarnedCents = isRecord(raw.game) && typeof raw.game.lifetimeEarned === 'number'
    ? raw.game.lifetimeEarned * 100 : null
  const v5Experience = legacyEarnedCents === null ? null : upgradeLegacyExperienceCents(legacyEarnedCents)
  const restoredExperience = raw.version === 5 ? v5Experience : candidateExperience
  const game = restoreGame(raw.game, {
    allowNegativeBalance: true,
    experiencePoints: restoredExperience === null || restoredExperience === undefined
      ? undefined : restoredExperience / 100,
  })
  const prestige = raw.version === 5
    ? createInitialPrestigeState(game.lifetimeEarned, true)
    : restorePrestigeState(raw.prestige, game.lifetimeEarned)
  const ascension = raw.version === 7
    ? restoreAscensionState(raw.ascension, now, prestige.lastAwardedLevel, prestige.levelFameMicros) ??
      createInitialAscensionState(now, prestige.lastAwardedLevel)
    : createInitialAscensionState(now, prestige.lastAwardedLevel)
  return {
    version: CAPITAL_SAVE_VERSION,
    game, trading: restoreTradingState(raw.trading, now),
    enterprises: restoreEnterpriseState(raw.enterprises, now),
    fiscal: restoreFiscalState(raw.fiscal, now),
    stats: restoreStatsState(raw.stats, now, game.lifetimeEarned),
    prestige, ascension,
  }
}
