import test from 'node:test'
import assert from 'node:assert/strict'
import {createV8CapitalState,getExactAmount as v} from './exact-state-v8.ts'
import {v8BuyTrade} from './exact-runtime-v8.ts'
import {applyNewsAutoSells,setNewsAutoSellRule} from './trading/auto-sell-v8.ts'
import {makeOfflineReport} from './offline-report-v8.ts'
import {getAsset,createInitialQuotes} from './trading/catalog.ts'
import {validateExactV8State} from './exact-save-validation.ts'
import type {MarketNews} from './trading/types.ts'

const NOW=1_800_000_000_000
function initial(){
 const fresh=createV8CapitalState(NOW)
 let state={...fresh,game:{...fresh.game,balance:'1000000000',lifetimeEarned:'1000000000'}}
 for(const id of ['nvideo','popcat']){
   const trade=v8BuyTrade(state,id,'5')
   assert.equal(trade.ok,true)
   if(trade.ok)state=trade.state
 }
 const green=setNewsAutoSellRule(state,'nvideo','greenEnd',true)
 assert.ok(green)
 const red=setNewsAutoSellRule(green,'popcat','redStart',true)
 assert.ok(red)
 return {...red,trading:{...red.trading,quotes:createInitialQuotes(NOW)}}
}
const news=(id:string,templateId:string,assetId:string,endsAt=NOW+600000):MarketNews=>({
 id,templateId,startedAt:NOW+1000,endsAt,affectedAssetIds:[assetId],impact:1,phase:'active',
})
test('offline recap reports gain and loss separately, without counting sold units as unrealized',()=>{
 const baseline=initial()
 const nvideo=baseline.trading.quotes.nvideo!
 const popcat=baseline.trading.quotes.popcat!
 const bullish={...news('news-profit','chip-breakthrough','nvideo',NOW+1000),
   startedAt:NOW-1000}
 const withGreen={...baseline,trading:{...baseline.trading,news:[bullish]}}
 const afterGreen={...withGreen,trading:{...withGreen.trading,
   dividendLastPaidAt:NOW+1000,
   quotes:{...withGreen.trading.quotes,nvideo:{...nvideo,price:nvideo.price*2}}}}
 const soldGreen=applyNewsAutoSells(withGreen,afterGreen,NOW+1000)
 assert.equal(soldGreen.trading.autoSellHistory?.length,1)
 const lossNews={...news('news-loss','meme-insiders','popcat'),impact:-1}
 const beforeRed={...soldGreen,trading:{...soldGreen.trading,dividendLastPaidAt:NOW+1000}}
 const afterRed={...beforeRed,trading:{...beforeRed.trading,
   dividendLastPaidAt:NOW+2000,
   quotes:{...beforeRed.trading.quotes,popcat:{...popcat,price:popcat.price*0.5}},
   news:[lossNews]}}
 const soldBoth=applyNewsAutoSells(beforeRed,afterRed,NOW+2000)
 const report=makeOfflineReport(baseline,soldBoth,NOW+120000)
 assert.equal(report.autoSales.length,2)
 assert.ok(report.autoSales.find(x=>x.id==='nvideo')!.realizedProfit>0n)
 assert.ok(report.autoSales.find(x=>x.id==='popcat')!.realizedProfit<0n)
 assert.equal(report.autoSalesProfit,v(soldBoth.trading.realizedNetProfit)-v(baseline.trading.realizedNetProfit))
 assert.equal(report.autoSalesProceeds,report.autoSales.reduce((sum,sale)=>sum+sale.proceeds,0n))
 assert.equal(report.cashChange,report.autoSalesProceeds)
 assert.equal(report.marketChange,0n)
 assert.ok(report.assets.every(asset=>asset.marketChange===0n))
 assert.ok(validateExactV8State(soldBoth,id=>getAsset(id)?.quantityDecimals??null).valid)
 const repeat=makeOfflineReport(baseline,soldBoth,NOW+120000)
 assert.deepEqual(repeat.autoSales,report.autoSales)
 const nextSession=makeOfflineReport(soldBoth,soldBoth,NOW+125000)
 assert.equal(nextSession.autoSales.length,0)
})
test('legacy saves without automatic sales render empty report',()=>{
 const baseline=createV8CapitalState(NOW)
 const report=makeOfflineReport(baseline,baseline,NOW+120000)
 assert.equal(report.autoSales.length,0)
 assert.equal(report.autoSalesProfit,0n)
 assert.equal(report.autoSalesProceeds,0n)
})
