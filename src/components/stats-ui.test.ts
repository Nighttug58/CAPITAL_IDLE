import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
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
  wrapper = mount(StatsScreen, {
    props: {
      state, payTaxes,
      exportSave: () => true,
      importSave: () => false,
      resetSave: () => false,
    }, attachTo: document.body,
  })
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
    localStorage.setItem('capital-idle-save-v6', JSON.stringify(state))
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
    localStorage.setItem('capital-idle-save-v6', JSON.stringify(state))
    const wrapper = mount(App, { attachTo: document.body })
    mounted.push(wrapper)
    await wrapper.find('.tap-zone').trigger('click')
    await nextTick()
    const stored = JSON.parse(localStorage.getItem('capital-idle-save-v6')!) as CapitalState
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

describe('Gestion des sauvegardes dans Stats', () => {
  it('place Exporter, Importer, Réinitialiser tout en bas sous la fiscalité', () => {
    const { wrapper } = setup()
    const buttons = wrapper.findAll('.stats-backup button.backup-action')
    expect(buttons.map(button => button.text())).toEqual([
      expect.stringContaining('Exporter la sauvegarde'),
      expect.stringContaining('Importer une sauvegarde'),
      'Réinitialiser la sauvegarde',
    ])
    expect(wrapper.find('.stats-scroll').element.lastElementChild?.classList.contains('stats-backup')).toBe(true)
    expect(wrapper.find('.backup-hidden').attributes('accept')).toContain('.json')
  })

  it('RESET exige exactement le code et Annuler garde la partie', async () => {
    const now = Date.now()
    const original = createCapitalState({ balance: 567, lifetimeEarned: 567, purchasedUpgrades: 0 }, now)
    original.fiscal.taxesDueCents = 750
    original.fiscal.dueBySourceCents.stocks = 750
    localStorage.setItem('capital-idle-save-v6', JSON.stringify(original))
    localStorage.setItem('capital-idle-save-v4', JSON.stringify({ version: 4, game: original.game, trading: original.trading }))
    const wrapper = mount(App, { attachTo: document.body })
    mounted.push(wrapper)
    await wrapper.findAll('.bottom-nav button')[3]!.trigger('click')

    await wrapper.find('.backup-reset').trigger('click')
    expect(wrapper.find('.backup-reset-confirm').exists()).toBe(true)
    expect(wrapper.find('.backup-confirm-danger').attributes('disabled')).toBeDefined()
    await wrapper.find('#reset-code').setValue('RESE')
    expect(wrapper.find('.backup-confirm-danger').attributes('disabled')).toBeDefined()
    await wrapper.find('.backup-reset-confirm .backup-confirm-actions button').trigger('click')
    expect(wrapper.find('.backup-reset-confirm').exists()).toBe(false)
    expect(JSON.parse(localStorage.getItem('capital-idle-save-v6')!).game.balance).toBe(567)

    await wrapper.find('.backup-reset').trigger('click')
    await wrapper.find('#reset-code').setValue('RESET')
    expect(wrapper.find('.backup-confirm-danger').attributes('disabled')).toBeUndefined()
    await wrapper.find('.backup-confirm-danger').trigger('click')
    await nextTick()
    const fresh = JSON.parse(localStorage.getItem('capital-idle-save-v6')!) as CapitalState
    expect(fresh.game.balance).toBe(0)
    expect(fresh.game.lifetimeEarned).toBe(0)
    expect(fresh.fiscal.taxesDueCents).toBe(0)
    expect(fresh.fiscal.taxesPaidCents).toBe(0)
    expect(fresh.stats.clickCount).toBe(0)
    expect(Object.keys(fresh.enterprises.owned)).toHaveLength(0)
    expect(localStorage.getItem('capital-idle-save-v4')).toBeNull()
    expect(wrapper.find('.backup-reset-confirm').exists()).toBe(false)
  })

  it('l import affiche le résumé, annule sans effet puis remplace après confirmation', async () => {
    const now = Date.now()
    const original = createCapitalState({ balance: 250, lifetimeEarned: 250, purchasedUpgrades: 0 }, now)
    const loaded = createCapitalState({ balance: 1250, lifetimeEarned: 1250, purchasedUpgrades: 0 }, now - 30_000)
    loaded.trading.positions.nvideo = { quantity: 1, costBasis: 100.50 }
    loaded.trading.quotes.nvideo = { price: 110, momentum: 0, dividendYield: 0.05, updatedAt: now - 30_000 }
    loaded.fiscal.taxesDueCents = 75
    loaded.fiscal.dueBySourceCents.stocks = 75
    localStorage.setItem('capital-idle-save-v6', JSON.stringify(original))
    const wrapper = mount(App, { attachTo: document.body })
    mounted.push(wrapper)
    await wrapper.findAll('.bottom-nav button')[3]!.trigger('click')
    const encoded = JSON.stringify({
      format: 'CAPITAL_IDLE_SAVE', formatVersion: 1, exportedAt: now - 30_000, state: loaded,
    })

    async function choose(content: string) {
      const file = new File([content], 'partie.json', { type: 'application/json' })
      Object.defineProperty(file, 'text', { value: async () => content })
      const input = wrapper.find('.backup-hidden')
      Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
      await input.trigger('change')
      await flushPromises()
      await nextTick()
    }

    await choose(encoded)
    expect(wrapper.find('.backup-confirm').exists()).toBe(true)
    expect(wrapper.find('.backup-import-details').text()).toContain(new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 }).format(1250))
    expect(JSON.parse(localStorage.getItem('capital-idle-save-v6')!).game.balance).toBe(250)
    await wrapper.find('.backup-confirm-actions button').trigger('click')
    expect(wrapper.find('.backup-confirm').exists()).toBe(false)
    expect(JSON.parse(localStorage.getItem('capital-idle-save-v6')!).game.balance).toBe(250)

    await choose('{invalid')
    expect(wrapper.find('.backup-error').exists()).toBe(true)
    expect(JSON.parse(localStorage.getItem('capital-idle-save-v6')!).game.balance).toBe(250)

    await choose(encoded)
    await wrapper.find('.backup-confirm-primary').trigger('click')
    await flushPromises()
    const imported = JSON.parse(localStorage.getItem('capital-idle-save-v6')!) as CapitalState
    expect(imported.game.balance).toBe(1250)
    expect(imported.trading.positions.nvideo.quantity).toBe(1)
    expect(imported.fiscal.taxesDueCents).toBe(75)
    expect(wrapper.find('.backup-confirm').exists()).toBe(false)
  })

  it('la zone gestion de sauvegarde reste lisible sur petit écran', () => {
    const css = readFileSync('src/style.css', 'utf8')
    expect(css).toContain('.stats-backup {')
    expect(css).toContain('.backup-action {')
    expect(css).toContain('.backup-reset-confirm input {')
    expect(css).toContain('@media(max-width:360px)')
  })
})
