import {beforeEach,afterEach,describe,it,expect} from 'vitest'
import {mount,type VueWrapper} from '@vue/test-utils'
import {nextTick} from 'vue'
import App from '../App.vue'
import {createV8CapitalState,getExactAmount as v,type V8CapitalState} from '../exact-state-v8.ts'
import {v8BuyFameV4UpgradeMax} from '../prestige/fame-v4-ledger.ts'
import {v8AccrueTax} from '../exact-runtime-v8.ts'
import {V8_STORAGE_KEY,prepareV8SaveImport} from '../exact-persistence-v8.ts'
import {readV8Raw} from './v8-ui-test-helper.ts'
const mounted:VueWrapper[]=[]
beforeEach(()=>localStorage.clear())
afterEach(()=>mounted.splice(0).forEach(w=>w.unmount()))
function boot():VueWrapper{
 const now=Date.now(),base=createV8CapitalState(now),p=base.prestige
 const fame=180_000n*1_000_000n
 let state:V8CapitalState={...base,game:{...base.game,
    balance:(10n**35n).toString(),lifetimeEarned:(10n**35n).toString()},
  prestige:{...p,fameMicros:(v(p.fameMicros)+fame).toString(),
    lifetimeFameMicros:(v(p.lifetimeFameMicros)+fame).toString(),
    levelFameMicros:(v(p.levelFameMicros)+fame).toString(),
    cycleEarnedFameMicros:(v(p.cycleEarnedFameMicros)+fame).toString(),
    cycleLevelFameMicros:(v(p.cycleLevelFameMicros)+fame).toString()}}
 for(const power of [24,25,26,27]){
  const updated=v8BuyFameV4UpgradeMax(state,'fame-v4-'+power,0)
  if(!updated)throw Error('Missing tax power '+power)
  state=updated
 }
 state=v8AccrueTax(state,'stocks',100_000_000n)
 localStorage.setItem(V8_STORAGE_KEY,JSON.stringify(state))
 const w=mount(App,{attachTo:document.body})
 mounted.push(w)
 return w
}
describe('Fiscal Fame V4 pass7 Stats',()=>{
 it('shows permanent fiscal powers and an exact read-only report',async()=>{
  const w=boot()
  await w.find('button[aria-label="Navigation principale"]')?.exists()
  const stats=w.findAll('.bottom-nav button').find(b=>b.text().includes('Stats'))!
  await stats.trigger('click')
  await nextTick()
  const panel=w.find('[aria-label="Fiscalité Fame V4"]')
  expect(panel.exists()).toBe(true)
  expect(panel.text()).toContain('RÉSERVE PROTÉGÉE')
  expect(panel.text()).toContain('FIDÉLITÉ FISCALE')
  expect(panel.text()).toContain('ÉCHELONNEMENT')
  expect(panel.text()).toContain('Optimisation patrimoniale')
  expect(readV8Raw().fiscal.taxesDueCents).not.toBe('0')
 })
 it('creates exactly one installment plan on confirmation, preserving V8 saves',async()=>{
  const w=boot()
  await w.findAll('.bottom-nav button').find(b=>b.text().includes('Stats'))!.trigger('click')
  const box=w.find('[aria-label="Fiscalité Fame V4"]')
  const button=box.findAll('button').find(b=>b.text().includes('versements de 12 h'))!
  expect(button.attributes('disabled')).toBeUndefined()
  const before=readV8Raw()
  await button.trigger('click')
  expect(box.text()).toContain('Créer un plan fiscal irréversible')
  await box.findAll('button').find(b=>b.text()==='Confirmer')!.trigger('click')
  await nextTick()
  const after=readV8Raw()
  expect(after.fiscal.fameV4Tax?.plan?.installments).toBe(6)
  expect(v(after.game.balance)).toBeLessThan(v(before.game.balance))
  expect(v(after.fiscal.fameV4Tax?.managementFeesPaidCents??'0')).toBeGreaterThan(0n)
  expect(prepareV8SaveImport(JSON.stringify(after),Date.now()).ok).toBe(true)
 })
})
