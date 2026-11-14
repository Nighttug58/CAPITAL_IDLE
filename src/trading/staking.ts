import type { CapitalState } from '../capital.ts'
import { ASSETS, getAsset } from './catalog.ts'
import type { Position, StakingEntry, StakingState } from './types.ts'

export const STAKING_UNLOCK_MS = 5 * 60_000
export const STAKING_OFFLINE_CAP_MS = 24 * 60 * 60_000
export const STAKING_COMPOUND_MS = 10 * 60_000
const HOUR_MS = 60 * 60_000

// Fictional per-real-hour percentages, unrelated to blockchain APR.
const RATE_BY_CRYPTO = {
  ethereum: 0.02, bnb: 0.02, tron: 0.02,
  solana: 0.04, cardano: 0.04, chainlink: 0.04,
  avalanche: 0.06, sui: 0.06, uniswap: 0.06,
} as const
export const STAKABLE_CRYPTOS = Object.freeze(
  ASSETS.filter(asset => asset.kind === 'crypto' && Object.prototype.hasOwnProperty.call(RATE_BY_CRYPTO, asset.id)),
)
export function stakingBaseRate(id: string): number {
  return RATE_BY_CRYPTO[id as keyof typeof RATE_BY_CRYPTO] ?? 0
}
export function stakingRate(state: CapitalState, id: string): number {
  return stakingBaseRate(id) * (1 + state.ascension.progress.upgradeLevels['staking-yield'] * 0.1)
}

export function createInitialStakingState(at: number): StakingState {
  return { lastAccruedAt: at, positions: {} }
}
function isValidTime(x: unknown): x is number {
  return typeof x === 'number' && Number.isSafeInteger(x) && x >= 0
}
function validQuantity(x: unknown, decimals: number): x is number {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) return false
  const u = x * 10 ** decimals
  return Number.isFinite(u) && Math.abs(u - Math.round(u)) < 0.0001
}
function trimQuantity(x: number, decimals: number): number {
  const mul = 10 ** decimals
  return Math.round(x * mul) / mul
}
function emptyEntry(): StakingEntry {
  return {
    locked: 0, unlocking: 0, unlockAt: null, awaitingCompound: 0,
    rewardHeld: 0, rewardLocked: 0, rewardUnlocking: 0,
    carryUnits: 0, lifetimeRewards: 0,
  }
}
export function getStakingEntry(state: CapitalState, id: string): StakingEntry {
  return state.trading.staking?.positions[id] ?? emptyEntry()
}
export function liquidCryptoQuantity(state: CapitalState, id: string): number {
  const asset = getAsset(id)
  const position = state.trading.positions[id]
  if (!asset || !position) return 0
  const entry = state.trading.staking?.positions[id]
  if (!entry) return position.quantity
  return Math.max(0, trimQuantity(
    position.quantity - entry.locked - entry.unlocking - entry.awaitingCompound,
    asset.quantityDecimals,
  ))
}

/** Reward units are sold first at zero cost basis, but never if locked. */
export function liquidRewardQuantity(state: CapitalState, id: string): number {
  const asset = getAsset(id)
  const entry = state.trading.staking?.positions[id]
  if (!asset || !entry) return 0
  return Math.max(0, trimQuantity(
    entry.rewardHeld - entry.rewardLocked - entry.rewardUnlocking - entry.awaitingCompound,
    asset.quantityDecimals,
  ))
}

/**
 * Validate locked holdings *against the single authoritative trading position*.
 * Never add staked holdings to Stats/portfolio a second time.
 */
export function validStakingState(raw: unknown, holdings: Record<string, Position>): raw is StakingState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const state = raw as Record<string, unknown>
  if (Object.keys(state).length !== 2 || !isValidTime(state.lastAccruedAt) ||
      !state.positions || typeof state.positions !== 'object' || Array.isArray(state.positions)) return false
  const entries = Object.entries(state.positions as Record<string, unknown>)
  const last = state.lastAccruedAt as number
  if (entries.length > STAKABLE_CRYPTOS.length) return false
  return entries.every(([id, rawEntry]) => {
    const asset = getAsset(id)
    if (!asset || !stakingBaseRate(id) || !rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) return false
    const entry = rawEntry as Record<string, unknown>
    if (Object.keys(entry).length !== 9 ||
        !validQuantity(entry.locked, asset.quantityDecimals) ||
        !validQuantity(entry.unlocking, asset.quantityDecimals) ||
        !validQuantity(entry.awaitingCompound, asset.quantityDecimals) ||
        !validQuantity(entry.rewardHeld, asset.quantityDecimals) ||
        !validQuantity(entry.rewardLocked, asset.quantityDecimals) ||
        !validQuantity(entry.rewardUnlocking, asset.quantityDecimals) ||
        !validQuantity(entry.lifetimeRewards, asset.quantityDecimals) ||
        typeof entry.carryUnits !== 'number' || !Number.isFinite(entry.carryUnits) ||
        entry.carryUnits < 0 || entry.carryUnits >= 1 ||
        !(entry.unlockAt === null || isValidTime(entry.unlockAt))) return false
    const totalReserved = entry.locked + entry.unlocking + entry.awaitingCompound
    const owned = holdings[id]?.quantity ?? 0
    const tolerance = 0.5 / 10 ** asset.quantityDecimals
    return totalReserved <= owned + tolerance && totalReserved <= asset.totalSupply + tolerance &&
      entry.rewardHeld <= owned + tolerance &&
      entry.rewardLocked <= entry.locked + tolerance &&
      entry.rewardUnlocking <= entry.unlocking + tolerance &&
      entry.rewardHeld + tolerance >=
        entry.rewardLocked + entry.rewardUnlocking + entry.awaitingCompound &&
      ((entry.unlocking === 0 && entry.unlockAt === null && entry.rewardUnlocking === 0) ||
       (entry.unlocking > 0 && typeof entry.unlockAt === 'number' &&
        entry.unlockAt >= last))
  })
}

/** A passive income accumulator only; no clicks, XP, USD or tax at mint time.
 * One invocation catches up at most 24 REAL hours and then advances its cursor
 * to now. Compounding uses real 10-minute boundaries, never virtual ticks.
 */
export function settleStaking(state: CapitalState, at: number): CapitalState {
  const source = state.trading.staking
  if (state.ascension.progress.upgradeLevels['crypto-staking'] < 1 ||
      !source || !Object.keys(source.positions).length) return state
  if (!isValidTime(at) || at <= source.lastAccruedAt) return state
  const start = Math.max(source.lastAccruedAt, at - STAKING_OFFLINE_CAP_MS)
  const autoCompound = state.ascension.progress.upgradeLevels['auto-compound'] > 0
  const level = state.ascension.progress.upgradeLevels['staking-yield']
  const locks: Record<string, StakingEntry> = {}
  const positions = { ...state.trading.positions }

  for (const [id, old] of Object.entries(source.positions)) {
    const asset = getAsset(id)
    const owned = positions[id]
    if (!asset || !owned) {
      // Corrupt entries are handled at import boundaries, never mint a token.
      if (!asset || old.locked || old.unlocking || old.awaitingCompound) return state
      locks[id] = old
      continue
    }
    const mult = 10 ** asset.quantityDecimals
    let current = { ...old }
    let quantity = owned.quantity
    let previous = start
    const ratePerHour = (stakingBaseRate(id) / 100) * (1 + level * 0.1)

    while (previous < at) {
      const compoundBoundary = (Math.floor(previous / STAKING_COMPOUND_MS) + 1) * STAKING_COMPOUND_MS
      const end = Math.min(at, compoundBoundary)
      const delta = end - previous
      const rawUnits = current.locked * ratePerHour * delta / HOUR_MS * mult + current.carryUnits
      if (!Number.isFinite(rawUnits) || rawUnits > Number.MAX_SAFE_INTEGER) return state
      const rewardUnits = Math.floor(rawUnits + 1e-9)
      const capacityUnits = Math.max(0, Math.floor((asset.totalSupply - quantity) * mult + 1e-6))
      const mintUnits = Math.min(rewardUnits, capacityUnits)
      if (!Number.isSafeInteger(mintUnits)) return state
      if (mintUnits > 0) {
        const minted = mintUnits / mult
        quantity = trimQuantity(quantity + minted, asset.quantityDecimals)
        if (!Number.isFinite(quantity) || quantity > asset.totalSupply + 1 / mult) return state
        current.lifetimeRewards = trimQuantity(current.lifetimeRewards + minted, asset.quantityDecimals)
        current.rewardHeld = trimQuantity(current.rewardHeld + minted, asset.quantityDecimals)
        if (autoCompound) {
          current.awaitingCompound = trimQuantity(current.awaitingCompound + minted, asset.quantityDecimals)
        }
      }
      current.carryUnits = Math.min(0.999999999999999, Math.max(0, rawUnits - rewardUnits))
      if (autoCompound && end === compoundBoundary && current.awaitingCompound > 0) {
        current.locked = trimQuantity(current.locked + current.awaitingCompound, asset.quantityDecimals)
        current.rewardLocked = trimQuantity(current.rewardLocked + current.awaitingCompound, asset.quantityDecimals)
        current.awaitingCompound = 0
      }
      previous = end
    }
    if (current.unlockAt !== null && at >= current.unlockAt) {
      current.unlocking = 0
      current.rewardUnlocking = 0
      current.unlockAt = null
    }
    if (autoCompound && current.awaitingCompound > 0 && previous === at &&
        at % STAKING_COMPOUND_MS === 0) {
      current.locked = trimQuantity(current.locked + current.awaitingCompound, asset.quantityDecimals)
      current.rewardLocked = trimQuantity(current.rewardLocked + current.awaitingCompound, asset.quantityDecimals)
      current.awaitingCompound = 0
    }
    positions[id] = quantity === owned.quantity ? owned : { ...owned, quantity }
    locks[id] = current
  }

  return {
    ...state,
    trading: {
      ...state.trading,
      positions,
      staking: { lastAccruedAt: at, positions: locks },
    },
  }
}

export type StakeError =
  | 'locked' | 'not-eligible' | 'invalid-quantity' | 'not-owned'
  | 'insufficient-liquid' | 'insufficient-staked' | 'withdraw-pending'
  | 'invalid-time' | 'storage-error'
export interface StakeReceipt {
  readonly assetId: string
  readonly action: 'deposit' | 'withdraw'
  readonly quantity: number
  readonly unlockAt: number | null
}
export type StakingResult =
  | { readonly ok: true; readonly state: CapitalState; readonly receipt: StakeReceipt }
  | { readonly ok: false; readonly state: CapitalState; readonly error: StakeError }
function reject(state: CapitalState, error: StakeError): StakingResult {
  return { ok: false, state, error }
}

export function changeStaking(
  state: CapitalState, action: 'deposit' | 'withdraw', id: string, quantity: number, at: number,
): StakingResult {
  if (state.ascension.progress.upgradeLevels['crypto-staking'] < 1) return reject(state, 'locked')
  const asset = getAsset(id)
  if (!asset || !stakingBaseRate(id)) return reject(state, 'not-eligible')
  if (!Number.isFinite(quantity) || quantity <= 0 ||
      !validQuantity(quantity, asset.quantityDecimals)) return reject(state, 'invalid-quantity')
  const previousTime = state.trading.staking?.lastAccruedAt ?? state.trading.dividendLastPaidAt
  if (!isValidTime(at) || at < previousTime ||
      at < state.trading.dividendLastPaidAt ||
      at < state.ascension.run.startedAtRealMs) return reject(state, 'invalid-time')
  const settled = settleStaking(state, at)
  const holder = settled.trading.positions[id]
  if (!holder || !holder.quantity) return reject(state, 'not-owned')
  const entry = getStakingEntry(settled, id)
  let updated: StakingEntry
  if (action === 'deposit') {
    if (quantity > liquidCryptoQuantity(settled, id) + 0.25 / 10 ** asset.quantityDecimals) {
      return reject(state, 'insufficient-liquid')
    }
    // Lock purchased units first, then any liquid reward units.
    const purchasedLiquid = Math.max(0, holder.quantity - entry.rewardHeld -
      (entry.locked - entry.rewardLocked) - (entry.unlocking - entry.rewardUnlocking))
    const rewardPart = Math.max(0, quantity - purchasedLiquid)
    updated = {
      ...entry, locked: trimQuantity(entry.locked + quantity, asset.quantityDecimals),
      rewardLocked: trimQuantity(entry.rewardLocked + rewardPart, asset.quantityDecimals),
    }
  } else {
    if (entry.unlocking > 0) return reject(state, 'withdraw-pending')
    if (quantity > entry.locked + 0.25 / 10 ** asset.quantityDecimals) return reject(state, 'insufficient-staked')
    const rewardedPart = Math.min(quantity, entry.rewardLocked)
    updated = {
      ...entry, locked: trimQuantity(entry.locked - quantity, asset.quantityDecimals),
      rewardLocked: trimQuantity(entry.rewardLocked - rewardedPart, asset.quantityDecimals),
      unlocking: quantity, rewardUnlocking: rewardedPart,
      unlockAt: at + STAKING_UNLOCK_MS,
    }
  }
  const timestamp = at
  return {
    ok: true,
    receipt: { assetId: id, action, quantity, unlockAt: updated.unlockAt },
    state: {
      ...settled,
      trading: {
        ...settled.trading,
        staking: {
          lastAccruedAt: timestamp,
          positions: { ...(settled.trading.staking?.positions ?? {}), [id]: updated },
        },
      },
    },
  }
}
