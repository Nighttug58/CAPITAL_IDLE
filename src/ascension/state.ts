import {
  ASCENSION_SHOP_EXPECTED_LEVELS, ASCENSION_SHOP_EXPECTED_TOTAL_PP,
  type AscensionAutomationSettings, type AscensionCycleSummary,
  type AscensionProgress, type AscensionRunState, type AscensionSaveSection,
  type AscensionSpeed,
} from './contracts.ts'
import { ASCENSION_TOTAL_COST, ASCENSION_TOTAL_LEVELS, ascensionSpentPoints, createZeroAscensionLevels } from './catalog.ts'
import { getAsset } from '../trading/catalog.ts'
import { previewPrestigePoints } from './contracts.ts'

export const MAX_ASCENSION_HISTORY = 100
const safe = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const keys = (v: Record<string, unknown>, expected: readonly string[]) =>
  Object.keys(v).length === expected.length && expected.every(key => Object.prototype.hasOwnProperty.call(v, key))
const speed = (value: unknown): value is AscensionSpeed =>
  value === 1 || value === 1.5 || value === 2 || value === 3 || value === 4 || value === 5

export function createInitialAscensionRun(now: number): AscensionRunState {
  return {
    startedAtRealMs: now,
    marketClock: { simulatedAtMs: now, realAnchorMs: now, selectedSpeed: 1 },
    automation: {
      autoClickEnabled: false, investorEnabled: false,
      traderEnabled: false, enterpriseEnabled: false,
      allowedAssetIds: [], maxOrderCents: 0, cashReserveCents: 0,
    },
  }
}

export function createInitialAscensionState(now: number, highestFameAwardedLevel: number): AscensionSaveSection {
  return {
    progress: {
      availablePoints: 0, lifetimePoints: 0, prestigeCount: 0,
      upgradeLevels: createZeroAscensionLevels(),
      highestFameAwardedLevel, history: [],
    },
    run: createInitialAscensionRun(now),
  }
}

function validAutomation(value: unknown): value is AscensionAutomationSettings {
  if (!record(value) || !keys(value, [
    'autoClickEnabled', 'investorEnabled', 'traderEnabled', 'enterpriseEnabled',
    'allowedAssetIds', 'maxOrderCents', 'cashReserveCents',
  ])) return false
  if (['autoClickEnabled', 'investorEnabled', 'traderEnabled', 'enterpriseEnabled']
    .some(id => typeof value[id] !== 'boolean')) return false
  if (!safe(value.maxOrderCents) || !safe(value.cashReserveCents) ||
      !Array.isArray(value.allowedAssetIds) || value.allowedAssetIds.length > 45) return false
  return value.allowedAssetIds.every((id: unknown) => typeof id === 'string' && !!getAsset(id)) &&
    new Set(value.allowedAssetIds).size === value.allowedAssetIds.length
}

function validHistory(history: unknown, count: number, lifetime: number, highest: number, now: number): history is AscensionCycleSummary[] {
  if (!Array.isArray(history) || history.length > MAX_ASCENSION_HISTORY ||
      history.length !== Math.min(count, MAX_ASCENSION_HISTORY)) return false
  let previousAt = -1
  let pointsInHistory = 0
  for (let i = 0; i < history.length; i++) {
    const item: unknown = history[i]
    if (!record(item) || !keys(item, ['cycle', 'completedAtRealMs', 'eligibleWorthCents', 'earnedPoints', 'levelAtCompletion']) ||
        !safe(item.cycle) || item.cycle !== count - history.length + i + 1 ||
        !safe(item.completedAtRealMs) || item.completedAtRealMs < previousAt ||
        item.completedAtRealMs > now + 5 * 60_000 ||
        !safe(item.eligibleWorthCents) || item.eligibleWorthCents < 100_000_000 * 100 ||
        !safe(item.earnedPoints) || item.earnedPoints < 20 ||
        !safe(item.levelAtCompletion) || item.levelAtCompletion < 100 ||
        item.levelAtCompletion > highest ||
        previewPrestigePoints(item.eligibleWorthCents / 100, item.levelAtCompletion) !== item.earnedPoints) return false
    previousAt = item.completedAtRealMs
    pointsInHistory += item.earnedPoints
  }
  return Number.isSafeInteger(pointsInHistory) &&
    (count <= MAX_ASCENSION_HISTORY ? pointsInHistory === lifetime : pointsInHistory <= lifetime)
}

/** A malformed current section never silently credits PP. JSON import detects all drift. */
export function restoreAscensionState(raw: unknown, now: number, lastAwardedLevel: number, levelFameMicros: number): AscensionSaveSection | null {
  if (!record(raw) || !keys(raw, ['progress', 'run']) ||
      !record(raw.progress) || !record(raw.run)) return null
  const progress = raw.progress
  const run = raw.run
  if (!keys(progress, ['availablePoints','lifetimePoints','prestigeCount','upgradeLevels','highestFameAwardedLevel','history']) ||
      !safe(progress.availablePoints) || !safe(progress.lifetimePoints) ||
      !safe(progress.prestigeCount) || !safe(progress.highestFameAwardedLevel) ||
      progress.highestFameAwardedLevel < lastAwardedLevel ||
      (progress.prestigeCount > 0 && progress.highestFameAwardedLevel < 100) ||
      progress.availablePoints > progress.lifetimePoints) return null
  const spent = ascensionSpentPoints(progress.upgradeLevels)
  if (spent === null || progress.lifetimePoints - progress.availablePoints !== spent ||
      ASCENSION_TOTAL_LEVELS !== ASCENSION_SHOP_EXPECTED_LEVELS ||
      ASCENSION_TOTAL_COST !== ASCENSION_SHOP_EXPECTED_TOTAL_PP ||
      !Number.isSafeInteger((progress.highestFameAwardedLevel * (progress.highestFameAwardedLevel + 1) / 2) * 1_000_000) ||
      levelFameMicros < progress.highestFameAwardedLevel * (progress.highestFameAwardedLevel + 1) / 2 * 1_000_000 ||
      !validHistory(progress.history, progress.prestigeCount, progress.lifetimePoints, progress.highestFameAwardedLevel, now)) return null

  if (!keys(run, ['startedAtRealMs','marketClock','automation']) ||
      !safe(run.startedAtRealMs) || run.startedAtRealMs > now + 5 * 60_000 ||
      !record(run.marketClock) || !keys(run.marketClock, ['simulatedAtMs','realAnchorMs','selectedSpeed']) ||
      !safe(run.marketClock.realAnchorMs) || run.marketClock.realAnchorMs > now + 5 * 60_000 ||
      !safe(run.marketClock.simulatedAtMs) || !speed(run.marketClock.selectedSpeed) ||
      !validAutomation(run.automation)) return null
  const history = progress.history as AscensionCycleSummary[]
  if (history.length > 0 && run.startedAtRealMs < history[history.length - 1]!.completedAtRealMs) return null
  return {
    progress: {
      availablePoints: progress.availablePoints,
      lifetimePoints: progress.lifetimePoints,
      prestigeCount: progress.prestigeCount,
      upgradeLevels: { ...(progress.upgradeLevels as AscensionProgress['upgradeLevels']) },
      highestFameAwardedLevel: progress.highestFameAwardedLevel,
      history: history.map(item => ({ ...item })),
    },
    run: {
      startedAtRealMs: run.startedAtRealMs,
      marketClock: { ...(run.marketClock as AscensionRunState['marketClock']) },
      automation: {
        ...(run.automation as AscensionAutomationSettings),
        allowedAssetIds: [...(run.automation as AscensionAutomationSettings).allowedAssetIds],
      },
    },
  }
}
