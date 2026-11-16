import {readV8LegacyUI} from './v8-ui-test-helper.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    expect(kiosk.text()).toContain('104,166667')
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
    expect(wrapper.find('.enterprise-card').text()).toContain('Possédée · niv. 1')
    expect(wrapper.find('.enterprise-card').text()).toContain('Achat confirmé')
    expect(wrapper.find('.enterprise-card button.enterprise-action').text()).toContain('AMÉLIORER')

    await wrapper.find('.enterprise-card button.enterprise-action').trigger('click')
    await nextTick()
    expect(getState().enterprises.owned.kiosque?.level).toBe(2)
    expect(getState().game.balance).toBe(925_000 - getEnterpriseUpgradeCostCents('kiosque', 1)! / 100)
    expect(wrapper.find('.enterprise-card').text()).toContain('niveau 2')
    expect(wrapper.find('.enterprise-summary').text()).toContain('1')
    expect(wrapper.find('.enterprise-card .enterprise-level-fill').attributes('aria-valuenow')).toBe('2')
    expect(getState().game.lifetimeEarned).toBe(1_000_000)
  })

  it('au niveau 20 le niveau 21 reste accessible sans revente', () => {
    const state = createCapitalState({ balance: 100_000, lifetimeEarned: 100_000, purchasedUpgrades: 0 }, START)
    state.enterprises.owned.kiosque = { level: 20, investedCents: 192_620_000 }
    const { wrapper } = setup(state)
    const kiosk = wrapper.find('.enterprise-card')
    expect(kiosk.text()).toContain('Possédée · niv. 20')
    expect(kiosk.text()).toContain('Prestige')
    expect(kiosk.find('button.enterprise-action').text()).toBe('AMÉLIORER')
    expect(kiosk.find('button.enterprise-action').attributes('disabled')).toBeDefined()
    expect(kiosk.text()).not.toContain('REVENDRE')
  })

  it('solde insuffisant : les boutons restent désactivés', () => {
    const state = createCapitalState({ balance: 0, lifetimeEarned: 1000, purchasedUpgrades: 0 }, START)
    const { wrapper } = setup(state)
    expect(wrapper.find('.enterprise-card button.enterprise-action').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.enterprise-category .enterprise-card').text()).toContain('75')
  })

  it('la navigation principale contient Entreprises et le clicker reste intact', async ({ onTestFinished }) => {
    vi.spyOn(Date, 'now').mockReturnValue(START)
    onTestFinished(() => vi.restoreAllMocks())
    const now = Date.now()
    const state = createCapitalState({ balance: 1_000_000, lifetimeEarned: 1_000_000, purchasedUpgrades: 0 }, now)
    localStorage.setItem('capital-idle-save-v7', JSON.stringify(state))
    const wrapper = mount(App, { attachTo: document.body })
    mounted.push(wrapper)
    const buttons = wrapper.findAll('.bottom-nav button')
    expect(buttons).toHaveLength(6)
    expect(buttons.map((button) => button.text())).toEqual(['Accueil', 'Trading', 'Entreprises', 'Collection', '', 'Stats'])
    await buttons[2]!.trigger('click')
    expect(wrapper.find('.enterprise-screen').isVisible()).toBe(true)
    await wrapper.find('.enterprise-card button.enterprise-action').trigger('click')
    await nextTick()
    expect(wrapper.find('.enterprise-card').text()).toContain('Possédée')
    const saved = readV8LegacyUI()
    expect(saved.enterprises.owned.kiosque?.level).toBe(1)
    expect(saved.game.balance).toBe(925_000)
    await buttons[0]!.trigger('click')
    expect(wrapper.find('.home-screen').isVisible()).toBe(true)
    expect(wrapper.find('.balance-value').text()).toContain('925.00K $')
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

it('V8 enterprise screen displays and upgrades a level 1000 company with huge exact cash', async () => {
  const { createV8CapitalState } = await import('../exact-state-v8.ts')
  const { saveV8CapitalState } = await import('../exact-persistence-v8.ts')
  const { getEnterpriseUpgradeCostCentsExact } = await import('../economy/catalog.ts')
  const { formatCompactUnits } = await import('../large-numbers.ts')
  const now=Date.now()
  const base=createV8CapitalState(now)
  const wealth=10n**110n
  const state={...base,
    game:{...base.game,balance:wealth.toString(),lifetimeEarned:wealth.toString()},
    enterprises:{...base.enterprises,owned:{kiosque:{level:1000,investedCents:'987654321'}}}}
  expect(saveV8CapitalState(localStorage,state)).toBe(true)
  const wrapper=mount(App,{attachTo:document.body})
  mounted.push(wrapper)
  await wrapper.findAll('.bottom-nav button')[2]!.trigger('click')
  await nextTick()
  const kiosk=wrapper.find('.enterprise-card')
  expect(kiosk.text()).toContain('Possédée · niv. 1000')
  expect(kiosk.text()).toContain('niv. 1025')
  const expectedCost=getEnterpriseUpgradeCostCentsExact('kiosque',1000)!
  expect(kiosk.text()).toContain(formatCompactUnits(expectedCost))
  expect(kiosk.text()).not.toContain('Infinity')
  expect(kiosk.find('button.enterprise-action').text()).toContain('AMÉLIORER')
  expect(kiosk.find('button.enterprise-action').attributes('disabled')).toBeUndefined()
  await kiosk.find('button.enterprise-action').trigger('click')
  await nextTick()
  const after=JSON.parse(localStorage.getItem('capital-idle-save-v8')!)
  expect(after.enterprises.owned.kiosque.level).toBe(1001)
  expect(after.enterprises.owned.kiosque.investedCents).toBe((987654321n+expectedCost).toString())
  expect(kiosk.text()).not.toContain('NIVEAU MAX')
  await wrapper.findAll('.bottom-nav button')[4]!.trigger('click')
  await nextTick()
  expect(wrapper.find('.stats-income-value').text()).not.toContain('Infinity')
  expect(wrapper.find('.stats-income-value').text()).toMatch(/[A-Z] \$\/s/)
})
