import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {mount,type VueWrapper} from '@vue/test-utils'
import {nextTick} from 'vue'
import App from '../App.vue'
import {createCapitalState} from '../capital.ts'
import {createV8CapitalState} from '../exact-state-v8.ts'
import {V8_STORAGE_KEY,V8_BACKUP_KEY,saveV8CapitalState} from '../exact-persistence-v8.ts'
import {readV8Raw} from './v8-ui-test-helper.ts'

const mounted:VueWrapper[]=[]
beforeEach(()=>localStorage.clear())
afterEach(()=>mounted.splice(0).forEach(w=>w.unmount()))

function start(){
 const wrapper=mount(App,{attachTo:document.body})
 mounted.push(wrapper)
 return wrapper
}

describe('V8 active App accounting, migration and resilience',()=>{
 it('starts a fresh V9 account and ignores the old V7 save without deleting it',async()=>{
  const legacy=createCapitalState({balance:1000,lifetimeEarned:1000,purchasedUpgrades:0},Date.now())
  const original=JSON.stringify(legacy)
  localStorage.setItem('capital-idle-save-v7',original)
  const wrapper=start()
  expect(readV8Raw().version).toBe(9)
  expect(readV8Raw().game.balance).toBe('0')
  expect(localStorage.getItem(V8_BACKUP_KEY)).toBeNull()
  await wrapper.find('.tap-zone').trigger('click')
  await nextTick()
  expect(readV8Raw().game.balance).toBe('100')
  expect(readV8Raw().stats.clickCount).toBe(1)
  expect(localStorage.getItem('capital-idle-save-v7')).toBe(original)
 })

 it('renders huge V8 wealth and sources, credits without losing exact cents',async()=>{
  const huge=10n**116n
  const base=createV8CapitalState(Date.now())
  const state={...base,game:{...base.game,balance:huge.toString(),lifetimeEarned:huge.toString()},
    stats:{...base.stats,earnedBySource:{...base.stats.earnedBySource,unclassified:huge.toString()}}}
  expect(saveV8CapitalState(localStorage,state)).toBe(true)
  const wrapper=start()
  expect(wrapper.find('.balance-value').text()).toMatch(/1\.00[A-Z]{2,} \$/) // extends beyond Q/QQ
  await wrapper.find('.tap-zone').trigger('click')
  expect(readV8Raw().game.balance).toBe((huge+100n).toString())
  expect(readV8Raw().game.lifetimeEarned).toBe((huge+100n).toString())
  await wrapper.findAll('.bottom-nav button')[5]!.trigger('click')
  expect(wrapper.find('.stats-overview').text()).not.toContain('Infinity')
  expect(wrapper.find('.stats-assets').text()).not.toContain('Infinity')
  expect(wrapper.find('.stats-overview').text()).toMatch(/1\.00[A-Z]{2,} \$/)
 })

 it('invalid V8 blocks gameplay and preserves original bytes',async()=>{
  const broken=JSON.stringify({version:8,game:{balance:'invalid'}})
  localStorage.setItem(V8_STORAGE_KEY,broken)
  const wrapper=start()
  expect(wrapper.find('.save-load-blocked').text()).toContain('Sauvegarde non chargée')
  await wrapper.find('.tap-zone').trigger('click')
  expect(localStorage.getItem(V8_STORAGE_KEY)).toBe(broken)
  await wrapper.findAll('.bottom-nav button')[5]!.trigger('click')
  await wrapper.find('.backup-reset').trigger('click')
  await wrapper.find('#reset-code').setValue('RESET')
  await wrapper.find('.backup-confirm-danger').trigger('click')
  await nextTick()
  expect(readV8Raw().game.balance).toBe('0')
  expect(wrapper.find('.save-load-blocked').exists()).toBe(false)
 })
})
