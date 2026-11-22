import {beforeEach,afterEach,describe,it,expect} from 'vitest'
import {mount,type VueWrapper} from '@vue/test-utils'
import {nextTick} from 'vue'
import App from '../App.vue'
import {createV8CapitalState,getExactAmount as v,type V8CapitalState} from '../exact-state-v8.ts'
import {v8BuyFameV4UpgradeMax} from '../prestige/fame-v4-ledger.ts'
import {V8_STORAGE_KEY,prepareV8SaveImport} from '../exact-persistence-v8.ts'
import {readV8Raw} from './v8-ui-test-helper.ts'
const mounted:VueWrapper[]=[]
beforeEach(()=>localStorage.clear())
afterEach(()=>mounted.splice(0).forEach(w=>w.unmount()))
function boot(powers:number[],auto=0):VueWrapper{
 const now=Date.now(),base=createV8CapitalState(now),p=base.prestige
 const fame=180_000n*1_000_000n
 let state:V8CapitalState={...base,
  game:{...base.game,balance:(10n**35n).toString(),lifetimeEarned:(10n**35n).toString()},
  prestige:{...p,fameMicros:(v(p.fameMicros)+fame).toString(),
    lifetimeFameMicros:(v(p.lifetimeFameMicros)+fame).toString(),
    levelFameMicros:(v(p.levelFameMicros)+fame).toString(),
    cycleEarnedFameMicros:(v(p.cycleEarnedFameMicros)+fame).toString(),
    cycleLevelFameMicros:(v(p.cycleLevelFameMicros)+fame).toString()},
  ascension:{...base.ascension,run:{...base.ascension.run,
    autoClickLevel:auto,lastAutomationAtRealMs:auto?now:undefined}},
 }
 for(const power of powers){
  const upgraded=v8BuyFameV4UpgradeMax(state,'fame-v4-'+String(power).padStart(2,'0'),0)
  if(!upgraded)throw Error('Missing Fame '+power)
  state=upgraded
 }
 localStorage.setItem(V8_STORAGE_KEY,JSON.stringify(state))
 const w=mount(App,{attachTo:document.body})
 mounted.push(w)
 return w
}
describe('Fame V4 Clicks pass 6, mobile home and immutable V8 transactions',()=>{
 it('shows every click power, manual frenzy and independent charged and chain hints',async()=>{
  const w=boot([19,20,21,22,23])
  await nextTick()
  expect(w.find('.home-fame-click-v4').exists()).toBe(true)
  for(const title of ['Billet légendaire','Surcharge automatique','Clic chargé','Réaction en chaîne'])
    expect(w.find('.home-fame-click-v4').text()).toContain(title)
  expect(w.find('[aria-label="Surcharge automatique"] button').attributes('disabled')).toBeDefined()
  for(let i=0;i<10;i++)await w.find('.tap-zone').trigger('click')
  const saved=readV8Raw()
  expect(saved.ascension.run.fameV4Clicks?.manualTimestamps).toHaveLength(10)
  expect(w.find('.home-click-v4-title').text()).toContain('ACTIVE +25 %')
  expect(saved.stats.clickCount).toBeGreaterThanOrEqual(10)
  expect(prepareV8SaveImport(JSON.stringify(saved),Date.now()).ok).toBe(true)
 })
 it('activates surcharge with dollar Auto Click, records cooldown and never creates extra tap popups',async()=>{
  const w=boot([21],1)
  await nextTick()
  const box=w.find('[aria-label="Surcharge automatique"]')
  expect(box.text()).toContain('ACTIVER')
  const prior=readV8Raw()
  await box.find('button').trigger('click')
  const next=readV8Raw()
  expect(next.ascension.run.fameV4Clicks?.overcharge).toBeDefined()
  expect(next.ascension.run.fameV4Clicks?.overcharge?.endsAt).toBeGreaterThan(
    next.ascension.run.fameV4Clicks?.overcharge?.startedAt??0)
  expect(next.prestige.lifetimeFameMicros).toBe(prior.prestige.lifetimeFameMicros)
  expect(w.find('.floating-gain').exists()).toBe(false)
  expect(box.find('button').attributes('disabled')).toBeDefined()
  expect(prepareV8SaveImport(JSON.stringify(next),Date.now()).ok).toBe(true)
 })
 it('legendary ticket is an explicit separate claim, not auto-awarded on tap or offline boot',async()=>{
  const w=boot([20])
  await nextTick()
  const panel=w.find('[aria-label="Billet légendaire"]')
  expect(panel.exists()).toBe(true)
  expect(panel.text()).toContain('Prochain billet dans')
  const before=readV8Raw()
  expect(before.ascension.run.fameV4Clicks?.legendaryAnchorAt).not.toBeNull()
  await w.find('.tap-zone').trigger('click')
  const after=readV8Raw()
  expect(after.stats.clickCount).toBe(before.stats.clickCount+1)
  expect(after.ascension.run.fameV4Clicks?.legendaryAnchorAt).
    toBe(before.ascension.run.fameV4Clicks?.legendaryAnchorAt)
 })
 it('does not alter classic tapping, UI or save when all Fame Click ranks are zero',async()=>{
  const w=boot([])
  expect(w.find('.home-fame-click-v4').exists()).toBe(false)
  const start=readV8Raw()
  await w.find('.tap-zone').trigger('click')
  const after=readV8Raw()
  expect(after.stats.clickCount).toBe(start.stats.clickCount+1)
  expect(after.ascension.run.fameV4Clicks).toBeUndefined()
  expect(w.find('.home-upgrade-list').exists()).toBe(true)
 })
})
