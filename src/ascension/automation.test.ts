import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState, restoreCapitalState } from '../capital.ts'
import { performPrestige } from './engine.ts'
import { buyAscensionUpgrade } from './shop.ts'
import { configureAutomation, createMarketOrder, cancelMarketOrder, isMarketOrderTriggered, MAX_PENDING_ORDERS } from './automation-orders.ts'
import { runAutomationFrame } from './automation-runtime.ts'
import { earnCapitalClick } from '../economy/stats-ledger.ts'
import { getAsset } from '../trading/catalog.ts'
import { advanceCapitalSecond } from '../trading/dividends.ts'
import { buyAsset } from '../trading/trades.ts'
import { createSaveExport, prepareSaveImport } from '../save-transfer.ts'
import { creditExperience } from '../prestige/state.ts'
import type { CapitalState } from '../capital.ts'

const NOW = 1_800_000_000_000
function unlocked(ids: readonly string[]): CapitalState {
  const start = createCapitalState({ balance: 100_000_000_000, lifetimeEarned: 100_000_000_000, purchasedUpgrades: 0 }, NOW)
  const cycle = performPrestige(start, NOW)
  assert.ok(cycle.ok)
  let state = cycle.state
  for (const id of ids) {
    const purchase = buyAscensionUpgrade(state, id, 0)
    assert.ok(purchase.ok, id)
    state = purchase.state
  }
  return state
}
function funded(ids: readonly string[]): CapitalState {
  const first = unlocked(ids)
  const xp = creditExperience(first, 1_000_000 * 100)
  assert.ok(xp)
  return {
    ...xp,
    game: { ...xp.game, balance: 1_000_000, lifetimeEarned: 1_000_000 },
    stats: { ...xp.stats, earnedBySource: { ...xp.stats.earnedBySource, unclassified: 1_000_000 } },
  }
}
function set(state: CapitalState, patch: Parameters<typeof configureAutomation>[1]): CapitalState {
  const changed = configureAutomation(state, patch)
  assert.ok(changed.ok, !changed.ok ? changed.error : 'update')
  return changed.state
}
function advance(state: CapitalState, secs: number): CapitalState {
  let next = state
  for (let i = 0; i < secs; i++) next = advanceCapitalSecond(next)
  return next
}
function run(state: CapitalState, seconds = 5): CapitalState {
  const current = advance(state, seconds)
  return runAutomationFrame(current, current.trading.dividendLastPaidAt, true)
}

test('Auto Click utilise le clic natif, Fame incluse, mais seulement une fois par seconde réelle', () => {
  let initial = unlocked(['auto-click'])
  initial = set(initial, { autoClickEnabled: true })
  const previous = advance(initial, 1)
  const click = runAutomationFrame(previous, NOW + 1_000, true)
  assert.equal(click.stats.clickCount, 1)
  assert.equal(click.game.balance, earnCapitalClick(previous).game.balance)
  assert.equal(click.prestige.experienceCents, earnCapitalClick(previous).prestige.experienceCents)
  assert.strictEqual(runAutomationFrame(click, NOW + 1_000, true), click)
  assert.strictEqual(runAutomationFrame(click, NOW + 10_000, false), click)
})

test('Auto Click niveau 20 : 20 clics par seconde, aucun rattrapage des clics hors ligne', () => {
  let state = unlocked([])
  for (let i=0; i<20; i++) {
    const purchased=buyAscensionUpgrade(state,'auto-click',i)
    assert.ok(purchased.ok)
    state=purchased.state
  }
  state=set(state,{autoClickEnabled:true})
  const previous=advance(state,1)
  const once=runAutomationFrame(previous,NOW+1000,true)
  assert.equal(once.stats.clickCount,20)
  assert.equal(once.ascension.run.lastAutomationAtRealMs,NOW+1000)
  assert.strictEqual(runAutomationFrame(once,NOW+3600_000,false),once)
  const next=advance(once,1)
  const twice=runAutomationFrame(next,NOW+2000,true)
  assert.equal(twice.stats.clickCount,40)
})

test('Solde fiscal négatif : les bots n’ouvrent aucune nouvelle position ou entreprise', () => {
  let state=funded(['auto-investor','auto-enterprise'])
  state=set(state,{
    investorEnabled:true,enterpriseEnabled:true,allowedAssetIds:['ethereum'],
    maxOrderCents:100_000,enterpriseBudgetCents:100_000,cashReserveCents:0,
  })
  state={...state,game:{...state.game,balance:-100}}
  const processed=run(state)
  assert.equal(processed.game.balance,-100)
  assert.deepEqual(processed.trading.positions,{})
  assert.deepEqual(processed.enterprises.owned,{})
})

test('Paramètres verrouillés, non validés et import JSON sans autorisations indues', () => {
  const initial = createCapitalState(undefined, NOW)
  const locked = configureAutomation(initial, { investorEnabled: true })
  assert.equal(locked.ok, false)
  const invalid = configureAutomation(initial, { allowedAssetIds: ['nonexistent'] })
  assert.equal(invalid.ok, false)
  const badThreshold = configureAutomation(initial, { stopLossBps: -100 })
  assert.equal(badThreshold.ok, false)
  const state = set(unlocked(['auto-click']), { autoClickEnabled: true })
  const saved = prepareSaveImport(createSaveExport(state, NOW), NOW)
  assert.ok(saved.ok)
  assert.deepEqual(saved.preview.state, state)
  const forged = structuredClone(state)
  forged.ascension.run.automation.investorEnabled = true
  assert.deepEqual(prepareSaveImport(JSON.stringify(forged), NOW),
    { ok: false, error: 'invalid-save' })
})

test('Auto Investor respecte réserve, budget, spread et une décision par 5s', () => {
  let original = funded(['auto-investor'])
  original = set(original, {
    investorEnabled: true, allowedAssetIds: ['ethereum'],
    maxOrderCents: 50_000, cashReserveCents: 99_950_000,
  })
  const first = run(original)
  assert.ok(first.trading.positions.ethereum?.quantity)
  assert.ok(first.game.balance >= 999_500)
  assert.ok(first.game.balance < original.game.balance)
  assert.ok(first.game.balance + (first.trading.positions.ethereum?.costBasis ?? 0) <= original.game.balance + 0.001)
  assert.strictEqual(runAutomationFrame(first, NOW + 5_000, true), first)
  const replay = run(first, 5)
  assert.equal(replay.game.balance, first.game.balance, 'cash reserve prevents further purchases')
})

test('Ordres limites : priorité ID, pas de double ordre, conservation des frais et annulation', () => {
  let original = funded(['automatic-orders'])
  const asset = getAsset('nvideo')!
  const first = createMarketOrder(original, {
    assetId: 'nvideo', side: 'buy', kind: 'limit', quantity: 1, triggerPrice: asset.maxPrice,
  }, NOW)
  assert.ok(first.ok)
  const second = createMarketOrder(first.state, {
    assetId: 'nvideo', side: 'buy', kind: 'limit', quantity: 1, triggerPrice: asset.maxPrice,
  }, NOW)
  assert.ok(second.ok)
  assert.deepEqual(second.state.ascension.run.marketOrders?.map(o=>o.id), [1,2])
  const after = run(second.state)
  assert.equal(after.trading.positions.nvideo?.quantity, 1)
  assert.deepEqual(after.ascension.run.marketOrders?.map(o=>o.id), [2])
  assert.equal(after.game.balance + (after.trading.positions.nvideo?.costBasis ?? 0), original.game.balance)
  const reRun = runAutomationFrame(after, NOW + 5_000, true)
  assert.strictEqual(reRun, after)
  const cancelled = cancelMarketOrder(after, 2)
  assert.ok(cancelled.ok)
  assert.deepEqual(cancelled.state.ascension.run.marketOrders, [])
  assert.equal(cancelMarketOrder(cancelled.state, 2).ok, false)
  assert.deepEqual(restoreCapitalState(cancelled.state, NOW + 5_000), cancelled.state)
})

test('Stop Loss et Take Profit s’exécutent uniquement au franchissement et jamais deux fois', () => {
  const asset = getAsset('nvideo')!
  const base = { id: 1, assetId: 'nvideo', side:'sell' as const,
    kind:'stop-loss' as const, triggerPrice: asset.referencePrice * 0.95,
    quantity: 1, createdAtRealMs: NOW }
  assert.equal(isMarketOrderTriggered(base, asset.referencePrice), false)
  assert.equal(isMarketOrderTriggered(base, asset.referencePrice * 0.9), true)
  assert.equal(isMarketOrderTriggered({...base,kind:'take-profit'}, asset.referencePrice * 1.1), true)
  assert.equal(isMarketOrderTriggered({...base,kind:'take-profit'}, asset.referencePrice * 0.9), false)
  assert.equal(isMarketOrderTriggered({...base,kind:'limit',side:'buy'}, asset.referencePrice * 0.9), true)
})

test('Auto Trader : vente déclenchée passe par taxe, XP et frais réels, avec anti-spam', () => {
  let original = funded(['auto-trader'])
  const bought = buyAsset(original,'ethereum',3)
  assert.ok(bought.ok)
  original = set(bought.state, {
    traderEnabled:true, allowedAssetIds:['ethereum'],
    maxOrderCents:2_000_000, takeProfitBps:500, stopLossBps:500,
  })
  const advanced = advance(original,5)
  const beforeTaxes = advanced.fiscal.taxesDueCents
  const beforeLevel = advanced.prestige.experienceCents
  const base = getAsset('ethereum')!
  const price = Math.min(base.maxPrice,base.referencePrice*1.25)
  const updated = { ...advanced, trading: {...advanced.trading,
    quotes: {...advanced.trading.quotes, ethereum: {...advanced.trading.quotes.ethereum!,
      price, updatedAt:NOW+5_000 } },
  }}
  const sold = runAutomationFrame(updated, NOW+5_000, true)
  assert.ok(sold.game.balance > updated.game.balance)
  assert.ok(sold.trading.realizedNetProfit > updated.trading.realizedNetProfit)
  assert.ok(sold.fiscal.taxesDueCents > beforeTaxes)
  assert.ok(sold.prestige.experienceCents > beforeLevel)
  assert.strictEqual(runAutomationFrame(sold, NOW+5_000, true), sold)
})

test('Auto Entreprise respecte le niveau, la réserve et les coûts de progression', () => {
  let state = funded(['auto-enterprise'])
  state = set(state,{ enterpriseEnabled:true, enterpriseBudgetCents: 8_000_000,
    cashReserveCents: 0 })
  const done = run(state)
  assert.ok(Object.keys(done.enterprises.owned).length > 0)
  assert.ok(done.game.balance < state.game.balance)
  assert.equal(done.ascension.run.lastStrategyAtRealMs,NOW+5_000)
  assert.strictEqual(runAutomationFrame(done,NOW+5_000,true),done)
  const blocked = set(funded(['auto-enterprise']), { enterpriseEnabled:true,
    enterpriseBudgetCents:1, cashReserveCents:0 })
  assert.deepEqual(run(blocked).enterprises.owned, {})
})

test('Session masquée/replay en retard : aucune exécution et aucune accumulation à la reprise', () => {
  let state = funded(['auto-click','auto-investor'])
  state = set(state,{ autoClickEnabled:true, investorEnabled:true,allowedAssetIds:['ethereum'],
    maxOrderCents:10_000, cashReserveCents:0 })
  assert.strictEqual(runAutomationFrame(state,NOW+24*3600_000,true),state)
  assert.strictEqual(runAutomationFrame(state,NOW+5000,false),state)
  const settled = advance(state,5)
  const once = runAutomationFrame(settled,NOW+5000,true)
  assert.equal(once.stats.clickCount,1)
  assert.equal(once.ascension.run.lastAutomationAtRealMs,NOW+5000)
  assert.equal(once.ascension.run.lastStrategyAtRealMs,NOW+5000)
})

test('Après Prestige, ordres/bots/cursers effacés mais niveaux PP et Fame conservés', () => {
  const before = unlocked(['auto-click','automatic-orders'])
  const configured = set(before,{autoClickEnabled:true})
  const order = createMarketOrder(configured,{ assetId:'nvideo',side:'buy',kind:'limit',
    triggerPrice:getAsset('nvideo')!.referencePrice,quantity:1},NOW)
  assert.ok(order.ok)
  // The first economy was already reset, so reconstruct the minimum next run.
  const xp = creditExperience(order.state, 200_000_000 * 100)
  assert.ok(xp)
  const ready = { ...xp, game:{ ...xp.game, balance:200_000_000,lifetimeEarned:200_000_000 } }
  const reset = performPrestige(ready,NOW)
  assert.ok(reset.ok)
  assert.deepEqual(reset.state.ascension.run.marketOrders, [])
  assert.equal(reset.state.ascension.run.automation.autoClickEnabled,false)
  assert.equal(reset.state.ascension.progress.upgradeLevels['auto-click'],1)
  assert.equal(reset.state.ascension.progress.upgradeLevels['automatic-orders'],1)
  assert.equal(reset.state.prestige.fameMicros,ready.prestige.fameMicros)
})

test('Sauvegarde antérieure à la passe 6 : champs d’automatisation facultatifs migrés sans PP ni ordres inventés', () => {
  const state=unlocked(['auto-click'])
  const old=structuredClone(state)
  delete old.ascension.run.lastAutomationAtRealMs
  delete old.ascension.run.lastStrategyAtRealMs
  delete old.ascension.run.marketOrders
  delete old.ascension.run.nextOrderId
  const prepared=prepareSaveImport(JSON.stringify(old),NOW)
  assert.ok(prepared.ok)
  assert.equal(prepared.preview.state.ascension.progress.availablePoints,
    state.ascension.progress.availablePoints)
  assert.equal(prepared.preview.state.ascension.run.marketOrders,undefined)
  assert.equal(prepared.preview.state.ascension.run.lastAutomationAtRealMs,undefined)
})

test('Ordres importés malformés rejetés : id, taille, déblocage et prix impossibles', () => {
  const enabled = unlocked(['automatic-orders'])
  const order = createMarketOrder(enabled,{assetId:'nvideo',side:'buy',kind:'limit',
    triggerPrice:getAsset('nvideo')!.referencePrice,quantity:1},NOW)
  assert.ok(order.ok)
  const saved = createSaveExport(order.state,NOW)
  assert.ok(prepareSaveImport(saved,NOW).ok)
  for (const mutate of [
    (s: CapitalState) => {s.ascension.run.marketOrders![0]!.id = 0},
    (s: CapitalState) => {s.ascension.run.marketOrders![0]!.quantity = -1},
    (s: CapitalState) => {s.ascension.run.marketOrders![0]!.triggerPrice = 1e99},
    (s: CapitalState) => {s.ascension.run.nextOrderId = 1},
  ]) {
    const raw = structuredClone(order.state) as any
    mutate(raw)
    assert.deepEqual(prepareSaveImport(JSON.stringify(raw),NOW),{ok:false,error:'invalid-save'})
  }
  assert.equal(MAX_PENDING_ORDERS,24)
})
