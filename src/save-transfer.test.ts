import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState } from './capital.ts'
import { advanceFiscalEconomy } from './economy/clock.ts'
import { accrueProfitTax } from './economy/fiscal.ts'
import { buyEnterprise } from './economy/enterprises.ts'
import {
  createSaveExport, exportFileName, MAX_IMPORT_FILE_BYTES, prepareSaveImport,
  SAVE_FILE_FORMAT, SAVE_FILE_FORMAT_VERSION,
} from './save-transfer.ts'
import { loadCapitalState, replaceCapitalSave, saveCapitalState } from './persistence.ts'
import type { CapitalState } from './capital.ts'

const NOW = 1_800_000_000_000
const DAY = 86_400_000

function fixture(): CapitalState {
  const initial = createCapitalState({
    balance: 100_000, lifetimeEarned: 100_000, purchasedUpgrades: 3,
  }, NOW)
  const enterprise = buyEnterprise(initial, 'kiosque', NOW)
  assert.ok(enterprise.ok)
  let state = enterprise.state
  state.trading.positions.nvideo = { quantity: 2, costBasis: 350.45 }
  state.trading.quotes.nvideo = { price: 200, momentum: 0, dividendYield: 0.05, updatedAt: NOW }
  state.trading.history.nvideo = [{ at: NOW - 5_000, price: 190 }, { at: NOW, price: 200 }]
  state.trading.news = []
  state.stats.clickCount = 5
  state.stats.activePlayMs = 123_000
  const taxable = accrueProfitTax(state, 'stocks', 10_000)
  assert.ok(taxable)
  return taxable
}

function store(run: (data: Map<string, string>) => void, onSet?: (key: string) => void): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const data = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { onSet?.(key); data.set(key, value) },
      removeItem: (key: string) => { data.delete(key) },
    },
  })
  try { run(data) }
  finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
}

test('export JSON : format, version, nom du fichier et intégralité du snapshot', () => {
  const state = fixture()
  const text = createSaveExport(state, NOW + 10_000)
  const body = JSON.parse(text)
  assert.equal(body.format, SAVE_FILE_FORMAT)
  assert.equal(body.formatVersion, SAVE_FILE_FORMAT_VERSION)
  assert.equal(body.exportedAt, NOW + 10_000)
  assert.deepEqual(body.state, state)
  assert.equal(exportFileName(NOW), 'CAPITAL_IDLE_save_2027-01-15.json')
  assert.deepEqual(prepareSaveImport(text, NOW + 10_000), {
    ok: true,
    preview: { state, sourceVersion: 5, exportedAt: NOW + 10_000 },
  })
  assert.equal(state.game.balance, 99_850, 'un export ne fait pas bouger le solde')
})

test('reprise complète : import après 90 jours conserve positions, niveaux, dettes et horodatages', () => {
  const before = fixture()
  const imported = prepareSaveImport(createSaveExport(before, NOW + 1000), NOW + 90 * DAY)
  assert.ok(imported.ok)
  assert.deepEqual(imported.preview.state, before)
  const caught = advanceFiscalEconomy(imported.preview.state, NOW + 90 * DAY)
  const reference = advanceFiscalEconomy(before, NOW + 90 * DAY)
  assert.deepEqual(caught, reference)
  assert.ok(caught.fiscal.taxesPaidCents > before.fiscal.taxesPaidCents)
  assert.equal(caught.trading.positions.nvideo?.quantity, 2)
  assert.equal(caught.enterprises.owned.kiosque?.level, 1)
  assert.equal(caught.fiscal.periodStartedAt, reference.fiscal.periodStartedAt)
  assert.strictEqual(advanceFiscalEconomy(caught, NOW + 90 * DAY), caught)
})

test('anciens fichiers bruts v4 et v5 : migration sans taxation du passé', () => {
  const original = fixture()
  const rawV5 = JSON.stringify(original)
  const modern = prepareSaveImport(rawV5, NOW)
  assert.ok(modern.ok)
  assert.deepEqual(modern.preview.state, original)

  const rawV4 = JSON.stringify({ version: 4, game: original.game, trading: original.trading })
  const legacy = prepareSaveImport(rawV4, NOW)
  assert.ok(legacy.ok)
  assert.equal(legacy.preview.sourceVersion, 4)
  assert.equal(legacy.preview.exportedAt, null)
  assert.deepEqual(legacy.preview.state.game, original.game)
  assert.deepEqual(legacy.preview.state.trading, original.trading)
  assert.equal(legacy.preview.state.fiscal.taxesDueCents, 0)
  assert.deepEqual(legacy.preview.state.enterprises.owned, {})
  assert.equal(legacy.preview.state.fiscal.periodStartedAt, NOW)
})

test('ancienne v5 sans suivi détaillé ni reliquat : migration unique de l historique non ventilé', () => {
  const original = fixture()
  const raw = JSON.parse(JSON.stringify(original))
  delete raw.stats.sourceTrackingVersion
  delete raw.fiscal.enterpriseTaxRemainderBps
  raw.game.lifetimeEarned += 30
  const parsed = prepareSaveImport(JSON.stringify(raw), NOW)
  assert.ok(parsed.ok)
  assert.equal(parsed.preview.state.stats.sourceTrackingVersion, 1)
  assert.equal(parsed.preview.state.stats.earnedBySource.unclassified, 100_030)
  assert.equal(parsed.preview.state.fiscal.enterpriseTaxRemainderBps, 0)
  const again = prepareSaveImport(createSaveExport(parsed.preview.state, NOW), NOW)
  assert.ok(again.ok)
  assert.equal(again.preview.state.stats.earnedBySource.unclassified, 100_030)
})

test('rejet sans remise à zéro partielle : corruption d une section, balances, horodatages', () => {
  const original = fixture()
  const edits: Array<(raw: any) => void> = [
    raw => { raw.state.game.balance = 'bad' },
    raw => { raw.state.game.balance = -0.001 },
    raw => { raw.state.trading.positions.nvideo.costBasis = -1 },
    raw => { raw.state.trading.quotes.nvideo.price = 'free' },
    raw => { raw.state.fiscal.taxesDueCents += 1 },
    raw => { raw.state.fiscal.periodStartedAt = -1 },
    raw => { raw.state.enterprises.owned.kiosque.level = 21 },
    raw => { raw.state.stats.clickCount = -1 },
    raw => { delete raw.state.enterprises },
    raw => { raw.state.stats.earnedBySource.clicks = 1 / 3 },
    raw => { raw.state.trading.dividendLastPaidAt = NOW - 1000 },
  ]
  for (const edit of edits) {
    const raw = JSON.parse(createSaveExport(original, NOW))
    edit(raw)
    const result = prepareSaveImport(JSON.stringify(raw), NOW)
    assert.deepEqual(result, { ok: false, error: 'invalid-save' })
  }
})

test('format et version inconnus, mauvais JSON et horloges futures sont refusés', () => {
  assert.deepEqual(prepareSaveImport('{not-json', NOW), { ok: false, error: 'invalid-json' })
  assert.deepEqual(prepareSaveImport('null', NOW), { ok: false, error: 'unsupported-version' })
  assert.deepEqual(prepareSaveImport(JSON.stringify({ version: 8 }), NOW), { ok: false, error: 'unsupported-version' })
  const data = JSON.parse(createSaveExport(fixture(), NOW))
  data.formatVersion = 42
  assert.deepEqual(prepareSaveImport(JSON.stringify(data), NOW), { ok: false, error: 'unsupported-version' })
  data.formatVersion = 1
  data.exportedAt = NOW + DAY
  assert.deepEqual(prepareSaveImport(JSON.stringify(data), NOW), { ok: false, error: 'invalid-save' })
  data.exportedAt = NOW
  data.state.fiscal.periodStartedAt = NOW + DAY
  assert.deepEqual(prepareSaveImport(JSON.stringify(data), NOW), { ok: false, error: 'invalid-save' })
})

test('limite de taille protège contre un énorme fichier', () => {
  const result = prepareSaveImport('x'.repeat(MAX_IMPORT_FILE_BYTES + 1), NOW)
  assert.deepEqual(result, { ok: false, error: 'file-too-large' })
})

test('reset : priorité de v5 et nettoyage des quatre anciennes sauvegardes', () => {
  store((data) => {
    const old = fixture()
    for (const version of [1, 2, 3, 4]) data.set(`capital-idle-save-v${version}`, JSON.stringify(old))
    const fresh = createCapitalState(undefined, NOW + DAY)
    assert.equal(replaceCapitalSave(fresh), true)
    for (const version of [1, 2, 3, 4]) assert.equal(data.has(`capital-idle-save-v${version}`), false)
    assert.deepEqual(loadCapitalState(NOW + DAY), fresh)
    assert.equal(fresh.fiscal.periodStartedAt, NOW + DAY)
    assert.equal(fresh.stats.startedAt, NOW + DAY)
    assert.equal(fresh.game.balance, 0)
    assert.deepEqual(fresh.enterprises.owned, {})
  })
})

test('une v5 corrompue n autorise pas la résurrection de la v4', () => {
  store(data => {
    const old = fixture()
    data.set('capital-idle-save-v4', JSON.stringify({ version: 4, game: old.game, trading: old.trading }))
    data.set('capital-idle-save-v5', '{invalid')
    const current = loadCapitalState(NOW + 1)
    assert.equal(current.game.balance, 0)
    assert.equal(current.fiscal.periodStartedAt, NOW + 1)
    assert.ok(data.has('capital-idle-save-v4'))
  })
})

test('échec d écriture du reset / import : ne pas détruire l ancienne sauvegarde', () => {
  store(data => {
    const original = fixture()
    data.set('capital-idle-save-v5', JSON.stringify(original))
    const fresh = createCapitalState(undefined, NOW + 10)
    assert.equal(replaceCapitalSave(fresh), false)
    assert.deepEqual(loadCapitalState(NOW + 10), original)
    assert.deepEqual(JSON.parse(data.get('capital-idle-save-v5')!), original)
  }, key => { if (key === 'capital-idle-save-v5') throw new Error('Quota') })
})

test('l autosauvegarde demeure disponible après remplacement', () => {
  store(data => {
    const original = fixture()
    assert.equal(replaceCapitalSave(original), true)
    const modified = { ...original, game: { ...original.game, balance: original.game.balance + 1 } }
    saveCapitalState(modified)
    assert.equal(JSON.parse(data.get('capital-idle-save-v5')!).game.balance, 99_851)
  })
})
