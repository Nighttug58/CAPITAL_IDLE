import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../App.vue'
import { createV8CapitalState, getExactAmount as v, type V8CapitalState } from '../exact-state-v8.ts'
import { v8BuyFameV4UpgradeMax } from '../prestige/fame-v4-ledger.ts'
import { V8_STORAGE_KEY, prepareV8SaveImport } from '../exact-persistence-v8.ts'
import { readV8Raw } from './v8-ui-test-helper.ts'
const mounted:VueWrapper[]=[]
beforeEach(()=>localStorage.clear())
afterEach(()=>mounted.splice(0).forEach(w=>w.unmount()))
function view(...ranks:number[]):VueWrapper{
 const base=createV8CapitalState(Date.now()),p=base.prestige,fame=100000n*1_000_000n
 let state:V8CapitalState={...base,
  game:{...base.game,balance:'1000000000000',lifetimeEarned:'1000000000000'},
  prestige:{...p,fameMicros:(v(p.fameMicros)+fame).toString(),
   lifetimeFameMicros:(v(p.lifetimeFameMicros)+fame).toString(),
   levelFameMicros:(v(p.levelFameMicros)+fame).toString(),
   cycleEarnedFameMicros:(v(p.cycleEarnedFameMicros)+fame).toString(),
   cycleLevelFameMicros:(v(p.cycleLevelFameMicros)+fame).toString()},
 }
 for(const rank of ranks){
  const id='fame-v4-'+String(rank).padStart(2,'0')
  const next=v8BuyFameV4UpgradeMax(state,id,0)
  if(!next)throw Error('Unable to unlock '+id)
  state=next
 }
 localStorage.setItem(V8_STORAGE_KEY,JSON.stringify(state))
 const w=mount(App,{attachTo:document.body})
 mounted.push(w)
 return w
}
async function openAsset(w:VueWrapper){
 await w.findAll('.bottom-nav button')[1]!.trigger('click')
 await w.findAll('.trading-tab')[1]!.trigger('click')
 await w.find('button.market-asset-row').trigger('click')
 await nextTick()
 return w.find('.trading-asset-modal')
}
describe('Fame V4 Trading pass 3 UI',()=>{
 it('shows stop, profit targets, analytics and save-backed controls after unlock',async()=>{
  const w=view(1,2,4,6,7)
  const modal=await openAsset(w)
  expect(modal.find('[aria-label="Instinct du trader"]').exists()).toBe(true)
  expect(modal.find('[aria-label="Stop suiveur Fame"]').exists()).toBe(true)
  expect(modal.find('[aria-label="Sortie stratégique Fame"]').exists()).toBe(true)
  expect(modal.find('.asset-auto-sell').exists()).toBe(true)
  const stop=modal.find('[aria-label="Stop suiveur Fame"]')
  await stop.find('button.asset-auto-sell-toggle').trigger('click')
  expect(readV8Raw().trading.fameV4Trading?.stops.nvideo?.enabled).toBe(true)
  await stop.find('select').setValue('10')
  await stop.findAll('button.asset-auto-sell-toggle')[1]!.trigger('click')
  expect(readV8Raw().trading.fameV4Trading?.stops.nvideo?.drawdownPct).toBe(10)
  const targets=modal.find('[aria-label="Sortie stratégique Fame"]')
  await targets.find('input').setValue('20')
  await targets.findAll('select')[1]!.setValue('50')
  await targets.find('button.order-submit').trigger('click')
  await nextTick()
  expect(readV8Raw().trading.fameV4Trading?.targets.nvideo?.[0]).toMatchObject({
   slot:0,gainPct:20,portionPct:50
  })
  expect(prepareV8SaveImport(JSON.stringify(readV8Raw()),Date.now()).ok).toBe(true)
  await targets.find('.asset-v4-target-row button').trigger('click')
  expect(readV8Raw().trading.fameV4Trading?.targets.nvideo).toBeUndefined()
  await modal.find('button.modal-close').trigger('click')
  await w.findAll('.trading-tab')[3]!.trigger('click')
  expect(w.find('.fame-trading-radar').exists()).toBe(true)
  expect(w.find('.fame-news-journal').text()).toContain('journal de news observées')
 })
 it('keeps all Fame controls hidden on old V8 without Trading Fame ranks',async()=>{
  const w=view()
  const modal=await openAsset(w)
  expect(modal.find('[aria-label="Stop suiveur Fame"]').exists()).toBe(false)
  expect(modal.find('[aria-label="Sortie stratégique Fame"]').exists()).toBe(false)
  expect(modal.find('.asset-auto-sell').exists()).toBe(true)
  await modal.find('button.modal-close').trigger('click')
  await w.findAll('.trading-tab')[3]!.trigger('click')
  expect(w.find('.fame-trading-radar').exists()).toBe(false)
  expect(w.find('.fame-news-journal').exists()).toBe(false)
 })
})
