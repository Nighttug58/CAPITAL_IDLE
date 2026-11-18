import assert from 'node:assert/strict'
import test from 'node:test'
import {getAsset} from './catalog.ts'
import {advanceMarketTick} from './market.ts'
import {createInitialTradingState,restoreTradingState} from './state.ts'
import {validLegacyBoundary} from './legacy-boundary.ts'
import {validMarketOrders} from '../ascension/automation-orders.ts'
import {createV8CapitalState} from '../exact-state-v8.ts'
import {v8AdvanceMarketSecond} from '../exact-market-v8.ts'
import {catchUpV8} from '../exact-clock-v8.ts'
import {validateExactV8State} from '../exact-save-validation.ts'
import {V8_STORAGE_KEY,loadV8CapitalState,saveV8CapitalState,prepareV8SaveImport} from '../exact-persistence-v8.ts'

const now=1_800_000_000_000
const decimals=(id:string)=>getAsset(id)?.quantityDecimals??null
function oldQuote(id:string,side:'min'|'max'='min') {
  const asset=getAsset(id)!
  const edge=asset.referencePrice*(side==='min'?(asset.kind==='stock'?0.10:0.05):(asset.kind==='stock'?6:5))
  return {
    price:edge,momentum:side==='min'?-0.08:0.08,
    regime:side==='min'?'bear' as const:'bull' as const,
    regimeTicksLeft:25,shockTicksLeft:5,shockDrift:side==='min'?-0.2:0.2,
    dividendYield:asset.initialDividendYield,updatedAt:now,
    boundary:{side,touchedAtRealMs:now,holdUntilRealMs:now+300_000,
      reboundUntilRealMs:now+360_000,
      reboundTargetPrice:edge*(side==='min'?1.1:0.9)},
  }
}
function memoryStorage() {
  const values=new Map<string,string>()
  return {
    values,
    getItem:(key:string)=>values.get(key)??null,
    setItem:(key:string,val:string)=>{values.set(key,val)},
  }
}
test('old bounded quotes for all three categories resume immediately, without 5-10 minute hold',()=>{
  for(const id of ['nvideo','bitcoin','turbo']){
    const asset=getAsset(id)!
    for(const side of ['min','max'] as const){
      const legacy=oldQuote(id,side)
      assert.equal(validLegacyBoundary(legacy.boundary,asset,legacy.price,now),true)
      const state=createInitialTradingState(now,123)
      state.quotes={[id]:legacy}
      const step=advanceMarketTick(state,true,{realAt:now+5_000})
      const first=step.quotes[id]!
      assert.equal('boundary'in first,false)
      assert.ok(side==='min'?first.price<legacy.price:first.price>legacy.price)
      const following=advanceMarketTick(step,true,{realAt:now+10_000})
      assert.notEqual(following.quotes[id]!.price,first.price,'free price movement')
    }
  }
})
test('V7 restores existing held boundary state without discarding positions, then strips the obsolete event',()=>{
  const state=createInitialTradingState(now,123)
  state.quotes={bitcoin:oldQuote('bitcoin')}
  state.positions.bitcoin={quantity:0.5,costBasis:120}
  const read=restoreTradingState(JSON.parse(JSON.stringify(state)),now)
  assert.equal(read.quotes.bitcoin!.price,state.quotes.bitcoin!.price)
  assert.equal('boundary' in read.quotes.bitcoin!,false)
  assert.deepEqual(read.positions,state.positions)
  assert.equal(read.seed,state.seed)
  assert.equal(read.lastTickAt,state.lastTickAt)
  assert.notEqual(advanceMarketTick(read).quotes.bitcoin!.price,read.quotes.bitcoin!.price)
})
test('V8 accepts a previously valid held boundary, strips it on read/import/write without changing economic state',()=>{
  const initial=createV8CapitalState(now)
  const legacy={...initial,trading:{...initial.trading,quotes:{bitcoin:oldQuote('bitcoin')}}}
  assert.equal(validateExactV8State(legacy,decimals).valid,true)
  const storage=memoryStorage()
  const original=JSON.stringify(legacy)
  storage.setItem(V8_STORAGE_KEY,original)
  const loaded=loadV8CapitalState(storage,now)
  assert.equal(loaded.ok,true)
  if(!loaded.ok)return
  assert.equal(storage.getItem(V8_STORAGE_KEY),original,'do not rewrite existing save on read')
  assert.equal(loaded.state.trading.quotes.bitcoin!.price,legacy.trading.quotes.bitcoin.price)
  assert.equal('boundary' in loaded.state.trading.quotes.bitcoin!,false)
  assert.equal(loaded.state.game.balance,legacy.game.balance)
  assert.equal(loaded.state.trading.seed,legacy.trading.seed)
  assert.equal(validateExactV8State(loaded.state,decimals).valid,true)
  const imported=prepareV8SaveImport(original,now)
  assert.equal(imported.ok,true)
  if(imported.ok)assert.equal('boundary' in imported.state.trading.quotes.bitcoin!,false)
  assert.equal(saveV8CapitalState(storage,legacy),true)
  assert.equal((JSON.parse(storage.getItem(V8_STORAGE_KEY)!) as any).trading.quotes.bitcoin.boundary,undefined)
  const reloaded=loadV8CapitalState(storage,now)
  assert.equal(reloaded.ok,true)
  if(!reloaded.ok)return
  let direct=loaded.state,restored=reloaded.state
  for(let i=0;i<20;i++){
    direct=v8AdvanceMarketSecond(direct)
    restored=v8AdvanceMarketSecond(restored)
  }
  assert.deepEqual(restored,direct,'unchanged seeded market continuation')
})
test('corrupted old boundary metadata is still rejected, not used as a reset or a free price event',()=>{
  const old=oldQuote('bitcoin')
  const malformed={...old,boundary:{...old.boundary,holdUntilRealMs:now+1000}}
  assert.equal(validLegacyBoundary(malformed.boundary,getAsset('bitcoin')!,malformed.price,now),false)
  const legacy=createInitialTradingState(now,987)
  legacy.quotes={bitcoin:malformed}
  assert.deepEqual(restoreTradingState(legacy,now).quotes,{})
  const v8=createV8CapitalState(now)
  const forged={...v8,trading:{...v8.trading,quotes:{bitcoin:malformed}}}
  assert.equal(validateExactV8State(forged,decimals).valid,false)
  const storage=memoryStorage()
  storage.setItem(V8_STORAGE_KEY,JSON.stringify(forged))
  assert.deepEqual(loadV8CapitalState(storage,now),{ok:false,reason:'invalid-v8'})
})
test('limit and take-profit trigger prices can exceed former stock/crypto/memecoin maxima',()=>{
  for(const id of ['nvideo','bitcoin','turbo']){
    const asset=getAsset(id)!
    const far=asset.referencePrice*1000
    const orders=[{id:1,assetId:id,side:'sell' as const,kind:'take-profit' as const,
      triggerPrice:far,quantity:1,createdAtRealMs:now}]
    assert.equal(validMarketOrders(orders,2,now,now),true)
    assert.equal(validMarketOrders([{...orders[0]!,triggerPrice:-1}],2,now,now),false)
    const v8=createV8CapitalState(now)
    const updated={...v8,ascension:{...v8.ascension,run:{...v8.ascension.run,
      marketOrders:[{...orders[0]!,quantity:String(10**asset.quantityDecimals)}],nextOrderId:2}}}
    assert.deepEqual(validateExactV8State(updated,decimals),{valid:true})
  }
})
test('offline catch-up and x5 market ticks do not reinstate old boundary holds',()=>{
  const initial=createV8CapitalState(now)
  const state={...initial,trading:{...initial.trading,quotes:{nvideo:oldQuote('nvideo')}},
    ascension:{...initial.ascension,run:{...initial.ascension.run,
      marketClock:{...initial.ascension.run.marketClock,selectedSpeed:5}}}}
  let first=state
  for(let i=0;i<6;i++)first=v8AdvanceMarketSecond(first)
  assert.ok(first.trading.quotes.nvideo!.price!==state.trading.quotes.nvideo.price)
  assert.equal('boundary' in first.trading.quotes.nvideo!,false)
  const partial=catchUpV8(state,now+7*60_000)
  assert.equal(partial.processedSeconds,256)
  const complete=catchUpV8(partial.state,now+7*60_000)
  assert.equal(complete.pendingSeconds,0)
  let sequential=state
  for(let i=0;i<420;i++)sequential=v8AdvanceMarketSecond(sequential)
  assert.deepEqual(complete.state,sequential)
  assert.equal(validateExactV8State(sequential,decimals).valid,true)
})
