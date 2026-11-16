import assert from 'node:assert/strict'
import test from 'node:test'
import { getAsset } from './catalog.ts'
import { createInitialTradingState, restoreTradingState } from './state.ts'
import { advanceMarketTick, BOUNDARY_MIN_HOLD_REAL_MS, isValidMarketBoundary } from './market.ts'
import type { MarketQuote, TradingState } from './types.ts'
import { createV8CapitalState, type V8CapitalState } from '../exact-state-v8.ts'
import { v8AdvanceMarketSecond } from '../exact-market-v8.ts'
import { catchUpV8 } from '../exact-clock-v8.ts'
import { validateExactV8State } from '../exact-save-validation.ts'
import { loadV8CapitalState, saveV8CapitalState } from '../exact-persistence-v8.ts'

const now = 1_800_000_000_000
function towards(id:string, side:'min'|'max'):TradingState {
  const asset=getAsset(id)!
  const multiplier=side==='min'?1.001:0.999
  const quote:MarketQuote={price:(side==='min'?asset.minPrice:asset.maxPrice)*multiplier,
    momentum:side==='min'?-0.08:0.08,
    regime:'steady',regimeTicksLeft:20,shockTicksLeft:5,
    shockDrift:side==='min'?-0.2:0.2,
    dividendYield:asset.initialDividendYield,updatedAt:now}
  return {...createInitialTradingState(now,123),quotes:{[id]:quote}}
}

test('minimum/maximum touched exactly, real 5–10min hold, then decisive 1–3min rebound',()=>{
  for(const [id,side] of [['bitcoin','min'],['nvideo','max'],['turbo','min']] as const){
    const asset=getAsset(id)!
    let state=advanceMarketTick(towards(id,side),true,{realAt:now+5000})
    const initial=state.quotes[id]!
    const event=initial.boundary!
    assert.ok(event,`${id} must enter an exact boundary state`)
    assert.equal(event.side,side)
    const bound=side==='min'?asset.minPrice:asset.maxPrice
    assert.equal(initial.price,bound)
    assert.ok(event.holdUntilRealMs-event.touchedAtRealMs>=BOUNDARY_MIN_HOLD_REAL_MS)
    assert.ok(event.holdUntilRealMs-event.touchedAtRealMs<=600000)
    assert.ok(event.reboundUntilRealMs-event.holdUntilRealMs>=60000)
    assert.ok(event.reboundUntilRealMs-event.holdUntilRealMs<=180000)
    assert.equal(isValidMarketBoundary(event,asset,initial.price,initial.updatedAt),true)
    const saved=JSON.parse(JSON.stringify(state))
    const restored=restoreTradingState(saved,now+5000)
    assert.deepEqual(restored,state)
    const holdRealAt=event.holdUntilRealMs-1
    state=advanceMarketTick(state,true,{realAt:holdRealAt})
    assert.equal(state.quotes[id]!.price,bound,'no movement during hold, even on large replay gaps')
    const halfway=event.holdUntilRealMs+Math.floor((event.reboundUntilRealMs-event.holdUntilRealMs)/2)
    state=advanceMarketTick(state,true,{realAt:halfway})
    const moving=state.quotes[id]!.price
    assert.ok(side==='min'?moving>bound:moving<bound)
    state=advanceMarketTick(state,true,{realAt:event.reboundUntilRealMs})
    assert.equal(state.quotes[id]!.price,event.reboundTargetPrice)
    assert.equal(state.quotes[id]!.boundary,undefined)
    assert.ok(state.quotes[id]!.price>=asset.minPrice && state.quotes[id]!.price<=asset.maxPrice)
  }
})

test('same price behavior at x1/x5: boundary duration is real-time, not simulated',()=>{
  for(const speed of [1,5]){
    let state=towards('nvideo','min')
    state=advanceMarketTick(state,true,{realAt:now+1000,speed})
    const event=state.quotes.nvideo!.boundary!
    assert.ok(event)
    assert.ok(event.holdUntilRealMs-event.touchedAtRealMs>=5*60_000)
    for(let current=now+2000;current<now+300000;current+=5000){
      state=advanceMarketTick(state,true,{realAt:current,speed})
      assert.equal(state.quotes.nvideo!.price,getAsset('nvideo')!.minPrice)
    }
  }
})

test('V8 exact save reload keeps boundary state and seeded continuation',()=>{
  let v8=createV8CapitalState(now)
  v8={...v8,trading:{...v8.trading,quotes:towards('bitcoin','max').quotes}}
  for(let i=0;i<5;i++)v8=v8AdvanceMarketSecond(v8)
  const event=v8.trading.quotes.bitcoin!.boundary!
  assert.ok(event)
  assert.equal(validateExactV8State(v8,id=>getAsset(id)?.quantityDecimals??null).valid,true)
  const map=new Map<string,string>()
  const storage={getItem:(key:string)=>map.get(key)??null,setItem:(key:string,val:string)=>{map.set(key,val)}}
  assert.equal(saveV8CapitalState(storage,v8),true)
  const reloaded=loadV8CapitalState(storage,now+5000)
  assert.equal(reloaded.ok,true)
  if(!reloaded.ok)return
  assert.deepEqual(reloaded.state.trading.quotes.bitcoin!.boundary,event)
  let replay=v8
  let resumed=reloaded.state
  for(let i=0;i<10;i++){
    replay=v8AdvanceMarketSecond(replay)
    resumed=v8AdvanceMarketSecond(resumed)
  }
  assert.deepEqual(resumed,replay)
})

test('invalid/tampered boundary saved state is rejected',()=>{
  const state=advanceMarketTick(towards('nvideo','min'),true,{realAt:now+5000})
  const original=state.quotes.nvideo!
  const asset=getAsset('nvideo')!
  assert.equal(isValidMarketBoundary(original.boundary,asset,original.price,original.updatedAt),true)
  for(const boundary of [
    {...original.boundary!,holdUntilRealMs:original.boundary!.touchedAtRealMs+299999},
    {...original.boundary!,reboundTargetPrice:asset.minPrice},
    {...original.boundary!,reboundUntilRealMs:original.boundary!.holdUntilRealMs-1},
  ]){
    assert.equal(isValidMarketBoundary(boundary,asset,original.price,original.updatedAt),false)
    const tampered={...state,quotes:{...state.quotes,nvideo:{...original,boundary}}}
    assert.notDeepEqual(restoreTradingState(tampered,now+5000),tampered)
  }
})


test('offline market replay advances in bounded batches and preserves real-time boundary timestamps',()=>{
  let initial=createV8CapitalState(now)
  initial={...initial,trading:{...initial.trading,quotes:towards('nvideo','min').quotes}}
  const first=catchUpV8(initial,now+7*60_000)
  assert.equal(first.processedSeconds,256)
  assert.equal(first.pendingSeconds,164)
  assert.ok(first.state.trading.quotes.nvideo!.boundary)
  const second=catchUpV8(first.state,now+7*60_000)
  assert.equal(second.pendingSeconds,0)
  assert.equal(second.processedSeconds,164)
  let sequential=initial
  for(let i=0;i<420;i++)sequential=v8AdvanceMarketSecond(sequential)
  assert.deepEqual(second.state,sequential)
  assert.equal(validateExactV8State(sequential,id=>getAsset(id)?.quantityDecimals??null).valid,true)
})

test('actual V8 accelerated 5x ticks still require 5 real minutes before rebound',()=>{
  let state=createV8CapitalState(now)
  state={...state,trading:{...state.trading,quotes:towards('nvideo','min').quotes},
    ascension:{...state.ascension,
      progress:{...state.ascension.progress,upgradeLevels:{...state.ascension.progress.upgradeLevels,'time-accelerator':5}},
      run:{...state.ascension.run,marketClock:{...state.ascension.run.marketClock,selectedSpeed:5}}}}
  state=v8AdvanceMarketSecond(state)
  const boundary=state.trading.quotes.nvideo!.boundary!
  assert.ok(boundary)
  assert.equal(boundary.touchedAtRealMs,now+1000)
  for(let i=1;i<300;i++)state=v8AdvanceMarketSecond(state)
  assert.equal(state.trading.quotes.nvideo!.price,getAsset('nvideo')!.minPrice)
  assert.ok(state.trading.quotes.nvideo!.boundary!.holdUntilRealMs>now+300_000)
})
