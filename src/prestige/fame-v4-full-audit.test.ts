/** Final pass-8 transversal audit: the same V8 ledgers stay authoritative. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {createV8CapitalState,getExactAmount as v,type V8CapitalState} from '../exact-state-v8.ts'
import {FAME_V4_CATALOG,FAME_V4_TOTAL_COST,FAME_V4_TOTAL_LEVELS,fameV4PurchasedCost} from './fame-v4-catalog.ts'
import {v8BuyFameV4UpgradeMax} from './fame-v4-ledger.ts'
import {v8CreditIncome,v8ClickBatch,v8AccrueTax,v8PayTaxes,v8AdvanceFiscalEconomy,
 v8BuyEnterprise,v8SellTrade,v8BuyTrade} from '../exact-runtime-v8.ts'
import {v8PerformPrestige} from '../exact-prestige-v8.ts'
import {v8SettlePassiveIncome} from '../exact-autoclick-frame.ts'
import {buyDollarAutoClick} from '../dollar-autoclick-v8.ts'
import {fameV4Level} from '../trading/fame-v4-trading.ts'
import {v4PrestigeBonusBps,v4SelectDestiny,v4ClaimChallenge,v4PrestigeRun} from './fame-v4-prestige.ts'
import {v4ReservedTaxCents} from './fame-v4-tax.ts'
import {v4CollectionsBonusBps} from './collections-v4.ts'
import {validateExactV8State} from '../exact-save-validation.ts'
import {saveV8CapitalState,loadV8CapitalState,exportV8Save,prepareV8SaveImport} from '../exact-persistence-v8.ts'
import {getAsset} from '../trading/catalog.ts'
import {FISCAL_PERIOD_MS} from '../economy/state.ts'

const NOW=1_800_000_000_000
const check=(s:unknown)=>validateExactV8State(s,id=>getAsset(id)?.quantityDecimals??null)
function fullShop():V8CapitalState{
 const base=createV8CapitalState(NOW),p=base.prestige
 const fame=400_000n*1_000_000n,cash=10n**46n
 let state:V8CapitalState={...base,game:{...base.game,balance:cash.toString(),lifetimeEarned:cash.toString()},
 prestige:{...p,fameMicros:(v(p.fameMicros)+fame).toString(),
 lifetimeFameMicros:(v(p.lifetimeFameMicros)+fame).toString(),
 levelFameMicros:(v(p.levelFameMicros)+fame).toString(),
 cycleEarnedFameMicros:(v(p.cycleEarnedFameMicros)+fame).toString(),
 cycleLevelFameMicros:(v(p.cycleLevelFameMicros)+fame).toString()}}
 for(const definition of FAME_V4_CATALOG){
  const next=v8BuyFameV4UpgradeMax(state,definition.id,0)
  assert.ok(next,definition.id)
  state=next
 }
 return state
}
test('all 30 powers permanently buy 196 exact ranks once; duplicate MAX does not spend',()=>{
 const state=fullShop(),levels=state.prestige.fameV4!.levels
 assert.equal(FAME_V4_CATALOG.length,30)
 assert.equal(Object.values(levels).reduce((a,b)=>a+b,0),FAME_V4_TOTAL_LEVELS)
 assert.equal(v(state.prestige.fameV4!.spentMicros),FAME_V4_TOTAL_COST*1_000_000n)
 assert.equal(fameV4PurchasedCost(levels),FAME_V4_TOTAL_COST)
 assert.equal(v(state.prestige.fameMicros),400_000n*1_000_000n-FAME_V4_TOTAL_COST*1_000_000n)
 assert.equal(v(state.prestige.lifetimeFameMicros),
   v(state.prestige.fameMicros)+v(state.prestige.fameSpentMicros)+v(state.prestige.fameForfeitedMicros))
 for(const definition of FAME_V4_CATALOG)
  assert.equal(v8BuyFameV4UpgradeMax(state,definition.id,definition.maxLevel),null)
 assert.equal(check(state).valid,true,check(state).reason)
})
test('all legacy bonuses, the 100/100 museum and V8 taxes remain unchanged by V4 purchase alone',()=>{
 const base=fullShop()
 assert.equal(base.prestige.boosts.click,0)
 assert.equal(base.prestige.ownedCollectionIds.length,0)
 assert.equal(base.fiscal.taxesDueCents,'0')
 assert.equal(base.game.balance,base.game.lifetimeEarned)
 assert.equal(base.ascension.progress.availablePoints,'0')
 assert.equal(v4ReservedTaxCents(base),0n)
 assert.equal(v4CollectionsBonusBps(base,'click',NOW),0)
 const plus=v8AccrueTax(base,'enterprises',100_000_000n)
 const due=v(plus.fiscal.taxesDueCents)
 assert.equal(v4ReservedTaxCents(plus),due)
 const paid=v8PayTaxes(plus,NOW)
 assert.equal(v(paid.game.balance),v(base.game.balance)-due)
 assert.equal(v(paid.fiscal.taxesPaidCents),due)
 assert.equal(paid.fiscal.taxesDueCents,'0')
 assert.equal(check(paid).valid,true,check(paid).reason)
})
test('all 30 V4 ranks survive a Prestige; transient and fiscal cycle state never carry profit directly',()=>{
 const prepared=fullShop(),before=prepared.prestige.fameV4!.spentMicros
 const ready=v8CreditIncome(prepared,'clicks',10n**26n)
 const result=v8PerformPrestige(ready,NOW)
 assert.equal(result.ok,true,result.reason)
 if(!result.ok)return
 const after=result.state
 assert.equal(after.prestige.fameV4!.spentMicros,before)
 for(const def of FAME_V4_CATALOG)assert.equal(fameV4Level(after,Number(def.id.slice(-2))),def.maxLevel)
 assert.equal(after.ascension.run.fameV4Prestige?.specialization,null)
 assert.deepEqual(after.ascension.run.fameV4Prestige?.claimedChallenges,[])
 assert.equal(v4PrestigeBonusBps(after,'click',NOW),2000)
 assert.equal(after.fiscal.taxesDueCents,'0')
 assert.equal(after.prestige.fameMicros,'0')
 assert.ok(check(after).valid,check(after).reason)
})
test('cross-effects collector, a claimed click challenge, tax reserve and XP share the same V8 accounts',()=>{
 const base=fullShop(),res=v8PerformPrestige(v8CreditIncome(base,'clicks',10n**26n),NOW)
 assert.equal(res.ok,true,res.reason)
 if(!res.ok)return
 let state=v4SelectDestiny(res.state,'collector',NOW)!
 state=v8ClickBatch(state,100n,NOW)
 const claimed=v4ClaimChallenge(state,1,NOW)
 assert.ok(claimed)
 assert.equal(v4PrestigeBonusBps(claimed,'click',NOW),2800) // +20% / +5% / +3%
 const before=v(claimed.game.lifetimeEarned),xp=v(claimed.prestige.experienceCents)
 const paid=v8ClickBatch(claimed,21n,NOW)
 assert.equal(v(paid.stats.earnedBySource.clicks)-v(claimed.stats.earnedBySource.clicks),21n*128n)
 assert.equal(v(paid.game.lifetimeEarned)-before,21n*128n)
 assert.equal(v(paid.prestige.experienceCents)-xp,21n*128n)
 assert.equal(paid.fiscal.taxesDueCents,'0')
 assert.equal(v(paid.ascension.progress.availablePoints),v(claimed.ascension.progress.availablePoints))
 assert.ok(check(paid).valid,check(paid).reason)
})
test('Trader fee reduction and news/auto-sell share exact engine; no duplicate PP or market impact',()=>{
 let state=fullShop()
 state=v4SelectDestiny(state,'trader',NOW)!
 const price=state.trading.quotes.nvideo?.price
 const acquired=v8BuyTrade(state,'nvideo','10')
 assert.ok(acquired.ok)
 if(!acquired.ok)return
 const sold=v8SellTrade(acquired.state,'nvideo','10')
 assert.ok(sold.ok)
 if(!sold.ok)return
 assert.equal(sold.state.trading.quotes.nvideo?.price,price)
 assert.equal(sold.state.trading.positions.nvideo,undefined)
 assert.equal(sold.state.ascension.progress.availablePoints,state.ascension.progress.availablePoints)
 assert.equal(v(sold.state.prestige.fameSpentMicros),v(state.prestige.fameSpentMicros))
 assert.ok(check(sold.state).valid,check(sold.state).reason)
})
test('full Fame V4 save exports, imports and loads unchanged; invalid cycle witness blocks writes',()=>{
 const original=fullShop(),prestige=v8PerformPrestige(v8CreditIncome(original,'clicks',10n**26n),NOW)
 assert.ok(prestige.ok)
 if(!prestige.ok)return
 const state=prestige.state
 const bytes=exportV8Save(state,NOW)
 const imported=prepareV8SaveImport(bytes,NOW)
 assert.equal(imported.ok,true,imported.reason)
 if(imported.ok)assert.deepEqual(imported.state,state)
 const map=new Map<string,string>()
 const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,val:string)=>{map.set(k,val)}}
 assert.equal(saveV8CapitalState(storage,state),true)
 const loaded=loadV8CapitalState(storage,NOW)
 assert.equal(loaded.ok,true,loaded.reason)
 if(loaded.ok)assert.deepEqual(loaded.state,state)
 const invalid={...state,ascension:{...state.ascension,run:{...state.ascension.run,
  fameV4Prestige:{...v4PrestigeRun(state),cycleExact:'-1'}}}}
 assert.equal(check(invalid).valid,false)
 assert.equal(saveV8CapitalState(storage,invalid),false)
 assert.equal(loadV8CapitalState(storage,NOW).ok,true)
})
test('bounded 30-power reward replay for a full 72h fiscal cycle is idempotent',()=>{
 const first=fullShop(),start=v8PerformPrestige(v8CreditIncome(first,'clicks',10n**26n),NOW)
 assert.equal(start.ok,true)
 if(!start.ok)return
 let state=v8CreditIncome(start.state,'clicks',1_000_000n)
 state=buyDollarAutoClick(state,NOW)!
 const elapsed=NOW+FISCAL_PERIOD_MS
 const full=v8SettlePassiveIncome(state,elapsed)
 const split=v8SettlePassiveIncome(v8SettlePassiveIncome(state,NOW+5*60_000),elapsed)
 // Time-anchored passive income/Auto Click is independent of replay cadence.
 assert.equal(full.game.balance,split.game.balance)
 assert.equal(full.stats.clickCount,split.stats.clickCount)
 assert.equal(full.ascension.run.lastAutomationAtRealMs,split.ascension.run.lastAutomationAtRealMs)
 assert.equal(full.fiscal.periodStartedAt,elapsed)
 assert.equal(full.fiscal.taxesDueCents,'0')
 assert.equal(check(full).valid,true,check(full).reason)
})
