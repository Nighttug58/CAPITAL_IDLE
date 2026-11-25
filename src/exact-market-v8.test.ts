import test from 'node:test'
import {createV8MarketRuntime} from './exact-clock-v8.ts'
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
