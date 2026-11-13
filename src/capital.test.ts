import assert from 'node:assert/strict'
import test from 'node:test'
import { CAPITAL_SAVE_VERSION, createCapitalState, restoreCapitalState } from './capital.ts'
import { purchaseUpgrade, restoreGame } from './game.ts'
import { loadCapitalState, saveCapitalState } from './persistence.ts'
import { FISCAL_PERIOD_MS, FISCAL_TAX_RATE } from './economy/state.ts'
import { createInitialTradingState, restoreTradingState } from './trading/state.ts'
import { buyAsset, getMaximumBuyQuantity } from './trading/trades.ts'

const NOW = 1_700_000_000_000

function withStorage(run: (values: Map<string, string>) => void): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    },
  })
  try {
    run(values)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
}

test('une partie neuve possède un solde unique, trading vide et états économiques v5', () => {
  const state = createCapitalState(undefined, NOW)
  assert.equal(state.version, 6)
  assert.equal(state.version, CAPITAL_SAVE_VERSION)
  assert.deepEqual(state.game, { balance: 0, lifetimeEarned: 0, purchasedUpgrades: 0 })
  assert.equal(state.trading.lastTickAt, NOW)
  assert.ok(state.trading.seed > 0)
  assert.deepEqual(state.trading.positions, {})
  assert.deepEqual(state.trading.news, [])
  assert.equal('balance' in state.trading, false)
  assert.equal('balance' in state.enterprises, false)
  assert.deepEqual(state.enterprises.owned, {})
  assert.equal(state.enterprises.lastAccruedAt, NOW)
  assert.equal(state.fiscal.periodStartedAt, NOW)
  assert.equal(state.fiscal.taxesDueCents, 0)
  assert.equal(state.fiscal.taxesPaidCents, 0)
  assert.equal(FISCAL_PERIOD_MS, 72 * 60 * 60 * 1000)
  assert.equal(FISCAL_TAX_RATE, 0.15) // Taux de gameplay provisoire, centralisé en passe 4.
  assert.equal(state.stats.startedAt, NOW)
  assert.equal(state.stats.earnedBySource.unclassified, 0)
})

test('le portefeuille et les nouveaux compteurs sont restaurés à l identique', () => {
  const original = createCapitalState({ balance: 140, lifetimeEarned: 200, purchasedUpgrades: 1 }, NOW)
  original.trading.seed = 1234
  original.trading.positions['bitcoin'] = { quantity: 0.25, costBasis: 60 }
  original.trading.quotes['bitcoin'] = { price: 240, momentum: -0.02, dividendYield: null, updatedAt: NOW }
  original.trading.history['bitcoin'] = [{ at: NOW - 5_000, price: 230 }, { at: NOW, price: 240 }]
  original.enterprises.owned['cafe'] = { level: 5, investedCents: 120_000 }
  const state = {
    ...original,
    fiscal: {
      ...original.fiscal, taxesDueCents: 225, taxesPaidCents: 120,
      dueBySourceCents: { ...original.fiscal.dueBySourceCents, enterprises: 225 },
      paidBySourceCents: { ...original.fiscal.paidBySourceCents, stocks: 120 },
    },
  }
  const restored = restoreCapitalState(JSON.parse(JSON.stringify(state)), NOW + 10_000)
  assert.deepEqual(restored, state)
  assert.equal(restored.game.balance, 140)
})

test('une section corrompue est isolée sans effacer le cash, ni les autres sections', () => {
  const state = createCapitalState({ balance: 90, lifetimeEarned: 120, purchasedUpgrades: 1 }, NOW)
  state.trading.seed = 0
  state.enterprises.owned['cafe'] = { level: 30, investedCents: 12_000 }
  const broken = {
    ...state,
    fiscal: { ...state.fiscal, taxesDueCents: 900 },
  }
  const restored = restoreCapitalState(broken, NOW)
  assert.deepEqual(restored.game, state.game)
  assert.deepEqual(restored.trading.positions, {})
  assert.ok(restored.trading.seed > 0)
  assert.deepEqual(restored.enterprises.owned, {})
  assert.equal(restored.fiscal.taxesDueCents, 0)
  assert.equal(restoreCapitalState(null, NOW).game.balance, 0)
})

test('les prix et historiques Trading invalides sont rejetés à la restauration', () => {
  const trading = createInitialTradingState(NOW, 7)
  trading.quotes['bitcoin'] = { price: Number.POSITIVE_INFINITY, momentum: 0, dividendYield: null, updatedAt: NOW }
  assert.deepEqual(restoreTradingState(trading, NOW).quotes, {})
  const history = createInitialTradingState(NOW, 7)
  history.history['bitcoin'] = [{ at: NOW, price: 100 }, { at: NOW - 5_000, price: 120 }]
  assert.deepEqual(restoreTradingState(history, NOW).history, {})
})

test('migration v4 vers v5 : trading préservé, taxes nulles, pas de gains historiques inventés', () => {
  withStorage((storage) => {
    const oldGame = { balance: 172.50, lifetimeEarned: 300, purchasedUpgrades: 2 }
    const legacy = createCapitalState(oldGame, NOW - 60_000)
    legacy.trading.seed = 1234
    legacy.trading.positions['bitcoin'] = { quantity: .25, costBasis: 60 }
    legacy.trading.quotes['bitcoin'] = { price: 240, momentum: -.02, dividendYield: null, updatedAt: NOW - 60_000 }
    const previousV4 = { version: 4, game: oldGame, trading: legacy.trading }
    storage.set('capital-idle-save-v4', JSON.stringify(previousV4))
    const migrated = loadCapitalState(NOW)
    assert.equal(migrated.version, 6)
    assert.deepEqual(migrated.game, oldGame)
    assert.deepEqual(migrated.trading, legacy.trading)
    assert.deepEqual(migrated.enterprises.owned, {})
    assert.equal(migrated.fiscal.taxesDueCents, 0)
    assert.equal(migrated.fiscal.periodStartedAt, NOW)
    assert.equal(migrated.fiscal.periodStartedAt + FISCAL_PERIOD_MS, NOW + FISCAL_PERIOD_MS)
    assert.equal(migrated.stats.earnedBySource.unclassified, 300)
    assert.equal(migrated.stats.earnedBySource.clicks, 0)
    assert.deepEqual(JSON.parse(storage.get('capital-idle-save-v4')!), previousV4)
    assert.deepEqual(JSON.parse(storage.get('capital-idle-save-v6')!), migrated)
  })
})

test('migration v3 vers v5 : conservation du solde, du cumul et des améliorations', () => {
  withStorage((storage) => {
    const oldGame = { balance: 50, lifetimeEarned: 75, purchasedUpgrades: 2 }
    storage.set('capital-idle-save-v3', JSON.stringify(oldGame))
    const current = loadCapitalState(NOW)
    assert.deepEqual(current.game, oldGame)
    assert.equal(current.version, 6)
    assert.equal(current.trading.lastTickAt, NOW)
    assert.equal(current.fiscal.periodStartedAt, NOW)
    assert.deepEqual(JSON.parse(storage.get('capital-idle-save-v3')!), oldGame)
    assert.deepEqual(JSON.parse(storage.get('capital-idle-save-v6')!).game, oldGame)
  })
})

test('les anciennes sauvegardes v1 et v2 restent migrables vers v5', () => {
  for (const version of [1, 2]) {
    withStorage((storage) => {
      storage.set(`capital-idle-save-v${version}`, JSON.stringify({
        balance: 50, lifetimeEarned: 100, purchasedUpgrades: 1,
      }))
      const migrated = loadCapitalState(NOW)
      assert.equal(migrated.game.balance, 50)
      assert.equal(migrated.game.lifetimeEarned, 100)
      assert.equal(migrated.game.purchasedUpgrades, 1)
      assert.ok(storage.has('capital-idle-save-v6'))
    })
  }
})

test('la v5 est prioritaire sur une ancienne v4 même si le joueur a relancé une partie', () => {
  withStorage((storage) => {
    const old = createCapitalState({ balance: 1000, lifetimeEarned: 1000, purchasedUpgrades: 2 }, NOW)
    storage.set('capital-idle-save-v4', JSON.stringify({ version: 4, game: old.game, trading: old.trading }))
    const restarted = createCapitalState(undefined, NOW + 42)
    saveCapitalState(restarted)
    assert.deepEqual(loadCapitalState(NOW + 3_000), restarted)
    assert.equal(loadCapitalState(NOW + 3_000).game.balance, 0)
  })
})

test('v5 : un solde fiscal négatif survit au reload sans permettre des achats à crédit', () => {
  const original = createCapitalState({ balance: 100, lifetimeEarned: 100, purchasedUpgrades: 1 }, NOW)
  const negative = {
    ...original,
    game: { ...original.game, balance: -12.34 },
    fiscal: {
      ...original.fiscal, taxesPaidCents: 1234,
      paidBySourceCents: { ...original.fiscal.paidBySourceCents, enterprises: 1234 },
    },
  }
  assert.equal(restoreGame(negative.game).balance, 0) // ancien contrat refuse un découvert
  const restored = restoreCapitalState(JSON.parse(JSON.stringify(negative)), NOW + 1_000)
  assert.equal(restored.game.balance, -12.34)
  assert.equal(restored.game.lifetimeEarned, 100)
  assert.equal(getMaximumBuyQuantity(restored, 'nvideo'), 0)
  const order = buyAsset(restored, 'nvideo', 1)
  assert.equal(order.ok, false)
  if (!order.ok) assert.equal(order.error, 'insufficient-funds')
  assert.deepEqual(purchaseUpgrade(restored.game), restored.game)
  withStorage(() => {
    saveCapitalState(restored)
    assert.equal(loadCapitalState(NOW + 1_000).game.balance, -12.34)
  })
})

test('v5 : rejette les valeurs non sûres tout en conservant les sections valides', () => {
  const original = createCapitalState({ balance: 100, lifetimeEarned: 100, purchasedUpgrades: 0 }, NOW)
  const corruptMoney = { ...original, game: { ...original.game, balance: Number.NEGATIVE_INFINITY } }
  assert.equal(restoreCapitalState(corruptMoney, NOW).game.balance, 0)
  const corruptFiscal = { ...original, fiscal: { ...original.fiscal, taxesDueCents: -1 } }
  assert.equal(restoreCapitalState(corruptFiscal, NOW).fiscal.taxesDueCents, 0)
  const corruptStats = {
    ...original,
    stats: { ...original.stats, earnedBySource: { ...original.stats.earnedBySource, clicks: Number.NaN } },
  }
  const restored = restoreCapitalState(corruptStats, NOW)
  assert.equal(restored.stats.earnedBySource.unclassified, 100)
  assert.equal(restored.stats.earnedBySource.clicks, 0)
})
