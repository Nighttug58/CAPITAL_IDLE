import test from 'node:test'
import assert from 'node:assert/strict'
import { createV8CapitalState } from './exact-state-v8.ts'
import { v8PerformPrestige } from './exact-prestige-v8.ts'
import { v8CreditIncome,v8BuyTrade,v8SellTrade,v8ClaimAchievement } from './exact-runtime-v8.ts'
import { buyNewsPower,newsPowerCost } from './news-powers.ts'
import { exportV8Save,prepareV8SaveImport } from './exact-persistence-v8.ts'
import { createInitialQuotes } from './trading/catalog.ts'
import { getNewsPressure } from './trading/news.ts'
const at=1_800_000_000_000
test('ten cycles, news prices and export/import including an interrupted directional news',()=>{
 let state=createV8CapitalState(at)
 for(let i=0;i<10;i++){
   state=v8CreditIncome(state,i%2?'enterprises':'clicks',10n**32n)
   const cycle=v8PerformPrestige(state,at)
   assert.ok(cycle.ok)
   state=cycle.state
   if(i<6)assert.equal(buyNewsPower(state,null,0,at),null)
 }
 state=v8CreditIncome(state,'enterprises',10n**104n+1n)
 const cost=newsPowerCost(state,false)
 assert.equal(cost,(10n**104n)/20n+1n)
 const first=buyNewsPower(state,null,0,at)!
 assert.equal(first.trading.nextNewsAt,state.trading.nextNewsAt)
 assert.equal(first.game.balance,(BigInt(state.game.balance)-cost).toString())
 assert.equal(first.prestige,state.prestige)
 assert.equal(buyNewsPower(first,null,0,at),null)
 const id=first.trading.news[0]!.id
 const closed=buyNewsPower(first,id,1,at)!
 assert.equal(closed.trading.news.filter(e=>e.endsAt>at).length,1)
 const ended=closed.trading.news.find(e=>e.id===id)!
 assert.ok(ended.manuallyEnded)
 assert.deepEqual(getNewsPressure([ended],at+1),getNewsPressure([],at+1))
 assert.equal(buyNewsPower(closed,id,2,at),null)
 assert.equal(closed.newsPowers?.recent.length,2)
 const restored=prepareV8SaveImport(exportV8Save(closed,at),at)
 assert.ok(restored.ok)
 assert.deepEqual(restored.state,closed)
})
test('identical net worth quotes, and insufficient cash rejects an invested portfolio',()=>{
 const base=createV8CapitalState(at)
 const state={...base,ascension:{...base.ascension,progress:{...base.ascension.progress,prestigeCount:7}},
   game:{...base.game,balance:'1000000'}}
 const invested={...state,game:{...state.game,balance:'1'},enterprises:{...state.enterprises,owned:{kiosque:{level:1,investedCents:'999999'}}}}
 assert.equal(newsPowerCost(invested,false),newsPowerCost(state,false))
 assert.equal(buyNewsPower(invested,null,0,at),null)
 assert.equal(buyNewsPower(state,'unknown',0,at),null)
})
test('profitable stock and crypto sales unlock only the corresponding cash rewards',()=>{
 let state=v8CreditIncome(createV8CapitalState(at),'clicks',10n**12n)
 for(const [id,group] of [['nvideo','stocks'],['ethereum','crypto']]){
   const buy=v8BuyTrade(state,id!,'10')
   assert.ok(buy.ok)
   const quote=buy.state.trading.quotes[id!]??createInitialQuotes(at)[id!]!
   const raised={...buy.state,trading:{...buy.state.trading,quotes:{...buy.state.trading.quotes,[id!]:{...quote,price:quote.price*2}}}}
   const sale=v8SellTrade(raised,id!,'10')
   assert.ok(sale.ok)
   assert.equal(sale.realizedNetProfitCents,BigInt(sale.state.stats.earnedBySource[group as 'stocks'|'crypto']))
   const reward=v8ClaimAchievement(sale.state,group+'-100')
   assert.ok(reward)
   assert.equal(v8ClaimAchievement(reward,group+'-100'),null)
   state=reward
 }
})
