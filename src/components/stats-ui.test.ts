import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
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

describe('Stats : progression et patrimoine complet', () => {
  it('affiche toutes les sources, les niveaux, les entreprises et le bilan sans le compter deux fois', () => {
    const { wrapper } = setup()
    expect(wrapper.find('.stats-progress').exists()).toBe(true)
    expect(wrapper.find('.stats-enterprises').exists()).toBe(true)
    expect(wrapper.find('.stats-assets').exists()).toBe(true)
    expect(wrapper.findAll('.stats-source')).toHaveLength(7)
    expect(wrapper.find('.stats-source[data-source="unclassified"]').text()).toContain('Historique non ventilé')
    expect(wrapper.find('.stats-source[data-source="clicks"]').text()).toContain('Clics')
    expect(wrapper.find('.stats-source[data-source="dividends"]').text()).toContain('Dividendes')
    expect(wrapper.find('.stats-sources').text()).toContain('Pertes réalisées')
    expect(wrapper.find('.stats-assets').text()).toContain('Taxes encore dues')
    expect(wrapper.find('.stats-assets').text()).toContain('Fortune nette')
    expect(wrapper.find('.stats-progress-meter').attributes('role')).toBe('progressbar')
    expect(wrapper.find('.stats-progress-meter').attributes('aria-valuenow')).toBeDefined()
  })

  it('comptabilise un clic réel puis l affiche sur Stats sans changer le cumul historique', async () => {
    const now = Date.now()
    const state = createCapitalState({ balance: 100, lifetimeEarned: 100, purchasedUpgrades: 0 }, now)
    localStorage.setItem('capital-idle-save-v5', JSON.stringify(state))
    const wrapper = mount(App, { attachTo: document.body })
    mounted.push(wrapper)
    await wrapper.find('.tap-zone').trigger('click')
    await nextTick()
    const stored = JSON.parse(localStorage.getItem('capital-idle-save-v5')!) as CapitalState
    expect(stored.stats.clickCount).toBe(1)
    expect(stored.stats.earnedBySource.clicks).toBe(1)
    expect(stored.stats.earnedBySource.unclassified).toBe(100)
    expect(stored.game.lifetimeEarned).toBe(101)
    await wrapper.findAll('.bottom-nav button')[3]!.trigger('click')
    expect(wrapper.find('.stats-source[data-source="clicks"]').text()).toContain('1')
    expect(wrapper.find('.stats-progress').text()).toContain('101')
  })

  it('petits écrans : sections scrollables et mise en page à deux colonnes repliables', () => {
    const css = readFileSync('src/style.css', 'utf8')
    expect(css).toContain('.stats-scroll { flex:1 1 0; min-height:0; overflow:auto;')
    expect(css).toContain('.stats-mini-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr));')
    expect(css).toContain('@media(max-width:360px)')
    expect(css).toContain('.stats-source-track')
    expect(css).toContain('.stats-balance-result')
  })
})
