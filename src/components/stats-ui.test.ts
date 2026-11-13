import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../App.vue'
import StatsScreen from './StatsScreen.vue'
import { createCapitalState, type CapitalState } from '../capital.ts'
import { accrueProfitTax } from '../economy/fiscal.ts'
import { payFiscalBalanceNow } from '../economy/clock.ts'

const mounted: VueWrapper[] = []
beforeEach(() => localStorage.clear())
afterEach(() => { mounted.splice(0).forEach((w) => w.unmount()) })

function setup() {
  const now = Date.now()
  let state: CapitalState = createCapitalState({
    balance: 10, lifetimeEarned: 100, purchasedUpgrades: 0,
  }, now)
  const taxed = accrueProfitTax(state, 'stocks', 10_000)
  if (!taxed) throw new Error('tax state')
  state = taxed
  let wrapper: VueWrapper
  const payTaxes = () => {
    const result = payFiscalBalanceNow(state, now + 30_000)
    if (result.ok) state = result.state
    void wrapper.setProps({ state })
    return result
  }
  wrapper = mount(StatsScreen, { props: { state, payTaxes }, attachTo: document.body })
  mounted.push(wrapper)
  return { wrapper, getState: () => state }
}

describe('Stats / fiscalité', () => {
  it('présente taxes dues, ventilation, taux et compteur de 72h', () => {
    const { wrapper } = setup()
    expect(wrapper.find('#stats').exists()).toBe(true)
    expect(wrapper.find('.stats-tax-due').text()).toContain('15')
    expect(wrapper.find('.stats-tax-title').text()).toContain('15 %')
    expect(wrapper.text()).toContain('72 heures réelles')
    expect(wrapper.text()).toContain('Actions')
    expect(wrapper.text()).toContain('Entreprises')
    expect(wrapper.findAll('.stats-tax-sources > div')).toHaveLength(5)
    expect(wrapper.find('.stats-tax-pay').attributes('disabled')).toBeUndefined()
  })

  it('le paiement requiert confirmation, permet le cash négatif puis désactive le bouton', async () => {
    const { wrapper, getState } = setup()
    await wrapper.find('button.stats-tax-pay').trigger('click')
    expect(wrapper.find('.stats-tax-confirm').exists()).toBe(true)
    expect(getState().game.balance).toBe(10)
    await wrapper.find('.stats-tax-confirm > div button').trigger('click')
    expect(wrapper.find('.stats-tax-confirm').exists()).toBe(false)
    expect(getState().fiscal.taxesDueCents).toBe(1500)
    await wrapper.find('button.stats-tax-pay').trigger('click')
    await wrapper.find('button.stats-tax-confirm-pay').trigger('click')
    await nextTick()
    expect(getState().game.balance).toBe(-5)
    expect(getState().fiscal.taxesPaidCents).toBe(1500)
    expect(getState().fiscal.taxesDueCents).toBe(0)
    expect(wrapper.find('.stats-tax-pay').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.stats-tax-notice').text()).toContain('72 h')
    expect(getState().game.lifetimeEarned).toBe(100)
  })

  it('Stats est le dernier onglet accessible, sans casser Accueil ni Trading', async () => {
    const now = Date.now()
    let state = createCapitalState({ balance: 100, lifetimeEarned: 100, purchasedUpgrades: 0 }, now)
    const taxed = accrueProfitTax(state, 'stocks', 10_000)
    expect(taxed).not.toBeNull()
    state = taxed!
    localStorage.setItem('capital-idle-save-v5', JSON.stringify(state))
    const wrapper = mount(App, { attachTo: document.body })
    mounted.push(wrapper)
    const nav = wrapper.findAll('.bottom-nav button')
    expect(nav.map((button) => button.text())).toEqual(['Accueil', 'Trading', 'Entreprises', 'Stats'])
    await nav[3]!.trigger('click')
    expect(wrapper.find('.stats-screen').isVisible()).toBe(true)
    expect(wrapper.find('.stats-tax-due').text()).toContain('15')
    await nav[0]!.trigger('click')
    expect(wrapper.find('.home-screen').isVisible()).toBe(true)
    await nav[1]!.trigger('click')
    expect(wrapper.find('.trading-screen').isVisible()).toBe(true)
  })
})
