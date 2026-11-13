import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import App from '../App.vue'
import EnterpriseScreen from './EnterpriseScreen.vue'
import { createCapitalState, type CapitalState } from '../capital.ts'
import {
  buyEnterprise, upgradeEnterprise,
  type EnterpriseAction, type EnterpriseResult,
} from '../economy/enterprises.ts'
import { getEnterpriseUpgradeCostCents } from '../economy/catalog.ts'

const START = 1_800_000_000_000
const mounted: VueWrapper[] = []

function setup(original?: CapitalState) {
  let state = original ?? createCapitalState({
    balance: 1_000_000, lifetimeEarned: 1_000_000, purchasedUpgrades: 0,
  }, START)
  let wrapper: VueWrapper
  const executeEnterprise = (action: EnterpriseAction, id: string): EnterpriseResult => {
    const result = action === 'buy'
      ? buyEnterprise(state, id, START)
      : upgradeEnterprise(state, id, START)
    if (result.ok) {
      state = result.state
      void wrapper.setProps({ state })
    }
    return result
  }
  wrapper = mount(EnterpriseScreen, { props: { state, executeEnterprise }, attachTo: document.body })
  mounted.push(wrapper)
  return { wrapper, getState: () => state }
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { mounted.splice(0).forEach((wrapper) => wrapper.unmount()) })

describe('Entreprises : écran mobile et achats sans franchise', () => {
  it('affiche 20 entreprises, 5 catégories, le déblocage progressif et le revenu initial', () => {
    const { wrapper } = setup()
    expect(wrapper.findAll('.enterprise-category')).toHaveLength(5)
    expect(wrapper.findAll('.enterprise-card')).toHaveLength(20)
    const kiosk = wrapper.find('.enterprise-card')
    expect(kiosk.text()).toContain('Kiosque')
    expect(kiosk.text()).toContain('2,604167')
    expect(kiosk.text()).toContain('75')
    expect(kiosk.find('button.enterprise-action').attributes('disabled')).toBeUndefined()
    const locked = wrapper.findAll('.enterprise-card')[19]!
    expect(locked.text()).toContain('Groupe technologique')
    expect(locked.text()).toContain('Disponible') // niveau 50 atteint, mais prix de 300 Md$ inabordable
    expect(locked.find('button.enterprise-action').attributes('disabled')).toBeDefined()
    expect(wrapper.text().toLowerCase()).not.toContain('revendre')
    expect(wrapper.text().toLowerCase()).not.toContain('franchise')
  })

  it('achète une entreprise puis améliore son revenu, sans double achat', async () => {
    const { wrapper, getState } = setup()
    const button = wrapper.find('.enterprise-card button.enterprise-action')
    await button.trigger('click')
    await nextTick()
    expect(getState().enterprises.owned.kiosque?.level).toBe(1)
    expect(getState().game.balance).toBe(925_000)
    expect(wrapper.find('.enterprise-card').text()).toContain('Possédée · niv. 1/20')
    expect(wrapper.find('.enterprise-card').text()).toContain('Achat confirmé')
    expect(wrapper.find('.enterprise-card button.enterprise-action').text()).toContain('AMÉLIORER')

    await wrapper.find('.enterprise-card button.enterprise-action').trigger('click')
    await nextTick()
    expect(getState().enterprises.owned.kiosque?.level).toBe(2)
    expect(getState().game.balance).toBe(925_000 - getEnterpriseUpgradeCostCents('kiosque', 1)! / 100)
    expect(wrapper.find('.enterprise-card').text()).toContain('niveau 2/20')
    expect(wrapper.find('.enterprise-summary').text()).toContain('1')
    expect(wrapper.find('.enterprise-card .enterprise-level-fill').attributes('aria-valuenow')).toBe('2')
    expect(getState().game.lifetimeEarned).toBe(1_000_000)
  })

  it('au niveau 20 le bouton MAX est bloqué, sans option de revente', () => {
    const state = createCapitalState({ balance: 100_000, lifetimeEarned: 100_000, purchasedUpgrades: 0 }, START)
    state.enterprises.owned.kiosque = { level: 20, investedCents: 192_620_000 }
    const { wrapper } = setup(state)
    const kiosk = wrapper.find('.enterprise-card')
    expect(kiosk.text()).toContain('Possédée · niv. 20/20')
    expect(kiosk.text()).toContain('Prestige')
    expect(kiosk.find('button.enterprise-action').text()).toBe('MAX')
    expect(kiosk.find('button.enterprise-action').attributes('disabled')).toBeDefined()
    expect(kiosk.text()).not.toContain('REVENDRE')
  })

  it('solde insuffisant : les boutons restent désactivés', () => {
    const state = createCapitalState({ balance: 0, lifetimeEarned: 1000, purchasedUpgrades: 0 }, START)
    const { wrapper } = setup(state)
    expect(wrapper.find('.enterprise-card button.enterprise-action').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.enterprise-category .enterprise-card').text()).toContain('75')
  })

  it('la navigation principale contient Entreprises et le clicker reste intact', async () => {
    const now = Date.now()
    const state = createCapitalState({ balance: 1_000_000, lifetimeEarned: 1_000_000, purchasedUpgrades: 0 }, now)
    localStorage.setItem('capital-idle-save-v6', JSON.stringify(state))
    const wrapper = mount(App, { attachTo: document.body })
    mounted.push(wrapper)
    const buttons = wrapper.findAll('.bottom-nav button')
    expect(buttons).toHaveLength(4)
    expect(buttons.map((button) => button.text())).toEqual(['Accueil', 'Trading', 'Entreprises', 'Stats'])
    await buttons[2]!.trigger('click')
    expect(wrapper.find('.enterprise-screen').isVisible()).toBe(true)
    await wrapper.find('.enterprise-card button.enterprise-action').trigger('click')
    await nextTick()
    expect(wrapper.find('.enterprise-card').text()).toContain('Possédée')
    const saved = JSON.parse(localStorage.getItem('capital-idle-save-v6')!) as CapitalState
    expect(saved.enterprises.owned.kiosque?.level).toBe(1)
    expect(saved.game.balance).toBeGreaterThanOrEqual(925_000)
    expect(saved.game.balance).toBeLessThan(925_005)
    await buttons[0]!.trigger('click')
    expect(wrapper.find('.home-screen').isVisible()).toBe(true)
    expect(wrapper.find('.balance-value').text()).toContain(new Intl.NumberFormat('fr-CH').format(925_000))
    await buttons[1]!.trigger('click')
    expect(wrapper.find('.trading-screen').isVisible()).toBe(true)
  })

  it('la liste est scrollable dans l écran, sans agrandir la navigation sur petit mobile', () => {
    const css = readFileSync('src/style.css', 'utf8')
    expect(css).toContain('.enterprise-list-scroll {')
    expect(css).toMatch(/\.enterprise-list-scroll \{[^}]*overflow-y: auto/)
    expect(css).toMatch(/\.enterprise-screen \{[^}]*min-height: 0; overflow: hidden/)
    expect(css).toContain('@media (max-width: 360px)')
    expect(css).toContain('.bottom-nav .nav-home { min-width: 0; flex: 1 1 0;')
  })
})
