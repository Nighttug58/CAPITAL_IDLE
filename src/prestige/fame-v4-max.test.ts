import test from 'node:test'
import assert from 'node:assert/strict'
import { createV8CapitalState, getExactAmount as n } from '../exact-state-v8.ts'
import { quoteFameV4Max, v8BuyFameV4Upgrade, v8BuyFameV4UpgradeMax } from './fame-v4-ledger.ts'
import { quoteV8FameBoostMax, v8BuyFameUpgradeMax } from '../exact-runtime-v8.ts'
import { validateExactV8State } from '../exact-save-validation.ts'
import { getAsset } from '../trading/catalog.ts'
import { v8AbsoluteFameStatus } from './absolute-v8.ts'
const now=1_800_000_000_000
function money(fame:bigint){
 const state=createV8CapitalState(now),p=state.prestige,credited=fame*1_000_000n
 return {...state,prestige:{...p,
  fameMicros:(n(p.fameMicros)+credited).toString(),
  lifetimeFameMicros:(n(p.lifetimeFameMicros)+credited).toString(),
  levelFameMicros:(n(p.levelFameMicros)+credited).toString(),
  cycleEarnedFameMicros:(n(p.cycleEarnedFameMicros)+credited).toString(),
  cycleLevelFameMicros:(n(p.cycleLevelFameMicros)+credited).toString(),
 }}
}
const valid=(state:unknown)=>validateExactV8State(state,id=>getAsset(id)?.quantityDecimals??null).valid

test('Fame V4 MAX buys only affordable ranks in one exact ledger',()=>{
 const state=money(440n)
 const quote=quoteFameV4Max(state,'fame-v4-01',0)
 assert.deepEqual(quote,{levels:2,costFame:440n})
 const purchased=v8BuyFameV4UpgradeMax(state,'fame-v4-01',0)
 assert.ok(purchased)
 if(!purchased)return
 assert.equal(purchased.prestige.fameV4?.levels['fame-v4-01'],2)
 assert.equal(purchased.prestige.fameV4?.spentMicros,'440000000')
 assert.equal(purchased.prestige.fameSpentMicros,'440000000')
 assert.equal(n(purchased.prestige.fameMicros),n(state.prestige.fameMicros)-440_000_000n)
 assert.equal(purchased.game.balance,state.game.balance)
 assert.ok(valid(purchased))
 assert.equal(v8BuyFameV4UpgradeMax(purchased,'fame-v4-01',0),null)
 assert.equal(quoteFameV4Max(purchased,'fame-v4-01',2),null)
})
test('Fame V4 MAX equals sequential exact single purchases',()=>{
 const state=money(5500n)
 let bySingle=state
 for(let i=0;i<10;i++){
  const next=v8BuyFameV4Upgrade(bySingle,'fame-v4-01',i)
  assert.ok(next)
  bySingle=next!
 }
 const byMax=v8BuyFameV4UpgradeMax(state,'fame-v4-01',0)
 assert.ok(byMax)
 assert.deepEqual(byMax,bySingle)
 assert.equal(byMax!.prestige.fameV4?.levels['fame-v4-01'],10)
 assert.equal(n(byMax!.prestige.fameMicros),n(state.prestige.fameMicros)-5_400_000_000n)
 assert.equal(quoteFameV4Max(byMax!,'fame-v4-01',10),null)
 assert.ok(valid(byMax))
})
test('classic Fame MAX keeps historic authority and absolute unlock unchanged',()=>{
 const state=money(40000n)
 const quote=quoteV8FameBoostMax(state,'click',0)
 assert.ok(quote)
 assert.equal(quote!.levels,20)
 const next=v8BuyFameUpgradeMax(state,'click',0)
 assert.ok(next)
 if(!next)return
 assert.equal(next.prestige.boosts.click,20)
 assert.equal(next.prestige.fameV4?.levels['fame-v4-01'],0)
 assert.equal(v8AbsoluteFameStatus(next).requiredLevels,120)
 assert.equal(v8AbsoluteFameStatus(next).unlocked,false)
 assert.equal(quoteV8FameBoostMax(next,'click',0),null)
 assert.ok(valid(next))
})
test('Fame MAX rejects corrupt ledgers without partial mutation',()=>{
 const state=money(10000n)
 const p={...state.prestige,fameV4:{...state.prestige.fameV4!,spentMicros:'1'}}
 const corrupt={...state,prestige:p}
 const serialized=JSON.stringify(corrupt)
 assert.equal(v8BuyFameV4UpgradeMax(corrupt,'fame-v4-01',0),null)
 assert.equal(v8BuyFameUpgradeMax(corrupt,'click',0),null)
 assert.equal(JSON.stringify(corrupt),serialized)
})
