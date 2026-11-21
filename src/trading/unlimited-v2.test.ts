import assert from 'node:assert/strict'
import test from 'node:test'
import { getAsset } from './catalog.ts'
import { createV8CapitalState, getExactAmount as v } from '../exact-state-v8.ts'
import { v8BuyTrade, v8MaximumBuyUnits, v8SellTrade } from '../exact-runtime-v8.ts'
import { v8SettleStaking } from '../exact-staking-v8.ts'
import { validateExactV8State } from '../exact-save-validation.ts'
const now=1_800_000_000_000
const valid=(state:ReturnType<typeof createV8CapitalState>)=>validateExactV8State(state,id=>getAsset(id)?.quantityDecimals??null)

test('buy far beyond former global supply without affecting market prices',()=>{
  for(const id of ['nvideo','bitcoin','turbo','shiba-inu'] as const){
    const asset=getAsset(id)!
    const initial=createV8CapitalState(now)
    const cash=10n**105n
    const state={...initial,game:{...initial.game,balance:cash.toString(),lifetimeEarned:cash.toString()}}
    const requested=(BigInt(asset.totalSupply)*1000n+1n).toString()
    const max=v8MaximumBuyUnits(state,id)
    assert.ok(max>BigInt(asset.totalSupply)*10n**BigInt(asset.quantityDecimals),id)
    const response=v8BuyTrade(state,id,requested)
    assert.equal(response.ok,true,id)
    if(!response.ok)continue
    assert.equal(v(response.state.trading.positions[id]!.quantity),BigInt(requested)*10n**BigInt(asset.quantityDecimals))
    assert.equal(v(response.state.game.balance),cash-response.cashDeltaCents*-1n)
    assert.strictEqual(response.state.trading.quotes, state.trading.quotes, 'buy does not move prices')
    assert.ok(valid(response.state).valid,valid(response.state).reason)
    const sell=v8SellTrade(response.state,id,requested)
    assert.equal(sell.ok,true)
    if(sell.ok){
      assert.equal(sell.state.trading.positions[id],undefined)
      assert.strictEqual(sell.state.trading.quotes, state.trading.quotes,
        'sale does not move prices')
      assert.ok(v(sell.state.game.balance) < cash, 'round trip pays fees')
      assert.ok(valid(sell.state).valid,valid(sell.state).reason)
    }
  }
})

test('staking compounds past historical cap without minting twice or truncating units',()=>{
  const original=createV8CapitalState(now)
  const asset=getAsset('ethereum')!
  const held=BigInt(asset.totalSupply)*10n**BigInt(asset.quantityDecimals)*10n
  const entry={locked:held.toString(),unlocking:'0',unlockAt:null,
    awaitingCompound:'0',rewardHeld:'0',rewardLocked:'0',rewardUnlocking:'0',
    carryUnits:0,carryPicoUnits:'0',lifetimeRewards:'0'}
  const state={...original,
    trading:{...original.trading,positions:{ethereum:{quantity:held.toString(),costBasis:'0'}},
      staking:{lastAccruedAt:now,positions:{ethereum:entry}}},
    ascension:{...original.ascension,progress:{...original.ascension.progress,
      upgradeLevels:{...original.ascension.progress.upgradeLevels,'crypto-staking':1,'auto-compound':1}}}}
  const result=v8SettleStaking(state,now+3600000)
  assert.ok(v(result.trading.positions.ethereum!.quantity)>held)
  const reward=v(result.trading.staking.positions.ethereum!.lifetimeRewards)
  assert.ok(reward>0n)
  const second=v8SettleStaking(result,now+3600000)
  assert.deepEqual(second,result)
})
