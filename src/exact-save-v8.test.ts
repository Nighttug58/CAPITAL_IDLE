import test from 'node:test'
import assert from 'node:assert/strict'
import { finiteNumberDecimal, projectValidatedV7ToExactV8, isValidV8ExactAmount } from './exact-save-v8.ts'
import type { CapitalState } from './capital.ts'

const fixture = (): CapitalState => ({
  version: 7,
  game: { balance: 1234.56, lifetimeEarned: 2000.23, purchasedUpgrades: 1 },
  trading: { schemaVersion: 1, seed: 1, lastTickAt: 100, nextNewsAt: null,
    quotes: {}, history: {}, positions: { tiny: { quantity: 0.2604, costBasis: 35.12 } },
    staking: { lastAccruedAt: 100, positions: { tiny: {
      locked: 0.1, unlocking: 0, unlockAt: null, awaitingCompound: 0, rewardHeld: 0,
      rewardLocked: 0, rewardUnlocking: 0, carryUnits: 0.5, lifetimeRewards: 0,
    } } }, news: [], realizedNetProfit: -1.24, creditedTradingProfit: 2.01,
    dividendCarry: 0.2, dividendPendingCents: 15, dividendLastPaidAt: 100 },
  enterprises: { owned: { kiosque: { level: 2, investedCents: 1_100_000 } },
    lastAccruedAt: 100, revenueCarryCents: 0.5 },
  fiscal: { periodStartedAt: 100, taxesDueCents: 30, taxesPaidCents: 20,
    dueBySourceCents: { enterprises: 30, stocks: 0, crypto: 0, memecoins: 0 },
    paidBySourceCents: { enterprises: 20, stocks: 0, crypto: 0, memecoins: 0 },
    enterpriseTaxRemainderBps: 0 },
  stats: { sourceTrackingVersion: 1, startedAt: 100, activePlayMs: 50, clickCount: 1,
    earnedBySource: { clicks: 1, dividends: 0, enterprises: 2, stocks: 0, crypto: 0, memecoins: 0, unclassified: 0 },
    realizedLossesBySource: { stocks: 0, crypto: 0, memecoins: 0 } },
  prestige: { experienceCents: 10_000, xpCurveVersion: 3, experienceCarryBps: 0,
    clickCarryBps: 0, tradingCarryBps: 0, lastAwardedLevel: 2,
    fameMicros: 3_000_000, lifetimeFameMicros: 3_000_000, levelFameMicros: 3_000_000,
    collectionFameMicros: 0, boosts: { click: 0, enterprise: 0, dividend: 0, xp: 0, trading: 0, fame: 0 },
    ownedCollectionIds: [] },
  ascension: { progress: { availablePoints: 20, lifetimePoints: 20, prestigeCount: 1,
    highestFameAwardedLevel: 100, upgradeLevels: {} as CapitalState['ascension']['progress']['upgradeLevels'],
    history: [{ cycle: 1, completedAtRealMs: 100, eligibleWorthCents: 10_000_000_000, earnedPoints: 20, levelAtCompletion: 100 }] },
    run: { startedAtRealMs: 100, marketClock: { simulatedAtMs: 100, realAnchorMs: 100, selectedSpeed: 1 },
      automation: { autoClickEnabled: false, investorEnabled: false, traderEnabled: false,
        enterpriseEnabled: false, allowedAssetIds: [], maxOrderCents: 0, cashReserveCents: 0 } } },
  achievements: { claimedIds: [], cycleGiftCents: 1234 },
})

test('V7 to V8 exact projection converts persisted ledgers without touching source', () => {
  const legacy = fixture()
  const before = JSON.stringify(legacy)
  const out = projectValidatedV7ToExactV8(legacy, id => id === 'tiny' ? 8 : null)
  assert.equal(out.version, 8)
  assert.equal((out.game as any).balance, '123456')
  assert.equal((out.game as any).lifetimeEarned, '200023')
  assert.equal((out.trading as any).positions.tiny.quantity, '26040000')
  assert.equal((out.trading as any).positions.tiny.costBasis, '3512')
  assert.equal((out.trading as any).staking.positions.tiny.locked, '10000000')
  assert.equal((out.trading as any).staking.positions.tiny.carryUnits, 0.5)
  assert.equal((out.trading as any).realizedNetProfit, '-124')
  assert.equal((out.enterprises as any).owned.kiosque.investedCents, '1100000')
  assert.equal((out.fiscal as any).taxesDueCents, '30')
  assert.equal((out.stats as any).earnedBySource.clicks, '100')
  assert.equal((out.prestige as any).fameMicros, '3000000')
  assert.equal((out.ascension as any).progress.lifetimePoints, '20')
  assert.equal((out.achievements as any).cycleGiftCents, '1234')
  assert.equal(JSON.stringify(legacy), before)
  assert.equal(typeof JSON.parse(JSON.stringify(out)).game.balance, 'string')
})

test('scientific numbers expand to valid decimal strings', () => {
  assert.equal(finiteNumberDecimal(0.00000001), '0.00000001')
  assert.equal(finiteNumberDecimal(1e21), '1000000000000000000000')
  assert.equal(finiteNumberDecimal(1.2e-8), '0.000000012')
  assert.equal(finiteNumberDecimal(Number.NaN), null)
})

test('invalid legacy values reject migration instead of silently truncating', () => {
  const legacy = fixture()
  assert.throws(() => projectValidatedV7ToExactV8({ ...legacy,
    game: { ...legacy.game, balance: Number.MAX_SAFE_INTEGER },
  }, () => 8))
  assert.throws(() => projectValidatedV7ToExactV8(legacy, () => null))
  assert.equal(isValidV8ExactAmount('0001'), false)
  assert.equal(isValidV8ExactAmount('-123'), false)
  assert.equal(isValidV8ExactAmount('-123', true), true)
})

test('snapshot migration accepts an actual saved game and stock purchase', async () => {
  const { createCapitalState } = await import('./capital.ts')
  const { buyAsset } = await import('./trading/trades.ts')
  const { getAsset } = await import('./trading/catalog.ts')
  const { prepareSaveImport, createSaveExport } = await import('./save-transfer.ts')
  const now = 1_800_000_000_000
  const initial = createCapitalState({ balance: 1000, lifetimeEarned: 1000, purchasedUpgrades: 0 }, now)
  const purchase = buyAsset(initial, 'nvideo', 2)
  assert.equal(purchase.ok, true)
  if (!purchase.ok) return
  const imported = prepareSaveImport(createSaveExport(purchase.state, now), now)
  assert.equal(imported.ok, true)
  if (!imported.ok) return
  const snapshot = projectValidatedV7ToExactV8(
    imported.preview.state, id => getAsset(id)?.quantityDecimals ?? null,
  )
  assert.equal((snapshot.trading as any).positions.nvideo.quantity, '20000')
  assert.equal((snapshot.game as any).balance, '66595')
  assert.equal((snapshot.trading as any).positions.nvideo.costBasis, '33405')
  assert.equal(snapshot.version, 8)
})

test('legitimate V7 IEEE-754 quantity artifacts migrate without extra coins', () => {
  const legacy = fixture()
  const a = 0.1 + 0.2
  legacy.trading.positions.tiny.quantity = a
  legacy.trading.staking!.positions.tiny.locked = a
  const converted = projectValidatedV7ToExactV8(legacy, id => id === 'tiny' ? 8 : null)
  assert.equal((converted.trading as any).positions.tiny.quantity, '30000000')
  assert.equal((converted.trading as any).staking.positions.tiny.locked, '30000000')
  legacy.trading.positions.tiny.quantity = 0.3000000001
  assert.throws(() => projectValidatedV7ToExactV8(legacy, () => 8))
})
