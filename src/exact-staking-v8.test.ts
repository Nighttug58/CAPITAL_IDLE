import test from 'node:test'
import assert from 'node:assert/strict'
import {createV8CapitalState,getExactAmount as v} from './exact-state-v8.ts'
import {v8BuyTrade,v8SellTrade,v8CreditIncome,v8BuyPrestigeUpgrade} from './exact-runtime-v8.ts'
import {v8PerformPrestige} from './exact-prestige-v8.ts'
import {v8ChangeStaking,v8SettleStaking} from './exact-staking-v8.ts'
import {getAsset} from './trading/catalog.ts'
import {validateExactV8State} from './exact-save-validation.ts'

const now=1_800_000_000_000
function capital(){
 const rich=v8CreditIncome(createV8CapitalState(now),'clicks',10n**25n)
 const prestiged=v8PerformPrestige(rich,now)
 assert.ok(prestiged.ok)
 if(!prestiged.ok)throw Error(prestiged.reason)
 const unlocked=v8BuyPrestigeUpgrade(prestiged.state,'crypto-staking',0)
 assert.ok(unlocked)
 if(!unlocked)throw Error('Missing crypto-staking upgrade')
 return {...unlocked,game:{...unlocked.game,
   balance:(10n**80n).toString(),lifetimeEarned:(10n**80n).toString()}}
}
const valid=(s:ReturnType<typeof capital>)=>validateExactV8State(s,id=>getAsset(id)?.quantityDecimals??null)

test('v8 staking deposits, exact token mint, withdraw lock, and sale preserve cost basis',()=>{
 const state=capital()
 const bought=v8BuyTrade(state,'ethereum','100')
 assert.equal(bought.ok,true)
 if(!bought.ok)return
 const stake=v8ChangeStaking(bought.state,'deposit','ethereum','100',now)
 assert.equal(stake.ok,true)
 if(!stake.ok)return
 const settled=v8SettleStaking(stake.state,now+3_600_000)
 assert.ok(v(settled.trading.positions.ethereum.quantity)>10_000_000_000n)
 assert.ok(v(settled.trading.staking.positions.ethereum.lifetimeRewards)>0n)
 assert.ok(valid(settled).valid,valid(settled).reason)
 const forbidden=v8SellTrade(settled,'ethereum','100')
 assert.equal(forbidden.ok,false)
 const withdrawn=v8ChangeStaking(settled,'withdraw','ethereum','100',now+3_600_000)
 assert.equal(withdrawn.ok,true)
 if(!withdrawn.ok)return
 assert.ok(v(withdrawn.state.trading.staking.positions.ethereum.unlocking)>0n)
 const unlocked=v8SettleStaking(withdrawn.state,now+3_600_000+300_000)
 assert.equal(unlocked.trading.staking.positions.ethereum.unlocking,'0')
 assert.ok(valid(unlocked).valid,valid(unlocked).reason)
 const sold=v8SellTrade(unlocked,'ethereum','100')
 assert.equal(sold.ok,true)
 if(!sold.ok)return
 assert.ok(valid(sold.state).valid,valid(sold.state).reason)
})
