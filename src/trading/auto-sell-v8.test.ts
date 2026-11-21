import test from 'node:test'
import assert from 'node:assert/strict'
import {createV8CapitalState,getExactAmount as v} from '../exact-state-v8.ts'
import {v8BuyTrade} from '../exact-runtime-v8.ts'
import {v8AdvanceMarketSecond} from '../exact-market-v8.ts'
import {applyNewsAutoSells,setNewsAutoSellRule} from './auto-sell-v8.ts'
import {getAsset} from './catalog.ts'
import {validateExactV8State} from '../exact-save-validation.ts'
import {loadV8CapitalState,saveV8CapitalState} from '../exact-persistence-v8.ts'
import type {MarketNews} from './types.ts'

const NOW=1_800_000_000_000
const bullish:MarketNews={id:'news-green-test',templateId:'chip-breakthrough',
  startedAt:NOW-200_000,endsAt:NOW+1000,affectedAssetIds:['nvideo'],
  impact:1,phase:'active'}
const bearish:MarketNews={id:'news-red-test',templateId:'meme-insiders',
  startedAt:NOW+1000,endsAt:NOW+300_000,affectedAssetIds:['nvideo'],
  impact:-1,phase:'active'}
function owned(){
  const base=createV8CapitalState(NOW)
  const funded={...base,game:{...base.game,balance:'1000000000',lifetimeEarned:'1000000000'}}
  const purchase=v8BuyTrade(funded,'nvideo','5')
  assert.ok(purchase.ok)
  return purchase.state
}
function prefer(kind:'greenEnd'|'redStart'){
  const state=owned()
  const updated=setNewsAutoSellRule(state,'nvideo',kind,true)
  assert.ok(updated)
  return updated
}
const valid=(s:ReturnType<typeof owned>)=>validateExactV8State(s,id=>getAsset(id)?.quantityDecimals??null)

test('green news expiry sells all liquid stock once during clock and keeps an exact valid save',()=>{
  const initial=prefer('greenEnd')
  const seeded={...initial,trading:{...initial.trading,news:[bullish]}}
  const settled=v8AdvanceMarketSecond(seeded)
  assert.equal(settled.trading.positions.nvideo,undefined)
  assert.equal(settled.trading.autoSellRules?.nvideo?.greenEnd,true)
  assert.ok(v(settled.game.balance)>v(seeded.game.balance))
  assert.ok(valid(settled).valid,valid(settled).reason)
  const later=v8AdvanceMarketSecond(settled)
  assert.equal(later.trading.realizedNetProfit,settled.trading.realizedNetProfit)
})

test('red news appearance sells only configured affected assets, not existing red news',()=>{
  const initial=prefer('redStart')
  const later={...initial,trading:{...initial.trading,news:[bearish]}}
  const triggered=applyNewsAutoSells(initial,later,NOW+1000)
  assert.equal(triggered.trading.positions.nvideo,undefined)
  assert.ok(valid(triggered).valid,valid(triggered).reason)
  const oldRed={...initial,trading:{...initial.trading,news:[{...bearish,startedAt:NOW-1000}]}}
  const unchanged=applyNewsAutoSells(oldRed,oldRed,NOW+1000)
  assert.ok(unchanged.trading.positions.nvideo)
})

test('inactive rules do not sell; red alerts do not trigger green end rules',()=>{
  const start=owned()
  const end=applyNewsAutoSells({...start,trading:{...start.trading,news:[bullish]}},
    {...start,trading:{...start.trading,news:[bullish,bearish]}},NOW+1000)
  assert.ok(end.trading.positions.nvideo)
  const greenOnly=prefer('greenEnd')
  const noRed=applyNewsAutoSells(greenOnly,
    {...greenOnly,trading:{...greenOnly.trading,news:[bearish]}},NOW+1000)
  assert.ok(noRed.trading.positions.nvideo)
  assert.equal(setNewsAutoSellRule(greenOnly,'nvideo','greenEnd',false)?.trading.autoSellRules?.nvideo,undefined)
})

test('liquid stake-excluded quantity sells and locked tokens remain',()=>{
  const starting=prefer('redStart')
  const quantity=v(starting.trading.positions.nvideo!.quantity)
  const locked=quantity/2n
  const next={...starting,trading:{...starting.trading,
    staking:{...starting.trading.staking,positions:{...starting.trading.staking.positions,
      nvideo:{locked:locked.toString(),unlocking:'0',unlockAt:null,awaitingCompound:'0',
        rewardHeld:'0',rewardLocked:'0',rewardUnlocking:'0',carryUnits:0,lifetimeRewards:'0'}}}}}
  const withRed={...next,trading:{...next.trading,news:[bearish]}}
  const sold=applyNewsAutoSells(next,withRed,NOW+1000)
  assert.equal(v(sold.trading.positions.nvideo!.quantity),locked)
})

test('old V8 saves remain valid and per-asset switches survive storage reload',()=>{
  const start=owned()
  assert.ok(valid(start).valid,valid(start).reason)
  const updated=setNewsAutoSellRule(start,'nvideo','greenEnd',true)!
  const both=setNewsAutoSellRule(updated,'nvideo','redStart',true)!
  assert.deepEqual(both.trading.autoSellRules?.nvideo,{greenEnd:true,redStart:true})
  const saved=new Map<string,string>()
  const storage={getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,x:string)=>{saved.set(k,x)}}
  assert.equal(saveV8CapitalState(storage,both),true)
  const loaded=loadV8CapitalState(storage,NOW)
  assert.equal(loaded.ok,true)
  if(loaded.ok)assert.deepEqual(loaded.state.trading.autoSellRules?.nvideo,{greenEnd:true,redStart:true})
  const invalid={...both,trading:{...both.trading,autoSellRules:{nvideo:{greenEnd:'yes',redStart:true}}}}
  assert.equal(validateExactV8State(invalid,id=>getAsset(id)?.quantityDecimals??null).valid,false)
})
