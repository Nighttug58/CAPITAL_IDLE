import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, type CapitalState } from '../capital.ts'
import { getLevel, getLevelStartThreshold } from '../game.ts'
import { getCapitalStatsOverview } from '../economy/stats-overview.ts'
import { buyEnterprise } from '../economy/enterprises.ts'
import { getEnterprise } from '../economy/catalog.ts'
import { buyAsset } from '../trading/trades.ts'
import { buyCollectionItem } from '../prestige/collections.ts'
import {
  ASCENSION_MIN_WORTH_USD, ASCENSION_SHOP_EXPECTED_LEVELS,
  ASCENSION_SHOP_EXPECTED_TOTAL_PP, ASCENSION_UPGRADE_IDS,
  eligiblePrestigeWorthFromOverview, previewPrestigePoints,
} from './contracts.ts'

const NOW = 1_800_000_000_000

/** Scénarios de comptabilité seedés avec revenus acquis, PAS une simulation des heures jouées. */
function snapshot(grossEarned: number, enterpriseIds: readonly string[] = []): CapitalState {
  let state = createCapitalState({ balance: grossEarned, lifetimeEarned: grossEarned, purchasedUpgrades: 0 }, NOW)
  for (const id of enterpriseIds) {
    const purchase = buyEnterprise(state, id, NOW)
    assert.ok(purchase.ok, 'Entreprise éligible : ' + id)
    state = purchase.state
  }
  const collectible = buyCollectionItem(state, 'watches-01')
  assert.ok(collectible.ok)
  state = collectible.state
  const asset = buyAsset(state, 'nvideo', 1_000)
  assert.ok(asset.ok)
  return asset.state
}

function worth(state: CapitalState): number {
  const result = eligiblePrestigeWorthFromOverview(getCapitalStatsOverview(state))
  assert.notEqual(result, null)
  return result!
}

test('Prestige passe 1 : 18 identifiants uniques, budget 87 niveaux et 1637 PP réservé', () => {
  assert.equal(ASCENSION_UPGRADE_IDS.length, 18)
  assert.equal(new Set(ASCENSION_UPGRADE_IDS).size, 18)
  assert.equal(ASCENSION_SHOP_EXPECTED_LEVELS, 87)
  assert.equal(ASCENSION_SHOP_EXPECTED_TOTAL_PP, 1_637)
})

test('Calibrage niveau 100 : 17 537 564 XP ne débloquent pas à eux seuls 100 M$', () => {
  const xpAt100 = getLevelStartThreshold(100)
  assert.equal(xpAt100, 17_537_564)
  assert.equal(getLevel(xpAt100), 100)
  assert.equal(getEnterprise('kiosque')?.purchaseCostCents, 7_500_000)
  assert.equal(getEnterprise('entrepot')?.purchaseCostCents, 8_000_000_000)
  assert.equal(getEnterprise('laboratoire')?.purchaseCostCents, 120_000_000_000)
  const base = createCapitalState({ balance: xpAt100, lifetimeEarned: xpAt100, purchasedUpgrades: 0 }, NOW)
  assert.equal(worth(base), xpAt100)
  assert.equal(previewPrestigePoints(worth(base), 100), 0)
})

test('Assiette : cash + actions + entreprises - dette, MAIS sans collections permanentes', () => {
  const base = createCapitalState({ balance: 110_000_000, lifetimeEarned: 110_000_000, purchasedUpgrades: 0 }, NOW)
  const collection = buyCollectionItem(base, 'watches-01')
  assert.ok(collection.ok)
  const before = getCapitalStatsOverview(base)
  const after = getCapitalStatsOverview(collection.state)
  assert.equal(after.collectionBookValue, 2_500)
  assert.equal(after.netWorth, before.netWorth)
  assert.equal(eligiblePrestigeWorthFromOverview(after), 110_000_000 - 2_500)
})

test('Snapshots mixtes : 110 M$ -> 20 PP, environ 1 Md$ -> 63 PP, 1,6 Md$ -> ~80 PP', () => {
  const early = snapshot(110_000_000, ['kiosque', 'concession'])
  const middle = snapshot(1_000_000_000, ['usine', 'centre-commercial'])
  const advanced = snapshot(1_600_000_000, ['laboratoire', 'usine'])
  assert.ok(worth(early) > ASCENSION_MIN_WORTH_USD)
  assert.equal(previewPrestigePoints(worth(early), getLevel(early.prestige.experienceCents / 100)), 20)
  assert.equal(previewPrestigePoints(worth(middle), getLevel(middle.prestige.experienceCents / 100)), 63)
  assert.ok(previewPrestigePoints(worth(advanced), getLevel(advanced.prestige.experienceCents / 100)) >= 79)
  assert.ok(previewPrestigePoints(worth(advanced), getLevel(advanced.prestige.experienceCents / 100)) <= 80)
})

test('Projection : aucune PP pour état invalide / niveau insuffisant, arrondis sûrs', () => {
  assert.equal(previewPrestigePoints(ASCENSION_MIN_WORTH_USD, 99), 0)
  assert.equal(previewPrestigePoints(ASCENSION_MIN_WORTH_USD, 100), 20)
  assert.equal(previewPrestigePoints(400_000_000, 100), 40)
  assert.equal(previewPrestigePoints(900_000_000, 100), 60)
  assert.equal(previewPrestigePoints(10_000_000_000, 100), 200)
  assert.equal(previewPrestigePoints(Number.POSITIVE_INFINITY, 100), 0)
  assert.equal(previewPrestigePoints(Number.NaN, 100), 0)
  assert.equal(eligiblePrestigeWorthFromOverview({ netWorth: Number.NaN, collectionBookValue: 0 }), null)
  assert.equal(eligiblePrestigeWorthFromOverview({ netWorth: 50, collectionBookValue: -2 }), null)
})
