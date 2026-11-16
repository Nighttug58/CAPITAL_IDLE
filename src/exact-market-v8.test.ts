import test from 'node:test'
import assert from 'node:assert/strict'
import { createCapitalState } from './capital.ts'
import { convertValidatedV7ToV8, getExactAmount as v, type V8CapitalState } from './exact-state-v8.ts'
import { v8AdvanceMarketSecond, v8DividendPicoCents } from './exact-market-v8.ts'
import { advanceCapitalSecond } from './trading/dividends.ts'
import { getAsset } from './trading/catalog.ts'
import { validateExactV8State } from './exact-save-validation.ts'

const now=1_800_000_000_000
const valid=(s:V8CapitalState)=>validateExactV8State(s,id=>getAsset(id)?.quantityDecimals??null)

test('v8 seeded market ticks agree exactly with v7 when no positions are owned',()=>{
  let legacy=createCapitalState(undefined,now)
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
