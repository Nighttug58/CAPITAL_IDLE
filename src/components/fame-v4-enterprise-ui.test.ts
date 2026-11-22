import { beforeEach,afterEach,describe,it,expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../App.vue'
import { createV8CapitalState,getExactAmount as v,type V8CapitalState } from '../exact-state-v8.ts'
import { v8BuyFameV4UpgradeMax } from '../prestige/fame-v4-ledger.ts'
import { V8_STORAGE_KEY,prepareV8SaveImport } from '../exact-persistence-v8.ts'
import { readV8Raw } from './v8-ui-test-helper.ts'
const mounted:VueWrapper[]=[]
beforeEach(()=>localStorage.clear())
afterEach(()=>mounted.splice(0).forEach(x=>x.unmount()))
function boot(...powers:number[]):VueWrapper{
 const base=createV8CapitalState(Date.now()),p=base.prestige
 const fame=200_000n*1_000_000n,cash=10n**30n
 let state:V8CapitalState={...base,
  game:{...base.game,balance:cash.toString(),lifetimeEarned:cash.toString()},
  enterprises:{...base.enterprises,owned:{
   kiosque:{level:20,investedCents:'20000000'},
   cafe:{level:20,investedCents:'30000000'}}},
  prestige:{...p,fameMicros:(v(p.fameMicros)+fame).toString(),
   lifetimeFameMicros:(v(p.lifetimeFameMicros)+fame).toString(),
   levelFameMicros:(v(p.levelFameMicros)+fame).toString(),
   cycleEarnedFameMicros:(v(p.cycleEarnedFameMicros)+fame).toString(),
   cycleLevelFameMicros:(v(p.cycleLevelFameMicros)+fame).toString()},
 }
 for(const num of powers){
  const bought=v8BuyFameV4UpgradeMax(state,'fame-v4-'+String(num).padStart(2,'0'),0)
  if(!bought)throw Error('Missing fame '+num)
  state=bought
 }
 localStorage.setItem(V8_STORAGE_KEY,JSON.stringify(state))
 const view=mount(App,{attachTo:document.body})
 mounted.push(view)
 return view
}
async function screen(w:VueWrapper){
 await w.findAll('.bottom-nav button')[2]!.trigger('click')
 await nextTick()
 return w.find('.enterprise-screen')
}
describe('Enterprise Fame V4 pass 4 UI',()=>{
 it('configures unique synergy, franchise and board with exact save, cooldown and discounted MAX',async()=>{
  const w=boot(8,9,12,13)
  const s=await screen(w)
  expect(s.find('.enterprise-v4-panel').exists()).toBe(true)
  const synergy=s.find('[aria-label="Synergies industrielles"]')
  await synergy.findAll('select')[0]!.setValue('kiosque')
  await synergy.findAll('select')[1]!.setValue('cafe')
  await synergy.find('button').trigger('click')
  expect(readV8Raw().enterprises.fameV4Enterprise?.synergy).toEqual(['kiosque','cafe'])
  const franchise=s.find('[aria-label="Franchise internationale"]')
  await franchise.find('select').setValue('kiosque')
  await franchise.find('button').trigger('click')
  expect(readV8Raw().enterprises.fameV4Enterprise?.franchise?.id).toBe('kiosque')
  await franchise.find('select').setValue('cafe')
  await franchise.find('button').trigger('click')
  expect(readV8Raw().enterprises.fameV4Enterprise?.franchise?.id).toBe('kiosque')
  const board=s.find('[aria-label="Conseil d’administration"]')
  await board.find('select').setValue('cafe')
  await board.find('button').trigger('click')
  expect(readV8Raw().enterprises.fameV4Enterprise?.board?.id).toBe('cafe')
  expect(s.find('[aria-label="Recherche et développement"]').text()).toContain('8.0')
  const row=s.findAll('.enterprise-card').find(x=>x.text().includes('Kiosque'))!
  expect(row.text()).toContain('MAX +')
  expect(prepareV8SaveImport(JSON.stringify(readV8Raw()),Date.now()).ok).toBe(true)
 })
 it('requires confirmation for contract risk, then settles a single capital debit',async()=>{
  const w=boot(10)
  const s=await screen(w)
  const contract=s.find('[aria-label="Contrats gouvernementaux"]')
  expect(contract.text()).toContain('0/5')
  await contract.find('input').setValue('1000000')
  await contract.find('button').trigger('click')
  expect(s.find('.enterprise-v4-confirm').text()).toContain('Immobiliser')
  const initial=v(readV8Raw().game.balance)
  await s.find('.enterprise-v4-confirm button:last-child').trigger('click')
  expect(v(readV8Raw().game.balance)).toBe(initial)
  await contract.find('button').trigger('click')
  await s.find('.enterprise-v4-confirm button').trigger('click')
  await nextTick()
  const after=readV8Raw()
  expect(v(after.game.balance)).toBe(initial-100_000_000n)
  expect(after.enterprises.fameV4Enterprise?.contracts).toHaveLength(1)
  expect(contract.text()).toContain('1/5')
  expect(prepareV8SaveImport(JSON.stringify(after),Date.now()).ok).toBe(true)
 })
 it('one-time mega-project costs cash and displays active category boost without double spending',async()=>{
  const w=boot(11)
  const s=await screen(w)
  const project=s.find('[aria-label="Méga-infrastructures"]')
  const before=v(readV8Raw().game.balance)
  await project.find('button').trigger('click')
  expect(s.find('.enterprise-v4-confirm').text()).toContain('Dépenser définitivement')
  await s.find('.enterprise-v4-confirm button').trigger('click')
  const after=readV8Raw()
  expect(v(after.game.balance)).toBe(before-10n**12n)
  expect(after.enterprises.fameV4Enterprise?.usedProjectTiers).toEqual([0])
  expect(project.text()).toContain('30m')
  expect(project.find('button').attributes('disabled')).toBeDefined()
  expect(prepareV8SaveImport(JSON.stringify(after),Date.now()).ok).toBe(true)
 })
 it('old V8 hides management panel and retains normal enterprise interactions',async()=>{
  const w=boot()
  const s=await screen(w)
  expect(s.find('.enterprise-v4-panel').exists()).toBe(false)
  expect(s.findAll('.enterprise-card')).toHaveLength(20)
  expect(s.findAll('.enterprise-category')).toHaveLength(5)
 })
})
