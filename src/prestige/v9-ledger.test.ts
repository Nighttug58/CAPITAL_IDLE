import test from 'node:test'
import assert from 'node:assert/strict'
import {createV9CapitalState,getExactAmount as v} from '../exact-state-v8.ts'
import {getV9PurchasedFameCost,getV2NextFameBoostCost,TOTAL_V2_FAME_SHOP_COST} from './catalog.ts'
import {v8BuyFameUpgrade,v8BuyFameUpgradeMax,v8CreditIncome,v8BuyPrestigeUpgrade} from '../exact-runtime-v8.ts'
import {v8BuyFameV4Upgrade,v8BuyFameV4UpgradeMax} from './fame-v4-ledger.ts'
import {v8PerformPrestige} from '../exact-prestige-v8.ts'
import {validateExactV8State} from '../exact-save-validation.ts'
import {getAsset} from '../trading/catalog.ts'
const NOW=1_800_000_000_000
const check=(s:unknown)=>validateExactV8State(s,id=>getAsset(id)?.quantityDecimals??null)
function fund(fame:bigint){
 const state=createV9CapitalState(NOW),p=state.prestige,delta=fame*1_000_000n
 return {...state,prestige:{...p,
  fameMicros:(v(p.fameMicros)+delta).toString(),
  lifetimeFameMicros:(v(p.lifetimeFameMicros)+delta).toString(),
  levelFameMicros:(v(p.levelFameMicros)+delta).toString(),
  cycleEarnedFameMicros:(v(p.cycleEarnedFameMicros)+delta).toString(),
  cycleLevelFameMicros:(v(p.cycleLevelFameMicros)+delta).toString()}}
}
test('V9 uses one deterministic modern Fame tariff without legacy witnesses',()=>{
 const zero=createV9CapitalState(NOW)
 assert.equal(zero.version,9)
 assert.equal(zero.prestige.fameLegacyLevels,undefined)
 assert.equal(getV9PurchasedFameCost(zero.prestige.boosts),0n)
 assert.equal(getV2NextFameBoostCost('click',0),260)
 const rich=fund(400_000n)
 const clicked=v8BuyFameUpgrade(rich,'click',0)
 assert.ok(clicked)
 if(!clicked)return
 assert.equal(clicked.prestige.boosts.click,1)
 assert.equal(getV9PurchasedFameCost(clicked.prestige.boosts),260n)
 const max=v8BuyFameUpgradeMax(clicked,'click',1)
 assert.ok(max)
 if(!max)return
 assert.equal(max.prestige.boosts.click,20)
 assert.equal(getV9PurchasedFameCost(max.prestige.boosts)>260n,true)
 const v4=v8BuyFameV4Upgrade(max,'fame-v4-01',0)
 assert.ok(v4)
 if(!v4)return
 const v4max=v8BuyFameV4UpgradeMax(v4,'fame-v4-02',0)
 assert.ok(v4max)
 if(!v4max)return
 assert.equal(check(v4max).valid,true,check(v4max).reason)
 assert.equal(v8BuyFameV4Upgrade(v4,'fame-v4-01',0),null)
 assert.equal(getV9PurchasedFameCost({...v4max.prestige.boosts,unexpected:1}),null)
 assert.equal(TOTAL_V2_FAME_SHOP_COST,167_710)
})
test('V9 rejects mismatched spend, forged current ranks and duplicate purchases',()=>{
 const initial=fund(2000n)
 const upgraded=v8BuyFameUpgrade(initial,'click',0)
 assert.ok(upgraded)
 if(!upgraded)return
 assert.equal(v8BuyFameUpgrade(upgraded,'click',0),null)
 const forged={...upgraded,prestige:{...upgraded.prestige,fameSpentMicros:'0'}}
 assert.equal(check(forged).valid,false)
 assert.equal(v8BuyFameUpgrade(forged,'xp',0),null)
 assert.equal(v8BuyFameV4Upgrade(forged,'fame-v4-01',0),null)
 assert.equal(check(upgraded).valid,true)
})
test('V9 Prestige preserves permanent Fame V4 ranks and uses current PP costs',()=>{
 const initial=fund(6000n)
 const bought=v8BuyFameV4Upgrade(initial,'fame-v4-19',0)
 assert.ok(bought)
 if(!bought)return
 const rich=v8CreditIncome(bought,'clicks',10n**36n)
 const completed=v8PerformPrestige(rich,NOW)
 assert.ok(completed.ok,completed.ok?'':completed.reason)
 if(!completed.ok)return
 assert.equal(completed.state.prestige.fameMicros,'0')
 assert.equal(completed.state.prestige.fameV4?.levels['fame-v4-19'],1)
 assert.equal(completed.state.ascension.progress.legacyRanks,undefined)
 const pp=v8BuyPrestigeUpgrade(completed.state,'news-frequency',0)
 assert.ok(pp)
 if(!pp)return
 assert.equal(v(pp.ascension.progress.availablePoints),
  v(completed.state.ascension.progress.availablePoints)-20n)
 assert.equal(check(pp).valid,true,check(pp).reason)
})
