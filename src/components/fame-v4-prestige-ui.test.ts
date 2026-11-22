import {beforeEach,afterEach,describe,it,expect} from 'vitest'
import {mount,type VueWrapper} from '@vue/test-utils'
import {nextTick} from 'vue'
import App from '../App.vue'
import {createV8CapitalState,getExactAmount as v,type V8CapitalState} from '../exact-state-v8.ts'
import {v8BuyFameV4UpgradeMax} from '../prestige/fame-v4-ledger.ts'
import {v8CreditIncome,v8ClickBatch} from '../exact-runtime-v8.ts'
import {v8PerformPrestige} from '../exact-prestige-v8.ts'
import {V8_STORAGE_KEY,prepareV8SaveImport} from '../exact-persistence-v8.ts'
import {readV8Raw} from './v8-ui-test-helper.ts'
const mounted:VueWrapper[]=[]
beforeEach(()=>localStorage.clear())
afterEach(()=>mounted.splice(0).forEach(w=>w.unmount()))
function boot(readyClicks=false){
 const now=Date.now(),base=createV8CapitalState(now),p=base.prestige
 const fame=200_000n*1_000_000n
 let state:V8CapitalState={...base,
  game:{...base.game,balance:(10n**40n).toString(),lifetimeEarned:(10n**40n).toString()},
  prestige:{...p,fameMicros:(v(p.fameMicros)+fame).toString(),
    lifetimeFameMicros:(v(p.lifetimeFameMicros)+fame).toString(),
    levelFameMicros:(v(p.levelFameMicros)+fame).toString(),
    cycleEarnedFameMicros:(v(p.cycleEarnedFameMicros)+fame).toString(),
    cycleLevelFameMicros:(v(p.cycleLevelFameMicros)+fame).toString()}}
 for(const id of [28,29,30]){
  const bought=v8BuyFameV4UpgradeMax(state,'fame-v4-'+id,0)
  if(!bought)throw Error('Missing Fame '+id)
  state=bought
 }
 const matured=v8CreditIncome(state,'clicks',10n**25n)
 const prestige=v8PerformPrestige(matured,now)
 if(!prestige.ok)throw Error(prestige.reason)
 state=prestige.state
 if(readyClicks)state=v8ClickBatch(state,100n,now)
 localStorage.setItem(V8_STORAGE_KEY,JSON.stringify(state))
 const wrapper=mount(App,{attachTo:document.body})
 mounted.push(wrapper)
 return wrapper
}
describe('Fame V4 Prestige pass8 UI and strict V8 storage',()=>{
 it('shows all three power panels and keeps 10 challenge entries mobile scrollable',async()=>{
  const w=boot()
  await w.find('.prestige-launch').trigger('click')
  await nextTick()
  const panel=w.find('[data-fame-v4-prestige]')
  expect(panel.exists()).toBe(true)
  expect(panel.find('[data-v4-renaissance]').text()).toContain('Renaissance fulgurante')
  expect(panel.find('[data-v4-destiny]').text()).toContain('Spécialisation du cycle')
  expect(panel.findAll('[data-v4-challenge]')).toHaveLength(10)
  expect(panel.text()).toContain('100 clics')
  expect(panel.text()).toContain('Actif')
  expect(panel.findAll('[data-v4-destiny] button')).toHaveLength(3)
 })
 it('requires explicit confirmation of one Destiny choice, persisted across reload',async()=>{
  const w=boot()
  await w.find('.prestige-launch').trigger('click')
  const area=w.find('[data-v4-destiny]')
  const before=readV8Raw()
  await area.find('button[aria-label="Choisir Collectionneur"]').trigger('click')
  expect(area.find('.prestige-v4-confirm').exists()).toBe(true)
  expect(readV8Raw().ascension.run.fameV4Prestige?.specialization).toBeNull()
  await area.find('.prestige-v4-confirm button:last-child').trigger('click')
  await nextTick()
  const after=readV8Raw()
  expect(after.ascension.run.fameV4Prestige?.specialization).toBe('collector')
  expect(after.prestige.fameV4?.levels['fame-v4-30']).toBe(3)
  expect(after.ascension.progress.availablePoints).toBe(before.ascension.progress.availablePoints)
  expect(after.prestige.fameMicros).toBe(before.prestige.fameMicros)
  expect(area.text()).toContain('verrouillée')
  expect(area.findAll('button')).toHaveLength(0)
  expect(prepareV8SaveImport(JSON.stringify(after),Date.now()).ok).toBe(true)
 })
 it('claims an earned challenge once without double-reward or XP/Fame on claim',async()=>{
  const w=boot(true)
  await w.find('.prestige-launch').trigger('click')
  const row=w.find('[data-v4-challenge="1"]')
  expect(row.text()).toContain('RÉCUPÉRER')
  const before=readV8Raw()
  await row.find('button').trigger('click')
  await nextTick()
  const after=readV8Raw()
  expect(after.ascension.run.fameV4Prestige?.claimedChallenges).toEqual([1])
  expect(after.ascension.run.fameV4Prestige?.challengeBoost?.source).toBe('click')
  expect(after.prestige.experienceCents).toBe(before.prestige.experienceCents)
  expect(after.game.balance).toBe(before.game.balance)
  expect(row.find('button').attributes('disabled')).toBeDefined()
  expect(prepareV8SaveImport(JSON.stringify(after),Date.now()).ok).toBe(true)
 })
})
