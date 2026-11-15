import type { CapitalState } from '../capital.ts'
import { ASCENSION_UPGRADES, ascensionSpentPoints, nextAscensionCost } from './catalog.ts'
import { ASCENSION_PRESENTATION } from './presentation.ts'
import type { AscensionUpgradeId } from './contracts.ts'

export type AscensionShopError =
  | 'unknown-upgrade' | 'invalid-state' | 'stale-level'
  | 'max-level' | 'insufficient-points' | 'storage-error'

export interface AscensionOffer {
  readonly id: AscensionUpgradeId
  readonly currentLevel: number
  readonly maxLevel: number
  readonly nextCost: number | null
  readonly canAfford: boolean
}

export interface AscensionPurchaseReceipt {
  readonly upgradeId: AscensionUpgradeId
  readonly previousLevel: number
  readonly newLevel: number
  readonly costPoints: number
  readonly remainingPoints: number
}

export type AscensionPurchase =
  | { readonly ok: true; readonly state: CapitalState; readonly receipt: AscensionPurchaseReceipt }
  | { readonly ok: false; readonly state: CapitalState; readonly error: AscensionShopError }

function reject(state: CapitalState, error: AscensionShopError): AscensionPurchase {
  return { ok: false, state, error }
}

/** A fixed-price catalog makes the entire PP spending ledger derivable. */
export function validAscensionShopLedger(state: CapitalState): boolean {
  const progress = state.ascension?.progress
  if (!progress || !Number.isSafeInteger(progress.availablePoints) ||
      !Number.isSafeInteger(progress.lifetimePoints) ||
      progress.availablePoints < 0 || progress.lifetimePoints < 0 ||
      progress.availablePoints > progress.lifetimePoints) return false
  const spent = ascensionSpentPoints(progress.upgradeLevels)
  return spent !== null && progress.lifetimePoints - progress.availablePoints === spent
}

export function getAscensionOffers(state: CapitalState): readonly AscensionOffer[] {
  const valid = validAscensionShopLedger(state)
  return ASCENSION_UPGRADES.map(item => {
    const currentLevel = valid ? state.ascension.progress.upgradeLevels[item.id] : 0
    const nextCost = valid ? nextAscensionCost(item.id, currentLevel) : null
    return {
      id: item.id,
      currentLevel,
      maxLevel: item.maxLevel,
      nextCost,
      canAfford: valid && nextCost !== null && state.ascension.progress.availablePoints >= nextCost,
    }
  })
}

export function buyAscensionUpgrade(
  state: CapitalState, id: string, expectedLevel: number,
): AscensionPurchase {
  const info = ASCENSION_PRESENTATION.find(item => item.id === id)
  const upgrade = ASCENSION_UPGRADES.find(item => item.id === id)
  if (!info || !upgrade || id === 'market-liquidity' || id === 'liquidity-recovery') return reject(state, 'unknown-upgrade')
  if (!validAscensionShopLedger(state)) return reject(state, 'invalid-state')
  if (!Number.isSafeInteger(expectedLevel) || expectedLevel < 0 ||
      state.ascension.progress.upgradeLevels[upgrade.id] !== expectedLevel) {
    return reject(state, 'stale-level')
  }
  const costPoints = nextAscensionCost(id, expectedLevel)
  if (costPoints === null) return reject(state, 'max-level')
  const available = state.ascension.progress.availablePoints
  if (available < costPoints) return reject(state, 'insufficient-points')
  const updated = {
    ...state,
    ascension: {
      ...state.ascension,
      progress: {
        ...state.ascension.progress,
        availablePoints: available - costPoints,
        upgradeLevels: {
          ...state.ascension.progress.upgradeLevels, [upgrade.id]: expectedLevel + 1,
        },
      },
    },
  }
  return {
    ok: true, state: updated,
    receipt: {
      upgradeId: upgrade.id, previousLevel: expectedLevel,
      newLevel: expectedLevel + 1, costPoints,
      remainingPoints: available - costPoints,
    },
  }
}
