import assert from 'node:assert/strict'
import test from 'node:test'
import { CAPITAL_SAVE_VERSION, createCapitalState, restoreCapitalState } from './capital.ts'
import { loadCapitalState, saveCapitalState } from './persistence.ts'
import { createInitialTradingState, restoreTradingState } from './trading/state.ts'

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

test('une partie neuve possède un seul solde, une seed et un trading vide', () => {
  const state = createCapitalState(undefined, NOW)
  assert.equal(state.version, CAPITAL_SAVE_VERSION)
  assert.deepEqual(state.game, { balance: 0, lifetimeEarned: 0, purchasedUpgrades: 0 })
  assert.equal(state.trading.lastTickAt, NOW)
  assert.ok(state.trading.seed > 0)
  assert.deepEqual(state.trading.positions, {})
  assert.deepEqual(state.trading.news, [])
  assert.equal('balance' in state.trading, false)
})

test('les données de trading sauvegardées sont restaurées sans changer le portefeuille monétaire', () => {
  const state = createCapitalState({ balance: 140, lifetimeEarned: 200, purchasedUpgrades: 1 }, NOW)
  state.trading.seed = 1234
  state.trading.positions['bitcoin'] = { quantity: 0.25, costBasis: 60 }
  state.trading.quotes['bitcoin'] = { price: 240, momentum: -0.02, dividendYield: null, updatedAt: NOW }
  state.trading.history['bitcoin'] = [{ at: NOW - 5_000, price: 230 }, { at: NOW, price: 240 }]
  const restored = restoreCapitalState(JSON.parse(JSON.stringify(state)), NOW + 10_000)
  assert.deepEqual(restored, state)
})

test('un Trading corrompu est écarté sans effacer l argent ni le niveau du clicker', () => {
  const state = createCapitalState({ balance: 90, lifetimeEarned: 120, purchasedUpgrades: 1 }, NOW)
  state.trading.seed = 0
  const restored = restoreCapitalState(state, NOW)
  assert.deepEqual(restored.game, state.game)
  assert.deepEqual(restored.trading.positions, {})
  assert.ok(restored.trading.seed > 0)
  assert.equal(restoreCapitalState(null, NOW).game.balance, 0)
})

test('les prix et historiques invalides sont rejetés à la restauration', () => {
  const trading = createInitialTradingState(NOW, 7)
  trading.quotes['bitcoin'] = { price: Number.POSITIVE_INFINITY, momentum: 0, dividendYield: null, updatedAt: NOW }
  const restored = restoreTradingState(trading, NOW)
  assert.deepEqual(restored.quotes, {})
  const history = createInitialTradingState(NOW, 7)
  history.history['bitcoin'] = [{ at: NOW, price: 100 }, { at: NOW - 5_000, price: 120 }]
  assert.deepEqual(restoreTradingState(history, NOW).history, {})
})

test('migration v3 vers v4 : aucune perte du solde, du cumul ni des améliorations', () => {
  withStorage((storage) => {
    const oldGame = { balance: 50, lifetimeEarned: 75, purchasedUpgrades: 2 }
    storage.set('capital-idle-save-v3', JSON.stringify(oldGame))
    const current = loadCapitalState(NOW)
    assert.deepEqual(current.game, oldGame)
    assert.equal(current.version, 4)
    assert.equal(current.trading.lastTickAt, NOW)
    assert.deepEqual(JSON.parse(storage.get('capital-idle-save-v3')!), oldGame)
    assert.deepEqual(JSON.parse(storage.get('capital-idle-save-v4')!).game, oldGame)
  })
})

test('les anciennes sauvegardes v1 et v2 restent migrables vers v4', () => {
  for (const version of [1, 2]) {
    withStorage((storage) => {
      storage.set(`capital-idle-save-v${version}`, JSON.stringify({
        balance: 50, lifetimeEarned: 100, purchasedUpgrades: 1,
      }))
      const migrated = loadCapitalState(NOW)
      assert.equal(migrated.game.balance, 50)
      assert.equal(migrated.game.lifetimeEarned, 100)
      assert.equal(migrated.game.purchasedUpgrades, 1)
      assert.ok(storage.has('capital-idle-save-v4'))
    })
  }
})

test('le solde et les positions sauvegardés en v4 survivent à la réouverture', () => {
  withStorage(() => {
    const state = createCapitalState({ balance: 35, lifetimeEarned: 100, purchasedUpgrades: 1 }, NOW)
    state.trading.positions['nvideo'] = { quantity: 2, costBasis: 40 }
    saveCapitalState(state)
    assert.deepEqual(loadCapitalState(NOW + 600_000), state)
  })
})
