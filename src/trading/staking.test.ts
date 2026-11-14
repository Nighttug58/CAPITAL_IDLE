import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState } from '../capital.ts'
import { creditExperience } from '../prestige/state.ts'
import { performPrestige } from '../ascension/engine.ts'
import { buyAscensionUpgrade } from '../ascension/shop.ts'
import { selectMarketSpeed } from '../ascension/market-effects.ts'
import { buyAsset, sellAsset, getPortfolio, getQuickQuantity } from './trades.ts'
import { createSaveExport, prepareSaveImport } from '../save-transfer.ts'
import {
  STAKABLE_CRYPTOS, STAKING_COMPOUND_MS, STAKING_OFFLINE_CAP_MS, STAKING_UNLOCK_MS,
  stakingBaseRate, stakingRate, getStakingEntry, liquidCryptoQuantity,
  liquidRewardQuantity, settleStaking, changeStaking,
} from './staking.ts'
import type { CapitalState } from '../capital.ts'

const NOW = 1_800_000_000_000
const HOUR = 60 * 60_000
const DAY = HOUR * 24

function withStaking(compound = false): CapitalState {
  const wealth = compound ? 2_000_000_000 : 1_000_000_000
  const start = createCapitalState({ balance: wealth, lifetimeEarned: wealth, purchasedUpgrades: 0 }, NOW)
  const cycle = performPrestige(start, NOW)
  assert.ok(cycle.ok)
  const staking = buyAscensionUpgrade(cycle.state, 'crypto-staking', 0)
  assert.ok(staking.ok)
  let prepared = staking.state
  if (compound) {
    const autoc = buyAscensionUpgrade(prepared, 'auto-compound', 0)
    assert.ok(autoc.ok)
    prepared = autoc.state
  }
  // Valid fixture for newly earned run income: both the wallet and the XP
  // ledger receive real-run income, while the global Fame record survives.
  const earned = creditExperience(prepared, 100_000 * 100)
  assert.ok(earned)
  return {
    ...earned,
    game: { ...earned.game, balance: 100_000, lifetimeEarned: 100_000 },
    stats: { ...earned.stats,
      earnedBySource: { ...earned.stats.earnedBySource, unclassified: 100_000 },
    },
  }
}

function owned(state: CapitalState, qty = 10): CapitalState {
  const result = buyAsset(state, 'ethereum', qty)
  assert.ok(result.ok, !result.ok ? result.error : 'buy')
  return result.state
}
function deposit(state: CapitalState, qty = 10, at = NOW): CapitalState {
  const result = changeStaking(state, 'deposit', 'ethereum', qty, at)
  assert.ok(result.ok, !result.ok ? result.error : 'deposit')
  return result.state
}

test('Catalogue : neuf cryptos stakables, trois paliers, aucun memecoin ni BTC', () => {
  assert.equal(STAKABLE_CRYPTOS.length, 9)
  assert.ok(STAKABLE_CRYPTOS.every(asset => asset.kind === 'crypto'))
  assert.equal(stakingBaseRate('ethereum'), 0.02)
  assert.equal(stakingBaseRate('solana'), 0.04)
  assert.equal(stakingBaseRate('avalanche'), 0.06)
  assert.equal(stakingBaseRate('bitcoin'), 0)
  assert.equal(stakingBaseRate('dogecoin'), 0)
  assert.equal(STAKING_UNLOCK_MS, 5 * 60_000)
  assert.equal(STAKING_OFFLINE_CAP_MS, DAY)
  assert.equal(STAKING_COMPOUND_MS, 10 * 60_000)
})

test('Dépôt verrouille les coins, n’altère ni cash, ni Fame, ni valeur patrimoniale', () => {
  const purchased = owned(withStaking())
  const wealthBefore = getPortfolio(purchased).netWorth
  const fameBefore = purchased.prestige.fameMicros
  const deposited = deposit(purchased)
  assert.equal(getStakingEntry(deposited, 'ethereum').locked, 10)
  assert.equal(liquidCryptoQuantity(deposited, 'ethereum'), 0)
  assert.equal(getPortfolio(deposited).netWorth, wealthBefore)
  assert.equal(deposited.prestige.fameMicros, fameBefore)
  assert.equal(deposited.fiscal.taxesDueCents, 0)
  assert.equal(deposited.game.balance, purchased.game.balance)
  assert.equal(getQuickQuantity(deposited, 'ethereum', 'sell', 1), 0)
  const blocked = sellAsset(deposited, 'ethereum', 2)
  assert.equal(blocked.ok, false)
  if (!blocked.ok) assert.equal(blocked.error, 'staked-holdings')
})

test('Récompense 0,02 %/h en coins ; lot à coût zéro : XP/taxe uniquement à la vente', () => {
  const staked = deposit(owned(withStaking()))
  const basis = staked.trading.positions.ethereum!.costBasis
  const previousXp = staked.prestige.experienceCents
  const next = settleStaking(staked, NOW + HOUR)
  const earned = getStakingEntry(next, 'ethereum')
  assert.ok(Math.abs(earned.lifetimeRewards - 0.002) < 1e-8)
  assert.equal(earned.locked, 10)
  assert.equal(earned.rewardHeld, earned.lifetimeRewards)
  assert.equal(next.trading.positions.ethereum!.costBasis, basis)
  assert.ok(Math.abs(next.trading.positions.ethereum!.quantity - 10.002) < 1e-8)
  assert.ok(Math.abs(liquidRewardQuantity(next, 'ethereum') - 0.002) < 1e-8)
  assert.equal(next.game.balance, staked.game.balance)
  assert.equal(next.prestige.experienceCents, previousXp)
  assert.equal(next.fiscal.taxesDueCents, 0)
  const sale = sellAsset(next, 'ethereum', 0.002)
  assert.ok(sale.ok)
  assert.ok(sale.receipt.netRealizedProfit > 0)
  assert.ok(sale.receipt.levelEarnings > 0)
  assert.ok(sale.receipt.taxAccrued > 0)
  assert.equal(sale.state.trading.positions.ethereum!.costBasis, basis)
  assert.equal(getStakingEntry(sale.state, 'ethereum').rewardHeld, 0)
  assert.equal(getStakingEntry(sale.state, 'ethereum').locked, 10)
})

test('Retrait différé cinq minutes : impossible de vendre et de redemander avant échéance', () => {
  const staked = deposit(owned(withStaking()))
  const withdrawal = changeStaking(staked, 'withdraw', 'ethereum', 4, NOW)
  assert.ok(withdrawal.ok)
  assert.equal(withdrawal.receipt.unlockAt, NOW + STAKING_UNLOCK_MS)
  assert.equal(getStakingEntry(withdrawal.state, 'ethereum').locked, 6)
  assert.equal(getStakingEntry(withdrawal.state, 'ethereum').unlocking, 4)
  assert.equal(liquidCryptoQuantity(withdrawal.state, 'ethereum'), 0)
  const repeated = changeStaking(withdrawal.state, 'withdraw', 'ethereum', 1, NOW)
  assert.equal(repeated.ok, false)
  if (!repeated.ok) assert.equal(repeated.error, 'withdraw-pending')
  const premature = settleStaking(withdrawal.state, NOW + STAKING_UNLOCK_MS - 1000)
  assert.equal(getStakingEntry(premature, 'ethereum').unlocking, 4)
  const matured = settleStaking(premature, NOW + STAKING_UNLOCK_MS)
  assert.equal(getStakingEntry(matured, 'ethereum').unlocking, 0)
  assert.equal(getStakingEntry(matured, 'ethereum').unlockAt, null)
  assert.ok(liquidCryptoQuantity(matured, 'ethereum') >= 4)
  const sale = sellAsset(matured, 'ethereum', 4)
  assert.ok(sale.ok)
})

test('Hors ligne : plafond 24 heures et reprise idempotente, sans double récompense', () => {
  const staked = deposit(owned(withStaking()))
  const later = settleStaking(staked, NOW + 30 * DAY)
  const earned = getStakingEntry(later, 'ethereum').lifetimeRewards
  assert.ok(Math.abs(earned - 10 * 0.0002 * 24) < 1e-7)
  assert.equal(later.trading.staking?.lastAccruedAt, NOW + 30 * DAY)
  assert.strictEqual(settleStaking(later, NOW + 30 * DAY), later)
  const next = settleStaking(later, NOW + 30 * DAY + HOUR)
  const delta = getStakingEntry(next, 'ethereum').lifetimeRewards - earned
  assert.ok(Math.abs(delta - 0.002) < 2e-8)
})

test('Autocompound : récompenses réinvesties toutes les dix minutes réelles', () => {
  const staked = deposit(owned(withStaking(true)))
  const minute9 = settleStaking(staked, NOW + 9 * 60_000)
  const before = getStakingEntry(minute9, 'ethereum')
  assert.equal(before.locked, 10)
  assert.ok(before.awaitingCompound > 0)
  assert.equal(liquidCryptoQuantity(minute9, 'ethereum'), 0)
  const minute10 = settleStaking(minute9, NOW + STAKING_COMPOUND_MS)
  const after = getStakingEntry(minute10, 'ethereum')
  assert.ok(after.locked > 10)
  assert.equal(after.awaitingCompound, 0)
  assert.ok(Math.abs(after.rewardLocked - after.rewardHeld) < 1e-8)
  assert.equal(liquidCryptoQuantity(minute10, 'ethereum'), 0)
  assert.equal(minute10.fiscal.taxesDueCents, 0)
  assert.equal(minute10.trading.positions.ethereum?.costBasis, staked.trading.positions.ethereum?.costBasis)
  const again = settleStaking(minute10, NOW + 2 * STAKING_COMPOUND_MS)
  assert.ok(getStakingEntry(again, 'ethereum').locked > after.locked)
})

test('Accélérateur ×5 n’altère pas le staking en temps réel', () => {
  const initial = owned(withStaking())
  const upgrade = buyAscensionUpgrade(initial, 'time-accelerator', 0)
  assert.ok(upgrade.ok)
  const enabled = selectMarketSpeed(upgrade.state, 1.5, NOW)
  assert.ok(enabled.ok)
  const normal = deposit(initial)
  const faster = deposit(enabled.state)
  const norm = settleStaking(normal, NOW + HOUR)
  const accelerated = settleStaking(faster, NOW + HOUR)
  assert.equal(getStakingEntry(norm, 'ethereum').lifetimeRewards,
    getStakingEntry(accelerated, 'ethereum').lifetimeRewards)
})


test('News et cours : staking maintenu, revenus en coins fixes et valeur patrimoniale variable', () => {
  const placed = deposit(owned(withStaking()))
  const quote = placed.trading.quotes.ethereum?.price ?? 1965
  const event = {
    id: 'news-staking', templateId: 'crypto-upgrade', startedAt: NOW,
    endsAt: NOW + 30 * 60_000, affectedAssetIds: ['ethereum'],
    impact: 0.8, phase: 'active' as const,
  }
  const noisy = { ...placed, trading: {
    ...placed.trading, news: [event],
    quotes: { ...placed.trading.quotes,
      ethereum: {
        price: quote * 1.5, momentum: 0, dividendYield: null, updatedAt: NOW,
      },
    },
  }}
  const before = getPortfolio(placed).netWorth
  const after = getPortfolio(noisy).netWorth
  assert.ok(after > before, 'capital verrouillé revalorisé une seule fois')
  const quietRewards = settleStaking(placed, NOW + HOUR)
  const newsRewards = settleStaking(noisy, NOW + HOUR)
  assert.equal(getStakingEntry(quietRewards, 'ethereum').lifetimeRewards,
    getStakingEntry(newsRewards, 'ethereum').lifetimeRewards)
  assert.equal(newsRewards.fiscal.taxesDueCents, placed.fiscal.taxesDueCents)
  assert.equal(newsRewards.game.balance, placed.game.balance)
})

test('Rendement +10 % par niveau, maximum ×2 : aucune monnaie gagnée à l’achat', () => {
  let prepared = withStaking(true)
  const oldCash = prepared.game.balance
  assert.equal(stakingRate(prepared, 'ethereum'), 0.02)
  const purchase = buyAscensionUpgrade(prepared, 'staking-yield', 0)
  assert.ok(purchase.ok)
  prepared = purchase.state
  assert.ok(Math.abs(stakingRate(prepared, 'ethereum') - 0.022) < 1e-12)
  assert.equal(prepared.game.balance, oldCash)
  assert.equal(prepared.trading.positions.ethereum, undefined)
})

test('Rejets : Bitcoin, memecoin, staking non débloqué, double dépôt et quantités invalides', () => {
  const plain = createCapitalState(undefined, NOW)
  assert.equal(changeStaking(plain, 'deposit', 'ethereum', 1, NOW).ok, false)
  const prepared = owned(withStaking())
  assert.equal(changeStaking(prepared, 'deposit', 'bitcoin', 1, NOW).ok, false)
  assert.equal(changeStaking(prepared, 'deposit', 'dogecoin', 1, NOW).ok, false)
  assert.equal(changeStaking(prepared, 'deposit', 'ethereum', -1, NOW).ok, false)
  assert.equal(changeStaking(prepared, 'deposit', 'ethereum', 1.000000001, NOW).ok, false)
  assert.equal(changeStaking(prepared, 'deposit', 'ethereum', 20, NOW).ok, false)
  const staked = deposit(prepared)
  assert.equal(changeStaking(staked, 'deposit', 'ethereum', 1, NOW).ok, false)
  assert.equal(changeStaking(staked, 'withdraw', 'ethereum', 11, NOW).ok, false)
})

test('Sauvegarde JSON v7 : coins non dupliqués, champs invalides rejetés, historique pré-staking migré', () => {
  const staked = deposit(owned(withStaking()))
  const accrued = settleStaking(staked, NOW + HOUR)
  const exported = prepareSaveImport(createSaveExport(accrued, NOW + HOUR), NOW + HOUR)
  assert.ok(exported.ok)
  assert.deepEqual(exported.preview.state, accrued)
  assert.deepEqual(restoreCapitalState(accrued, NOW + HOUR), accrued)
  const forged = structuredClone(accrued)
  forged.trading.staking!.positions.ethereum!.locked = 200
  assert.deepEqual(prepareSaveImport(JSON.stringify(forged), NOW + HOUR), { ok: false, error: 'invalid-save' })
  const old = createCapitalState(undefined, NOW)
  delete old.trading.staking
  const migrated = prepareSaveImport(JSON.stringify(old), NOW)
  assert.ok(migrated.ok)
  assert.deepEqual(migrated.preview.state.trading.staking!.positions, {})
})

test('Prestige supprime les locks de ce run sans effacer les PP ni le Fame', () => {
  let state = deposit(owned(withStaking()))
  const xp = creditExperience(state, 200_000_000 * 100)
  assert.ok(xp)
  state = {
    ...xp, game: { ...xp.game, balance: 200_000_000, lifetimeEarned: 200_000_000 },
  }
  const reset = performPrestige(state, NOW)
  assert.ok(reset.ok)
  assert.deepEqual(reset.state.trading.staking?.positions, {})
  assert.equal(reset.state.trading.positions.ethereum, undefined)
  assert.equal(reset.state.ascension.progress.upgradeLevels['crypto-staking'], 1)
  assert.equal(reset.state.prestige.fameMicros, state.prestige.fameMicros)
})
