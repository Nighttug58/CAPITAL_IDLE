import { afterEach,beforeEach,describe,expect,it } from 'vitest'
import { mount,type VueWrapper } from '@vue/test-utils'
import {nextTick} from 'vue'
import App from '../App.vue'
import {createV9CapitalState} from '../exact-state-v8.ts'
import {getExactLevelStartThreshold} from '../exact-levels.ts'
import {v8CreditIncome,v8BuyFameUpgrade} from '../exact-runtime-v8.ts'
import {V9_STORAGE_KEY} from '../exact-persistence-v8.ts'
import {readV8Raw} from './v8-ui-test-helper.ts'
const mounted:VueWrapper[]=[]
beforeEach(()=>localStorage.clear())
afterEach(()=>mounted.splice(0).forEach(w=>w.unmount()))
function launch(withBoost=false){
 const now=Date.now()
 let state=v8CreditIncome(createV9CapitalState(now),'clicks',getExactLevelStartThreshold(30)*100n)
 if(withBoost){
  const next=v8BuyFameUpgrade(state,'click',0)
  if(!next)throw Error('V9 click Fame seed failed')
  state=next
 }
 localStorage.setItem(V9_STORAGE_KEY,JSON.stringify(state))
 const wrapper=mount(App,{attachTo:document.body})
 mounted.push(wrapper)
 return wrapper
}
describe('V9 Fame Shop current tariffs and permanent ledger',()=>{
 it('buys first rank for 260 Fame without touching cash',async()=>{
  const wrapper=launch()
  const before=readV8Raw()
  expect(before.version).toBe(9)
  expect(before.prestige.lastAwardedLevel).toBe(30)
  expect(before.prestige.fameLegacyLevels).toBeUndefined()
  await wrapper.find('.fame-shop-launch').trigger('click')
  const card=wrapper.find('.fame-boost-card[data-boost="click"]')
  expect(card.find('.fame-boost-cost').text()).toContain('260')
  const cash=readV8Raw().game.balance
  await card.find('button.fame-buy-button').trigger('click')
  await nextTick()
  const after=readV8Raw()
  expect(after.prestige.boosts.click).toBe(1)
  expect(after.prestige.fameSpentMicros).toBe('260000000')
  expect(after.prestige.fameLegacyLevels).toBeUndefined()
  expect(after.game.balance).toBe(cash)
  expect(card.find('.fame-boost-cost').text()).toContain('338')
  expect(localStorage.getItem('capital-idle-save-v7')).toBeNull()
 })
 it('buys second rank at the modern price; no old-price discounts',async()=>{
  const wrapper=launch(true)
  expect(readV8Raw().prestige.fameSpentMicros).toBe('260000000')
  await wrapper.find('.fame-shop-launch').trigger('click')
  const card=wrapper.find('.fame-boost-card[data-boost="click"]')
  expect(card.find('.fame-boost-level').text()).toContain('1/20')
  expect(card.find('.fame-boost-cost').text()).toContain('338')
  await card.find('button.fame-buy-button').trigger('click')
  await nextTick()
  const after=readV8Raw()
  expect(after.prestige.boosts.click).toBe(2)
  expect(after.prestige.fameSpentMicros).toBe('598000000')
  expect(after.prestige.fameLegacyLevels).toBeUndefined()
 })
})
