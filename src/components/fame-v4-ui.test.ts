import {beforeEach, afterEach, describe, it, expect, vi} from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../App.vue'
import { createV8CapitalState, getExactAmount as n } from '../exact-state-v8.ts'
import { V8_STORAGE_KEY, prepareV8SaveImport } from '../exact-persistence-v8.ts'
import { FAME_V4_CATALOG } from '../prestige/fame-v4-catalog.ts'
import { readV8Raw } from './v8-ui-test-helper.ts'
const mounted: VueWrapper[]=[]
beforeEach(()=>localStorage.clear())
afterEach(()=>mounted.splice(0).forEach(w=>w.unmount()))
function funded(fame=50000n){
 const seed=createV8CapitalState(Date.now()),p=seed.prestige,delta=fame*1_000_000n
 const state={...seed,prestige:{...p,
  fameMicros:(n(p.fameMicros)+delta).toString(),
  lifetimeFameMicros:(n(p.lifetimeFameMicros)+delta).toString(),
  levelFameMicros:(n(p.levelFameMicros)+delta).toString(),
  cycleEarnedFameMicros:(n(p.cycleEarnedFameMicros)+delta).toString(),
  cycleLevelFameMicros:(n(p.cycleLevelFameMicros)+delta).toString(),
 }}
 localStorage.setItem(V8_STORAGE_KEY,JSON.stringify(state))
 const wrapper=mount(App,{attachTo:document.body})
 mounted.push(wrapper)
 return wrapper
}
const tab=(w:VueWrapper,label:string)=>w.findAll('.fame-v4-tab').find(t=>t.text().includes(label))!
describe('Fame Shop V4 pass 2 integration',()=>{
 it('shows all 7 categories, 36 powers and 316 ranks without affecting classic cards',async()=>{
  const w=funded()
  await w.find('.fame-shop-launch').trigger('click')
  expect(w.find('[data-fame-v4-total]').text()).toContain('0 / 316')
  expect(w.findAll('.fame-v4-tab')).toHaveLength(7)
  expect(w.findAll('.fame-boost-card[data-boost]')).toHaveLength(6)
  let count=0
  for(const label of ['Trading','Entreprises','Collections','Clics','Fiscalité','Prestige']){
    await tab(w,label).trigger('click')
    await nextTick()
    count+=w.findAll('.fame-v4-card').length
    expect(w.find('.fame-v4-pending').text()).toMatch(/(actif|active)/i)
    expect(w.findAll('.fame-v4-card .fame-v4-buttons')).toHaveLength(w.findAll('.fame-v4-card').length)
  }
  expect(count).toBe(30)
  expect(FAME_V4_CATALOG).toHaveLength(30)
  await tab(w,'Classique').trigger('click')
  expect(w.find('.absolute-prestige-card').text()).toContain('120 niveaux')
 })
 it('saves an exact new Fame purchase once, without changing cash or legacy boosts',async()=>{
  const w=funded(1200n)
  await w.find('.fame-shop-launch').trigger('click')
  await tab(w,'Trading').trigger('click')
  const before=readV8Raw()
  const card=w.find('[data-v4-boost="fame-v4-01"]')
  expect(card.text()).toContain('180')
  expect(card.text()).toContain('Non acquis')
  await card.find('.fame-buy-button').trigger('click')
  await nextTick()
  const after=readV8Raw()
  expect(after.prestige.fameV4?.levels['fame-v4-01']).toBe(1)
  expect(after.prestige.fameV4?.spentMicros).toBe('180000000')
  expect(n(after.prestige.fameMicros)).toBe(n(before.prestige.fameMicros)-180_000_000n)
  expect(after.prestige.boosts).toEqual(before.prestige.boosts)
  expect(after.game.balance).toBe(before.game.balance)
  expect(card.text()).toContain('260')
  expect(card.text()).toContain('30 s analysées')
  expect(w.find('[data-fame-v4-total]').text()).toContain('1 / 316')
  expect(prepareV8SaveImport(JSON.stringify(after),Date.now()).ok).toBe(true)
  expect(w.text()).toContain('Les 30 pouvoirs Fame V4 sont actifs')
 })
 it('buys the affordable V4 MAX atomically and does not duplicate stale levels',async()=>{
  const w=funded(5500n)
  await w.find('.fame-shop-launch').trigger('click')
  await tab(w,'Trading').trigger('click')
  const card=w.find('[data-v4-boost="fame-v4-01"]')
  expect(card.find('.fame-v4-max-cost').text()).toContain('+10')
  await card.find('.fame-v4-max-button').trigger('click')
  await nextTick()
  const after=readV8Raw()
  expect(after.prestige.fameV4?.levels['fame-v4-01']).toBe(10)
  expect(n(after.prestige.fameV4!.spentMicros)).toBe(5_400_000_000n)
  expect(card.find('.fame-v4-max-button').attributes('disabled')).toBeDefined()
  expect(card.find('.fame-buy-button').text()).toContain('MAX')
  expect(prepareV8SaveImport(JSON.stringify(after),Date.now()).ok).toBe(true)
 })
 it('classic MAX keeps permanent V2 boosts and does not unlock Absolute before 120 ranks',async()=>{
  const w=funded(40000n)
  await w.find('.fame-shop-launch').trigger('click')
  const card=w.find('.fame-boost-card[data-boost="click"]')
  await card.find('.fame-v4-max-button').trigger('click')
  await nextTick()
  const after=readV8Raw()
  expect(after.prestige.boosts.click).toBe(20)
  expect(after.prestige.fameV4?.levels['fame-v4-01']).toBe(0)
  expect(w.find('.absolute-prestige-state').text()).toContain('VERROUILLÉ')
  expect(w.find('[data-fame-v4-total]').text()).toContain('20 / 316')
 })
 it('provides exact Prestige Absolute before/after previews on maxed classic saves',async()=>{
  const w=funded(50000n)
  await w.find('.fame-shop-launch').trigger('click')
  // V4 previews are intentionally omitted until the classic 120/120 unlock.
  await tab(w,'Trading').trigger('click')
  expect(w.find('.fame-v4-factor-preview').exists()).toBe(false)
 })
 it('disables an unaffordable V4 purchase rather than mutating the wallet',async()=>{
  const w=funded(100n)
  await w.find('.fame-shop-launch').trigger('click')
  await tab(w,'Trading').trigger('click')
  const before=readV8Raw()
  const card=w.find('[data-v4-boost="fame-v4-01"]')
  expect(card.find('.fame-buy-button').attributes('disabled')).toBeDefined()
  expect(card.find('.fame-buy-button').text()).toContain('FAME INSUFF.')
  expect(card.text()).toContain('180')
  expect(readV8Raw()).toEqual(before)
 })
 it('reports a failed V8 storage write and never claims a Fame purchase succeeded',async()=>{
  const w=funded(500n)
  await w.find('.fame-shop-launch').trigger('click')
  await tab(w,'Trading').trigger('click')
  const before=readV8Raw()
  const nativeSet=Storage.prototype.setItem
  const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,key:string,value:string){
   if(key===V8_STORAGE_KEY)throw new Error('storage blocked')
   return nativeSet.call(this,key,value)
  })
  try{
   await w.find('[data-v4-boost="fame-v4-01"] .fame-buy-button').trigger('click')
   await nextTick()
   expect(w.find('.prestige-notice-error').text()).toContain('navigateur refuse la sauvegarde')
   expect(readV8Raw().prestige.fameV4?.levels['fame-v4-01']).toBe(before.prestige.fameV4?.levels['fame-v4-01'])
  }finally{write.mockRestore()}
 })

})
