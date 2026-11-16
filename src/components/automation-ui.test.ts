import {readV8LegacyUI} from './v8-ui-test-helper.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import App from '../App.vue'
import { createCapitalState, type CapitalState } from '../capital.ts'
import { performPrestige } from '../ascension/engine.ts'
import { buyAscensionUpgrade } from '../ascension/shop.ts'

const KEY='capital-idle-save-v7'
const mounted: VueWrapper[]=[]
beforeEach(()=>localStorage.clear())
afterEach(()=>mounted.splice(0).forEach(wrapper=>wrapper.unmount()))
function withPP(): CapitalState {
  const now=Date.now()
  const first=createCapitalState({balance:10_000_000_000,lifetimeEarned:10_000_000_000,purchasedUpgrades:0},now)
  const result=performPrestige(first,now)
  if(!result.ok) throw new Error('Prestige fixture')
  return result.state
}
function mountState(state:CapitalState) {
  localStorage.setItem(KEY,JSON.stringify(state))
  const wrapper=mount(App,{attachTo:document.body})
  mounted.push(wrapper)
  return {wrapper,stored:():CapitalState=>readV8LegacyUI()}
}
async function prestige(wrapper: VueWrapper) {
  await wrapper.find('.prestige-launch').trigger('click')
}

describe('Prestige passe 6 — contrôles des automatismes',()=>{
  it('présente les quatre assistants verrouillés et les 16 upgrades existants',async()=>{
    const {wrapper}=mountState(withPP())
    await prestige(wrapper)
    expect(wrapper.findAll('.automation-switch')).toHaveLength(4)
    expect(wrapper.find('.automation-panel').text()).toContain('Automatisations')
    expect(wrapper.find('.automation-locked').exists()).toBe(true)
    expect(wrapper.findAll('.automation-switch button:disabled')).toHaveLength(4)
    expect(wrapper.findAll('.ascension-upgrade')).toHaveLength(16)
    expect(wrapper.find('.automation-orders').exists()).toBe(false)
    expect(wrapper.findAll('.bottom-nav button').at(-1)?.text()).toBe('Stats')
  })

  it('Auto Click se débloque, s’active et sa préférence survit au rechargement',async()=>{
    const {wrapper,stored}=mountState(withPP())
    await prestige(wrapper)
    await wrapper.find('.ascension-upgrade[data-upgrade="auto-click"] .ascension-buy').trigger('click')
    expect(wrapper.find('.automation-switch button').attributes('disabled')).toBeUndefined()
    await wrapper.find('.automation-switch button').trigger('click')
    expect(stored().ascension.run.automation.autoClickEnabled).toBe(true)
    expect(wrapper.find('.automation-switch button').attributes('aria-pressed')).toBe('true')
    wrapper.unmount(); mounted.splice(mounted.indexOf(wrapper),1)
    const restarted=mount(App,{attachTo:document.body});mounted.push(restarted)
    await prestige(restarted)
    expect(restarted.find('.automation-switch button').attributes('aria-pressed')).toBe('true')
  })

  it('paramètre budgets, seuils et actifs et écrit le JSON atomiquement',async()=>{
    const {wrapper,stored}=mountState(withPP())
    await prestige(wrapper)
    for (const upgrade of ['auto-investor','auto-trader']) {
      await wrapper.find(`.ascension-upgrade[data-upgrade="${upgrade}"] .ascension-buy`).trigger('click')
    }
    const fields=wrapper.findAll('.automation-fields input')
    expect(fields).toHaveLength(5)
    await fields[0]!.setValue('500')
    await fields[1]!.setValue('100')
    await fields[2]!.setValue('700')
    await fields[3]!.setValue('12.5')
    await fields[4]!.setValue('7.5')
    await wrapper.find('.automation-save').trigger('click')
    const value=stored().ascension.run.automation
    expect(value.maxOrderCents).toBe(50_000)
    expect(value.cashReserveCents).toBe(10_000)
    expect(value.enterpriseBudgetCents).toBe(70_000)
    expect(value.takeProfitBps).toBe(1_250)
    expect(value.stopLossBps).toBe(750)
    const first=wrapper.find('.automation-assets-list input')
    await first.setValue(true)
    expect(stored().ascension.run.automation.allowedAssetIds.length).toBe(1)
  })

  it('ordres : déblocage, formulaire, annulation et solde intact',async()=>{
    const {wrapper,stored}=mountState(withPP())
    await prestige(wrapper)
    await wrapper.find('.ascension-upgrade[data-upgrade="automatic-orders"] .ascension-buy').trigger('click')
    expect(wrapper.find('.automation-orders').exists()).toBe(true)
    const before=stored().game.balance
    await wrapper.find('.automation-order-fields input').setValue('500')
    await wrapper.findAll('.automation-order-fields input')[1]!.setValue('1')
    await wrapper.find('.automation-orders .automation-save').trigger('click')
    expect(stored().ascension.run.marketOrders).toHaveLength(1)
    expect(stored().game.balance).toBe(before)
    expect(wrapper.findAll('.automation-pending article')).toHaveLength(1)
    await wrapper.find('.automation-pending button').trigger('click')
    expect(stored().ascension.run.marketOrders).toHaveLength(0)
    expect(wrapper.find('.automation-empty').exists()).toBe(true)
  })
})
