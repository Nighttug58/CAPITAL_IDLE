import test from 'node:test'
import assert from 'node:assert/strict'
import {createV8CapitalState} from './exact-state-v8.ts'
import {exactPortfolioSummary} from './exact-portfolio-v8.ts'
import {getAsset} from './trading/catalog.ts'

const now=1_800_000_000_000
test('portfolio renders exact 1e100+ wealth and positions instead of 53-bit UI caps',()=>{
  const base=createV8CapitalState(now)
  const stock=getAsset('nvideo')!
  const huge=10n**110n
  const quantity=huge*10n**BigInt(stock.quantityDecimals)
  const state={...base,game:{...base.game,balance:huge.toString(),lifetimeEarned:huge.toString()},
    trading:{...base.trading,positions:{nvideo:{quantity:quantity.toString(),costBasis:'0'}}}}
  const result=exactPortfolioSummary(state)
  assert.match(result.netWorth,/^[\d.]+[A-Z]{2,} \$$/)
  assert.match(result.marketValue,/^[\d.]+[A-Z]{2,} \$$/)
  assert.match(result.rows.nvideo!.quantity,/^[\d.]+[A-Z]{2,}$/)
  assert.ok(result.rows.nvideo!.profitable)
  assert.equal(result.rows.nvideo!.dividendsPerSecond.includes('Infinity'),false)
})
