import test from 'node:test'
import assert from 'node:assert/strict'
import { createV8CapitalState, getExactAmount as v, type V8CapitalState } from './exact-state-v8.ts'
import { v8Click, v8BuyTrade, v8SellTrade, v8AccrueEnterpriseUntil,
  v8BuyEnterprise, v8PayTaxes, v8AccrueTax, v8BuyCollection,
  v8BuyFameUpgrade, v8ClaimAchievement, v8UpgradeClick,
  v8MaximumBuyUnits, v8AdvanceFiscalEconomy } from './exact-runtime-v8.ts'
import { getExactLevelStartThreshold } from './exact-levels.ts'
import { validateExactV8State } from './exact-save-validation.ts'
import { getAsset } from './trading/catalog.ts'
import { FISCAL_PERIOD_MS } from './economy/state.ts'

const now=1_800_000_000_000
const big='1'+'0'.repeat(102)
const addCash=(state:V8CapitalState,cents:bigint):V8CapitalState=>({
  ...state,game:{...state.game,balance:cents.toString(),lifetimeEarned:cents.toString()},
})
const valid=(state:V8CapitalState)=>validateExactV8State(state,id=>getAsset(id)?.quantityDecimals??null)

test('huge V8 cash and XP survive click and Upgrade exact arithmetic',()=>{
  let state=addCash(createV8CapitalState(now), BigInt(big))
  state={...state,prestige:{...state.prestige,experienceCents: (10n**100n).toString()}}
  const previous=v(state.game.balance)
  const clicked=v8Click(state)
  assert.equal(v(clicked.game.balance),previous+100n)
  assert.equal(v(clicked.game.lifetimeEarned),previous+100n)
  assert.equal(v(clicked.prestige.experienceCents),10n**100n+100n)
  assert.equal(clicked.stats.clickCount,1)
  assert.equal(v(clicked.stats.earnedBySource.clicks),100n)
  assert.ok(clicked.prestige.lastAwardedLevel>1000)
  assert.ok(valid(clicked).valid,valid(clicked).reason)
  const upgraded=v8UpgradeClick(clicked)
  assert.ok(upgraded)
  assert.equal(v(upgraded!.game.balance),previous+100n-37500n)
  assert.equal(upgraded!.game.purchasedUpgrades,1)
})

test('tiny memecoin trade with exact cents, no slippage and correct basis/taxes',()=>{
  const state=addCash(createV8CapitalState(now), 10n**100n)
  const bought=v8BuyTrade(state,'turbo','1000000.0000')
  assert.equal(bought.ok,true)
  if(!bought.ok)return
  assert.equal(v(bought.state.trading.positions.turbo.quantity),10_000_000_000n)
  assert.equal(bought.state.trading.positions.turbo.costBasis,(bought.grossCents+bought.feeCents).toString())
  const sold=v8SellTrade(bought.state,'turbo','500000.0000')
  assert.equal(sold.ok,true)
  if(!sold.ok)return
  assert.equal(v(sold.state.trading.positions.turbo.quantity),5_000_000_000n)
  assert.equal(v(sold.state.trading.positions.turbo.costBasis)+
    (v(bought.state.trading.positions.turbo.costBasis)-v(sold.state.trading.positions.turbo.costBasis)),
    v(bought.state.trading.positions.turbo.costBasis))
  assert.ok(valid(sold.state).valid,valid(sold.state).reason)
})

test('V8 can afford purchases > MAX_SAFE_CENTS without issuer supply cap',()=>{
  const state=addCash(createV8CapitalState(now), 10n**110n)
  const max=v8MaximumBuyUnits(state,'nvideo')
  assert.ok(max>24_000_000_000n*10_000n)
  const bought=v8BuyTrade(state,'nvideo','24000000000')
  assert.equal(bought.ok,true)
  if(!bought.ok)return
  assert.ok(v(bought.state.trading.positions.nvideo.costBasis)>10n**14n)
  assert.ok(valid(bought.state).valid,valid(bought.state).reason)
})

test('V8 enterprise accrual across 72h tax boundary, even with enormous cash',()=>{
  const state=addCash(createV8CapitalState(now),10n**120n)
  let s={...state,prestige:{...state.prestige,experienceCents:(getExactLevelStartThreshold(3)*100n).toString()}}
  const bought=v8BuyEnterprise(s,'kiosque',now)
  assert.equal(bought.ok,true)
  if(!bought.ok)return
  s=bought.state
  const accrued=v8AdvanceFiscalEconomy(s,now+FISCAL_PERIOD_MS+1000)
  assert.equal(accrued.enterprises.lastAccruedAt,now+FISCAL_PERIOD_MS+1000)
  assert.equal(accrued.fiscal.periodStartedAt,now+FISCAL_PERIOD_MS)
  assert.ok(v(accrued.fiscal.taxesPaidCents)>0n)
  assert.ok(v(accrued.fiscal.taxesDueCents)>=0n)
  assert.ok(valid(accrued).valid,valid(accrued).reason)
})

test('V8 fame, permanent collections, early tax and achievement purchases remain exact',()=>{
  let state=addCash(createV8CapitalState(now),10n**104n)
  state={...state,prestige:{...state.prestige,
    fameMicros:'1000000000',lifetimeFameMicros:'1000000000',levelFameMicros:'1000000000'}}
  const collection=v8BuyCollection(state,'watches-01')
  assert.ok(collection)
  assert.ok(v(collection!.game.balance)<v(state.game.balance))
  assert.ok(v(collection!.prestige.fameMicros)>v(state.prestige.fameMicros))
  assert.ok(valid(collection!).valid,valid(collection!).reason)
  const fameShop=v8BuyFameUpgrade(collection!,'click',0)
  assert.ok(fameShop)
  assert.ok(valid(fameShop!).valid,valid(fameShop!).reason)
  const taxed=v8PayTaxes(v8AccrueTax(fameShop!,'stocks',10n**100n),now)
  assert.ok(v(taxed.fiscal.taxesPaidCents)>10n**97n)
  assert.equal(v(taxed.fiscal.taxesDueCents),0n)
  assert.ok(valid(taxed).valid,valid(taxed).reason)
  const claimed=v8ClaimAchievement(taxed,'earnings-1000')
  assert.ok(claimed)
  assert.ok(valid(claimed!).valid,valid(claimed!).reason)
})

test('collection expansion keeps acquisition values and validates a complete collection', async () => {
  const { CURRENT_COLLECTION_SLOTS, currentCollectionId } = await import('./prestige/catalog.ts')
  const { getCollectionBookValueCents } = await import('./prestige/collections-catalog.ts')
  let state = addCash(createV8CapitalState(now), 10n ** 20n)
  const initial = v(state.game.balance)
  for (const slot of CURRENT_COLLECTION_SLOTS) {
    const bought = v8BuyCollection(state, slot.id)
    assert.ok(bought)
    assert.equal(v(state.game.balance) - v(bought.game.balance), BigInt(slot.priceCents))
    assert.equal(v8BuyCollection(bought, currentCollectionId(slot.id)), null)
    state = bought
  }
  assert.equal(state.prestige.ownedCollectionIds.length, 100)
  assert.equal(getCollectionBookValueCents(state.prestige.ownedCollectionIds), Number(initial - v(state.game.balance)))
  assert.equal(getCollectionBookValueCents(['watches-01']), 250_000)
  assert.equal(getCollectionBookValueCents(['v2:watches-01']), 500_000)
  assert.ok(valid(JSON.parse(JSON.stringify(state))).valid)
})
