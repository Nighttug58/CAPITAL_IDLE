import test from 'node:test'
import {catchUpV8,createV8MarketRuntime,REPLAY_SLICE_BUDGET_MS} from './exact-clock-v8.ts'
import {v8BuyTrade} from './exact-runtime-v8.ts'
import {setNewsAutoSellRule} from './trading/auto-sell-v8.ts'
import {createV9CapitalState} from './exact-state-v8.ts'
import assert from 'node:assert/strict'
import { createCapitalState } from './capital.ts'
import { convertValidatedV7ToV8, getExactAmount as v, type V8CapitalState } from './exact-state-v8.ts'
import { v8AdvanceMarketSecond, v8DividendPicoCents } from './exact-market-v8.ts'
import { advanceCapitalSecond } from './trading/dividends.ts'
import { getAsset } from './trading/catalog.ts'
import { getNewsDirection } from './trading/news.ts'
import { validateExactV8State } from './exact-save-validation.ts'

const now=1_800_000_000_000
const valid=(s:V8CapitalState)=>validateExactV8State(s,id=>getAsset(id)?.quantityDecimals??null)

test('v8 seeded market ticks agree exactly with v7 when no positions are owned',()=>{
  let legacy=createCapitalState(undefined,now)
  // Une News déjà active permet de vérifier la parité déterministe des deux
  // moteurs sans déclencher le nouveau secours V8 plus fin (chaque seconde).
  legacy.trading.news=[{id:'news-existing',templateId:'chip-breakthrough',
    startedAt:now,endsAt:now+600_000,affectedAssetIds:['nvideo'],impact:0.8,phase:'active'}]
  let exact=convertValidatedV7ToV8(legacy)
  for(let i=0;i<15;i++) {
    legacy=advanceCapitalSecond(legacy)
    exact=v8AdvanceMarketSecond(exact)
    assert.deepEqual(exact.trading.quotes,legacy.trading.quotes)
    assert.deepEqual(exact.trading.news,legacy.trading.news)
    assert.equal(exact.trading.seed,legacy.trading.seed)
    assert.equal(exact.trading.lastTickAt,legacy.trading.lastTickAt)
    assert.ok(valid(exact).valid,valid(exact).reason)
  }
})

test('v8 dividends credit a very large position with no MAX_SAFE_INTEGER stall',()=>{
  let exact=convertValidatedV7ToV8(createCapitalState(undefined,now))
  const stock=getAsset('nvideo')!
  // A fictional stress test: the cap check belongs to trading, not settlement.
  const quantity=(10n**80n*10n**BigInt(stock.quantityDecimals)).toString()
  exact={...exact,
    game:{...exact.game,lifetimeEarned:(10n**100n).toString(),balance:(10n**100n).toString()},
    trading:{...exact.trading,positions:{nvideo:{quantity,costBasis:'0'}}},
  }
  const sample=v8DividendPicoCents(exact.trading)
  assert.ok(sample>10n**77n)
  const next=v8AdvanceMarketSecond(exact)
  assert.equal(next.trading.dividendLastPaidAt,now+1000)
  assert.ok(v(next.game.balance)>v(exact.game.balance))
  assert.ok(v(next.stats.earnedBySource.dividends)>0n)
  assert.ok(valid(next).valid,valid(next).reason)
  // The save value remains an exact decimal string, even after a huge payout.
  assert.equal(typeof JSON.parse(JSON.stringify(next)).game.balance,'string')
})

test('V8 remplace une News expirée à la seconde exacte, sans attendre le tick de prix',()=>{
  const initial=convertValidatedV7ToV8(createCapitalState(undefined,now))
  const first=v8AdvanceMarketSecond(initial)
  assert.equal(first.trading.news.length,1)
  assert.equal(first.trading.news[0]?.startedAt,now+1000)
  assert.notEqual(getNewsDirection(first.trading.news[0]!), 'neutral')
  const continuous=v8AdvanceMarketSecond(first)
  assert.deepEqual(continuous.trading.news,first.trading.news)
  const expired={...first,trading:{...first.trading,
    news:first.trading.news.map(item=>({...item,endsAt:now+2000}))}}
  const replacement=v8AdvanceMarketSecond(expired)
  assert.equal(replacement.trading.news.filter(item=>item.startedAt===now+2000).length,1)
  assert.ok(replacement.trading.news.some(item=>item.startedAt===now+2000 &&
    getNewsDirection(item)!=='neutral'))
  assert.equal(replacement.trading.nextNewsAt,first.trading.nextNewsAt)
})


test('live V8 runtime publishes once per tick and checkpoints every five seconds or on pause',()=>{
  let at=now
  let state=createV9CapitalState(at)
  let scheduled:(()=>void)|undefined
  let writes=0, publications=0
  const runtime=createV8MarketRuntime({
    getState:()=>state,setState:next=>{state=next;publications++},
    persist:()=>{writes++;return true},now:()=>at,
    schedule:cb=>{scheduled=cb;return 1 as unknown as ReturnType<typeof setTimeout>},
    cancel:()=>{scheduled=undefined},
  })
  runtime.start()
  // Establish a forced, dirty checkpoint at the first live second.
  at+=1000;scheduled!();runtime.pause();runtime.resume()
  const baseline=writes
  for(let i=0;i<4;i++){
    const previousPublications=publications
    at+=1000;scheduled!()
    assert.equal(publications-previousPublications,1)
    assert.equal(state.trading.dividendLastPaidAt,at)
    assert.equal(writes,baseline)
  }
  at+=1000;scheduled!()
  assert.equal(writes,baseline+1)
  at+=1000;scheduled!()
  const beforePause=writes
  runtime.pause()
  assert.equal(writes,beforePause+1)
  assert.equal(scheduled,undefined)
  assert.equal(state.trading.dividendLastPaidAt,at)
  runtime.stop()
})


test('time-budgeted replay preserves exact dividends, market seed, automatic sales and fiscal ledger',()=>{
  const base=createV9CapitalState(now)
  const funded={...base,game:{...base.game,balance:'1000000000',lifetimeEarned:'1000000000'}}
  // Use enough stock to earn whole cents before the automatic sale.
  const purchase=v8BuyTrade(funded,'nvideo','500')
  assert.ok(purchase.ok)
  const enabled=setNewsAutoSellRule(purchase.state,'nvideo','greenEnd',true)
  assert.ok(enabled)
  const initial:V8CapitalState={...enabled,trading:{...enabled.trading,news:[{
    id:'budget-green',templateId:'chip-breakthrough',startedAt:now-200000,
    endsAt:now+12000,affectedAssetIds:['nvideo'],impact:1,phase:'active',
  }]}}
  const target=now+60_000
  const full=catchUpV8(initial,target)
  assert.equal(full.pendingSeconds,0)
  assert.equal(full.state.trading.positions.nvideo,undefined)
  assert.ok(full.state.trading.autoSellHistory?.some(row=>row.trigger==='greenEnd'))
  assert.ok(v(full.state.stats.earnedBySource.dividends)>0n)
  let state=initial,remaining=60,slices=0,clock=0
  while(remaining>0){
    const partial=catchUpV8(state,target,256,{now:()=>clock++,maxMs:3})
    assert.ok(partial.processedSeconds>0&&partial.processedSeconds<=3)
    assert.equal(partial.pendingSeconds,remaining-partial.processedSeconds)
    remaining=partial.pendingSeconds
    state=partial.state
    slices++
  }
  assert.ok(slices>1)
  assert.deepEqual(state,full.state)
})

test('runtime yields during long replay and always publishes its final offline report',()=>{
  const target=now+60_000
  let state=createV9CapitalState(now)
  let clock=0, scheduled:(()=>void)|undefined, delay=0
  const reports:number[]=[]
  const runtime=createV8MarketRuntime({
    getState:()=>state,setState:next=>{state=next},
    persist:()=>true,now:()=>target,monotonicNow:()=>clock+=REPLAY_SLICE_BUDGET_MS,
    initialOfflineTarget:target,onOfflineReplay:(_state,pending)=>reports.push(pending),
    schedule:(cb,ms)=>{scheduled=cb;delay=ms;return 1 as unknown as ReturnType<typeof setTimeout>},
    cancel:()=>{scheduled=undefined},
  })
  runtime.start()
  assert.equal(state.trading.dividendLastPaidAt,now+1000)
  assert.equal(delay,16)
  assert.equal(reports[0],59)
  for(let i=0;i<59;i++){assert.ok(scheduled);scheduled!()}
  assert.equal(state.trading.dividendLastPaidAt,target)
  assert.equal(reports.at(-1),0)
  assert.ok(reports.length<60)
  runtime.stop()
})


test('hidden startup and repeated pause/resume/stop own at most one timer; no ticks after stop',()=>{
  let at=now,state=createV9CapitalState(now),foreground=false,writes=0
  let id=0
  const queue=new Map<number,()=>void>()
  const runtime=createV8MarketRuntime({
    getState:()=>state,setState:next=>{state=next},persist:()=>{writes++;return true},
    now:()=>at,monotonicNow:()=>0,isForeground:()=>foreground,
    schedule:cb=>{queue.set(++id,cb);return id as unknown as ReturnType<typeof setTimeout>},
    cancel:handle=>{queue.delete(handle as unknown as number)},
  })
  runtime.start()
  assert.equal(queue.size,0)
  assert.equal(writes,0)
  at+=10_000;foreground=true;runtime.resume();runtime.resume()
  assert.equal(queue.size,1)
  assert.equal(state.trading.dividendLastPaidAt,at)
  for(let i=0;i<20;i++){
    at+=1000
    const cb=[...queue.values()][0]!
    cb()
    assert.equal(queue.size,1)
    const before=writes
    const saved=runtime.pause()
    assert.equal(queue.size,0)
    assert.equal(writes-before,saved?1:0)
    runtime.resume()
    assert.equal(queue.size,1)
  }
  runtime.stop();runtime.stop()
  assert.equal(queue.size,0)
  const snapshot=state
  at+=1000;runtime.wake();runtime.resume()
  assert.equal(state,snapshot)
})

test('battery receipt cadence does not alter any exact economic state',()=>{
  const initial=createV9CapitalState(now)
  function replay(interval:number){
    let at=now+300_000,state=initial,clock=0,cb:(()=>void)|undefined
    let pending=-1
    const reports:number[]=[]
    const runtime=createV8MarketRuntime({
      getState:()=>state,setState:next=>{state=next},persist:()=>true,now:()=>at,
      monotonicNow:()=>clock+=8,initialOfflineTarget:at,offlineReportIntervalMs:()=>interval,
      onOfflineReplay:(_s,p)=>{pending=p;reports.push(p)},
      schedule:callback=>{cb=callback;return 1 as unknown as ReturnType<typeof setTimeout>},
      cancel:()=>{cb=undefined},
    })
    runtime.start()
    for(let i=0;i<300&&pending!==0;i++)cb!()
    assert.equal(pending,0)
    runtime.stop()
    return {state,reports}
  }
  const normal=replay(250),eco=replay(1000)
  assert.deepEqual(eco.state,normal.state)
  assert.ok(eco.reports.length<normal.reports.length)
})
