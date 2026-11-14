import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import App from '../App.vue'
import { createCapitalState, type CapitalState } from '../capital.ts'
import { performPrestige } from '../ascension/engine.ts'

const STORAGE = 'capital-idle-save-v7'
const mounted: VueWrapper[] = []
beforeEach(() => localStorage.clear())
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks()
})

function fixture(withPoints = false): CapitalState {
  const now = Date.now()
  const start = createCapitalState({
    balance: 120_000_000, lifetimeEarned: 120_000_000, purchasedUpgrades: 0,
  }, now)
  if (!withPoints) return start
  const result = performPrestige(start, now)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('Fixture Prestige failed')
  return result.state
}

function mountState(state: CapitalState) {
  localStorage.setItem(STORAGE, JSON.stringify(state))
  const wrapper = mount(App, { attachTo: document.body })
  mounted.push(wrapper)
  const saved = (): CapitalState => JSON.parse(localStorage.getItem(STORAGE)!) as CapitalState
  return { wrapper, saved }
}

describe('Prestige économique — page et boutique', () => {
  it('s’ouvre depuis Accueil, affiche 18 upgrades, et conserve Stats à droite', async () => {
    const { wrapper } = mountState(fixture())
    const nav = wrapper.findAll('.bottom-nav button')
    expect(nav.map(button => button.text())).toEqual([
      'Accueil', 'Trading', 'Entreprises', 'Collection', 'Stats',
    ])
    expect(wrapper.find('.prestige-launch').exists()).toBe(true)
    await wrapper.find('.prestige-launch').trigger('click')
    expect(wrapper.find('.ascension-screen').exists()).toBe(true)
    expect(wrapper.find('.ascension-screen').attributes('aria-label')).toBe('Boutique Prestige')
    expect(wrapper.find('.ascension-screen h1').text()).toBe('Prestige')
    expect(wrapper.findAll('.ascension-upgrade')).toHaveLength(18)
    expect(wrapper.findAll('.ascension-category')).toHaveLength(5)
    expect(wrapper.findAll('.ascension-upgrade button.ascension-buy:disabled')).toHaveLength(18)
    expect(wrapper.find('.ascension-panel-title').text()).toContain('PP')
    expect(wrapper.find('.home-screen').isVisible()).toBe(false)
    expect(wrapper.findAll('.bottom-nav button').at(-1)?.text()).toBe('Stats')
    await nextTick()
    const back = wrapper.find('.ascension-return')
    expect(document.activeElement).toBe(back.element)
    await back.trigger('click')
    await nextTick()
    expect(wrapper.find('.ascension-screen').exists()).toBe(false)
    expect(wrapper.find('.home-screen').isVisible()).toBe(true)
    expect(document.activeElement).toBe(wrapper.find('.prestige-launch').element)
    await nav[4]!.trigger('click')
    expect(wrapper.find('.stats-screen').isVisible()).toBe(true)
  })

  it('achète un niveau en PP, l’enregistre puis conserve ce niveau au rechargement', async () => {
    const start = fixture(true)
    const { wrapper, saved } = mountState(start)
    const beforeFame = start.prestige.fameMicros
    await wrapper.find('.prestige-launch').trigger('click')
    expect(wrapper.find('.ascension-summary').text()).toContain(String(start.ascension.progress.availablePoints))
    const click = wrapper.find('.ascension-upgrade[data-upgrade="auto-click"]')
    expect(click.find('.ascension-upgrade-level').text()).toContain('0/20')
    expect(click.find('.ascension-upgrade-cost').text()).toContain('1 PP')
    await click.find('button.ascension-buy').trigger('click')
    await nextTick()
    const updated = saved()
    expect(updated.ascension.progress.upgradeLevels['auto-click']).toBe(1)
    expect(updated.ascension.progress.availablePoints).toBe(start.ascension.progress.availablePoints - 1)
    expect(updated.prestige.fameMicros).toBe(beforeFame)
    expect(click.find('.ascension-upgrade-level').text()).toContain('1/20')
    expect(click.find('.ascension-upgrade-cost').text()).toContain('2 PP')
    expect(wrapper.find('.ascension-notice').text()).toContain('Auto Click')
    expect(wrapper.find('.ascension-upgrade[data-upgrade="auto-click"] .ascension-phase').text()).toContain('passe 6')
    wrapper.unmount()
    mounted.splice(mounted.indexOf(wrapper), 1)
    const restarted = mount(App, { attachTo: document.body })
    mounted.push(restarted)
    await restarted.find('.prestige-launch').trigger('click')
    expect(restarted.find('.ascension-upgrade[data-upgrade="auto-click"] .ascension-upgrade-level').text()).toContain('1/20')
  })

  it('refuse les achats en PP insuffisants sans modifier l’économie et la Fame', async () => {
    const start = fixture()
    const { wrapper, saved } = mountState(start)
    await wrapper.find('.prestige-launch').trigger('click')
    expect(wrapper.findAll('.ascension-buy:disabled')).toHaveLength(18)
    expect(saved()).toEqual(start)
    expect(wrapper.find('.ascension-upgrade[data-upgrade="auto-trader"] .ascension-buy').attributes('disabled')).toBeDefined()
  })

  it('affiche les conditions et exige PRESTIGE avant de réinitialiser', async () => {
    const start = fixture()
    const { wrapper, saved } = mountState(start)
    await wrapper.find('.prestige-launch').trigger('click')
    expect(wrapper.find('.ascension-reset-launch').attributes('disabled')).toBeUndefined()
    await wrapper.find('.ascension-reset-launch').trigger('click')
    const dialog = wrapper.find('.ascension-confirm')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.text()).toContain('Fame')
    expect(dialog.text()).toContain('cryptos')
    expect(dialog.find('.ascension-confirm-submit').attributes('disabled')).toBeDefined()
    await dialog.find('#ascension-confirm-input').setValue('PRESTIG')
    expect(dialog.find('.ascension-confirm-submit').attributes('disabled')).toBeDefined()
    await dialog.find('.ascension-cancel').trigger('click')
    expect(wrapper.find('.ascension-confirm').exists()).toBe(false)
    expect(saved().game.balance).toBe(120_000_000)
    await wrapper.find('.ascension-reset-launch').trigger('click')
    await wrapper.find('#ascension-confirm-input').setValue('PRESTIGE')
    expect(wrapper.find('.ascension-confirm-submit').attributes('disabled')).toBeUndefined()
    await wrapper.find('.ascension-confirm-submit').trigger('click')
    await nextTick()
    const done = saved()
    expect(done.game.balance).toBe(0)
    expect(done.prestige.experienceCents).toBe(0)
    expect(done.ascension.progress.prestigeCount).toBe(1)
    expect(done.ascension.progress.availablePoints).toBeGreaterThanOrEqual(20)
    expect(done.ascension.progress.highestFameAwardedLevel).toBe(start.prestige.lastAwardedLevel)
    expect(done.prestige.fameMicros).toBe(start.prestige.fameMicros)
    expect(done.fiscal.periodStartedAt).toBe(start.fiscal.periodStartedAt)
    expect(wrapper.find('.ascension-confirm').exists()).toBe(false)
    expect(wrapper.find('.ascension-reset-launch').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.ascension-notice').text()).toContain('Prestige n°1')
  })

  it('si des impôts sont dus, Prestige est verrouillé et aucune dette ne disparaît', async () => {
    const taxed = fixture()
    taxed.fiscal.taxesDueCents = 100
    taxed.fiscal.dueBySourceCents.stocks = 100
    const { wrapper, saved } = mountState(taxed)
    await wrapper.find('.prestige-launch').trigger('click')
    expect(wrapper.find('.ascension-reset-launch').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.ascension-checks').text()).toContain('1 $')
    expect(saved().fiscal.taxesDueCents).toBe(100)
  })

  it('le panneau Prestige défile et la confirmation reste lisible sur mobile', () => {
    const css = readFileSync('src/style.css', 'utf8')
    expect(css).toContain('.ascension-screen {')
    expect(css).toContain('.ascension-scroll {')
    expect(css).toMatch(/\.ascension-scroll \{[^}]*overflow-y:auto/)
    expect(css).toContain('.ascension-confirm-overlay {')
    expect(css).toContain('.ascension-confirm-body { min-height:0; overflow-y:auto;')
    expect(css).toContain('.prestige-launch {')
    expect(css).toContain('@media(max-width:380px)')
  })
})
