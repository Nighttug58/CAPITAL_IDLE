import { beforeEach,afterEach,describe,it,expect } from 'vitest'
import { mount,type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../App.vue'
import { createV8CapitalState,getExactAmount as v,type V8CapitalState } from '../exact-state-v8.ts'
import { v8BuyFameV4UpgradeMax } from '../prestige/fame-v4-ledger.ts'
import { v8BuyCollection } from '../exact-runtime-v8.ts'
import { CURRENT_COLLECTION_SLOTS } from '../prestige/catalog.ts'
import { V8_STORAGE_KEY,prepareV8SaveImport } from '../exact-persistence-v8.ts'
import { readV8Raw } from './v8-ui-test-helper.ts'
const mounted:VueWrapper[]=[]
beforeEach(()=>localStorage.clear())
afterEach(()=>mounted.splice(0).forEach(w=>w.unmount()))
function view(...ranks:number[]):VueWrapper{
 const now=Date.now(),base=createV8CapitalState(now),p=base.prestige
 const fame=120_000n*1_000_000n
 let state:V8CapitalState={...base,
  game:{...base.game,balance:(10n**35n).toString(),lifetimeEarned:(10n**35n).toString()},
  prestige:{...p,fameMicros:(v(p.fameMicros)+fame).toString(),
   lifetimeFameMicros:(v(p.lifetimeFameMicros)+fame).toString(),
   levelFameMicros:(v(p.levelFameMicros)+fame).toString(),
   cycleEarnedFameMicros:(v(p.cycleEarnedFameMicros)+fame).toString(),
   cycleLevelFameMicros:(v(p.cycleLevelFameMicros)+fame).toString()},
 }
 for(let i=0;i<3;i++)state=v8BuyCollection(state,CURRENT_COLLECTION_SLOTS[i]!.id)!
 for(const rank of ranks){
  const bought=v8BuyFameV4UpgradeMax(state,'fame-v4-'+String(rank).padStart(2,'0'),0)
  if(!bought)throw Error('Cannot unlock Fame '+rank)
  state=bought
 }
 localStorage.setItem(V8_STORAGE_KEY,JSON.stringify(state))
 const wrapper=mount(App,{attachTo:document.body})
 mounted.push(wrapper)
 return wrapper
}
async function openCollection(w:VueWrapper){
 await w.findAll('.bottom-nav button')[3]!.trigger('click')
 await nextTick()
 return w.find('.collection-screen')
}
describe('Fame Shop V4 Collections pass 5 UI',()=>{
 it('activates all five collection tools and persistently restores an owned object',async()=>{
  const w=view(14,15,16,17,18)
  const screen=await openCollection(w)
  const panel=screen.find('.collection-v4-panel')
  expect(panel.exists()).toBe(true)
  expect(panel.find('[aria-label="Expositions temporaires"]').exists()).toBe(true)
  expect(panel.find('[aria-label="Restauration de prestige"]').exists()).toBe(true)
  expect(panel.find('[aria-label="Expert en antiquités"]').text()).toContain('97 objets manquants')
  expect(panel.find('[aria-label="Ventes privées"]').exists()).toBe(true)
  expect(panel.find('[aria-label="Mécène impérial"]').exists()).toBe(true)
  const old=readV8Raw()
  await screen.find('.collection-card').trigger('click')
  const restore=screen.find('[aria-label="Restaurer cette pièce"]')
  expect(restore.exists()).toBe(true)
  await restore.find('button').trigger('click')
  expect(restore.find('[aria-label="Confirmer la restauration"]').exists()).toBe(true)
  await restore.find('[aria-label="Confirmer la restauration"] button').trigger('click')
  await nextTick()
  const after=readV8Raw()
  expect(after.prestige.fameV4Collections?.restoredIds).toHaveLength(1)
  expect(after.prestige.ownedCollectionIds.length).toBe(3)
  expect(after.prestige.collectionFameMicros).toBe(old.prestige.collectionFameMicros)
  expect(after.game.balance).not.toBe(old.game.balance)
  expect(prepareV8SaveImport(JSON.stringify(after),Date.now()).ok).toBe(true)
 })
 it('confirms wing and exhibition costs separately and never duplicates Fame',async()=>{
  const w=view(14,18)
  const screen=await openCollection(w)
  const start=readV8Raw()
  await screen.find('[aria-label="Mécène impérial"] button').trigger('click')
  expect(screen.find('.collection-v4-confirm').text()).toContain('Aile 1')
  await screen.find('.collection-v4-confirm button').trigger('click')
  let after=readV8Raw()
  expect(after.prestige.fameV4Collections?.wingTiers).toEqual([0])
  expect(after.prestige.collectionFameMicros).toBe(start.prestige.collectionFameMicros)
  await screen.find('[aria-label="Expositions temporaires"] button').trigger('click')
  expect(screen.find('.collection-v4-confirm').text()).toContain('Exposition')
  await screen.find('.collection-v4-confirm button').trigger('click')
  after=readV8Raw()
  expect(after.prestige.fameV4Collections?.exhibition).not.toBeNull()
  expect(after.prestige.collectionFameMicros).toBe(start.prestige.collectionFameMicros)
  expect(screen.find('[aria-label="Expositions temporaires"] button').attributes('disabled')).toBeDefined()
  expect(prepareV8SaveImport(JSON.stringify(after),Date.now()).ok).toBe(true)
 })
 it('private offer shows actual discounted price, purchases once, and keeps 100/100 intact',async()=>{
  const w=view(17)
  const screen=await openCollection(w)
  const offers=screen.find('[aria-label="Ventes privées"]')
  expect(offers.findAll('.collection-v4-row')).toHaveLength(5)
  await offers.find('.collection-v4-row button').trigger('click')
  await nextTick()
  expect(screen.find('.collection-detail-data').text()).toContain('Offre −5 %')
  const before=readV8Raw()
  await screen.find('.collection-buy-button').trigger('click')
  if(screen.find('.collection-confirm-buy').exists())await screen.find('.collection-confirm-buy').trigger('click')
  const after=readV8Raw()
  expect(after.prestige.ownedCollectionIds.length).toBe(before.prestige.ownedCollectionIds.length+1)
  expect(after.prestige.fameV4Collections?.offers?.items.filter(x=>x.used)).toHaveLength(1)
  expect(prepareV8SaveImport(JSON.stringify(after),Date.now()).ok).toBe(true)
 })
 it('keeps old V8 collections interface unchanged when V4 ranks are zero',async()=>{
  const w=view()
  const screen=await openCollection(w)
  expect(screen.find('.collection-v4-panel').exists()).toBe(false)
  expect(screen.findAll('.collection-card')).toHaveLength(20)
  expect(screen.find('.collection-v3-museum').text()).toContain('3/100')
 })
})
