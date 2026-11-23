import {readV8LegacyUI,seedLegacyUIFixtureAsV9} from './v8-ui-test-helper.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import App from '../App.vue'
import { createCapitalState, type CapitalState } from '../capital.ts'
import { performPrestige } from '../ascension/engine.ts'
import { createV8CapitalState } from '../exact-state-v8.ts'
import { v8PerformPrestige } from '../exact-prestige-v8.ts'
import { v8CreditIncome } from '../exact-runtime-v8.ts'
import { V8_STORAGE_KEY, saveV8CapitalState } from '../exact-persistence-v8.ts'

const STORAGE = 'capital-idle-save-v7'
const mounted: VueWrapper[] = []
beforeEach(() => {localStorage.clear(); vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000)})
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks()
})

function fixture(withPoints = false): CapitalState {
  const now = Date.now()
  const start = createCapitalState({
    balance: 120_000_000_000, lifetimeEarned: 120_000_000_000, purchasedUpgrades: 0,
  }, now)
  if (!withPoints) return start
  const result = performPrestige(start, now)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('Fixture Prestige failed')
  return result.state
}

function mountState(state: CapitalState) {
  seedLegacyUIFixtureAsV9(state)
  const wrapper = mount(App, { attachTo: document.body })
  mounted.push(wrapper)
  const saved = (): CapitalState => readV8LegacyUI()
  return { wrapper, saved }
}

describe('Prestige économique — page et boutique', () => {
  it('s’ouvre depuis Accueil, affiche 11 upgrades (Auto Click payé en dollars), et conserve Stats à droite', async () => {
    const { wrapper } = mountState(fixture())
    const nav = wrapper.findAll('.bottom-nav button')
    expect(nav.slice(0,4).map(button => button.text())).toEqual(['Accueil','Trading','Entreprises','Collection'])
    expect(nav[4]!.attributes('aria-label')).toContain('Achievements')
    expect(nav[5]!.text()).toBe('Stats')
    expect(wrapper.find('.prestige-launch').exists()).toBe(true)
    await wrapper.find('.prestige-launch').trigger('click')
    expect(wrapper.find('.ascension-screen').exists()).toBe(true)
    expect(wrapper.find('.ascension-screen').attributes('aria-label')).toBe('Boutique Prestige')
    expect(wrapper.find('.ascension-screen h1').text()).toBe('Prestige')
    expect(wrapper.findAll('.ascension-category .ascension-upgrade')).toHaveLength(11)
    expect(wrapper.findAll('.ascension-transcendent-news .ascension-upgrade')).toHaveLength(0)
    expect(wrapper.findAll('.prestige-tab')).toHaveLength(2)
    expect(wrapper.findAll('button.ascension-buy-max')).toHaveLength(11)
    expect(wrapper.findAll('.ascension-category')).toHaveLength(4)
    expect(wrapper.findAll('.ascension-category .ascension-upgrade button.ascension-buy:disabled')).toHaveLength(11)
    expect(wrapper.find('.ascension-panel-title').text()).toContain('PP')
    expect(wrapper.find('.home-screen').isVisible()).toBe(false)
    expect(wrapper.findAll('.bottom-nav button')[5]?.text()).toBe('Stats')
    await nextTick()
    const back = wrapper.find('.ascension-return')
    expect(document.activeElement).toBe(back.element)
    await back.trigger('click')
    await nextTick()
    expect(wrapper.find('.ascension-screen').exists()).toBe(false)
    expect(wrapper.find('.home-screen').isVisible()).toBe(true)
    expect(document.activeElement).toBe(wrapper.find('.prestige-launch').element)
    await nav[5]!.trigger('click')
    expect(wrapper.find('.stats-screen').isVisible()).toBe(true)
  })

  it('achète un niveau en PP, l’enregistre puis conserve ce niveau au rechargement', async () => {
    const start = fixture(true)
    const { wrapper, saved } = mountState(start)
    const beforeFame = start.prestige.fameMicros
    await wrapper.find('.prestige-launch').trigger('click')
    expect(wrapper.find('.ascension-summary').text()).toContain(String(start.ascension.progress.availablePoints))
    expect(wrapper.find('.ascension-upgrade[data-upgrade="auto-click"]').exists()).toBe(false)
    const offer = wrapper.find('.ascension-upgrade[data-upgrade="news-frequency"]')
    expect(offer.find('.ascension-upgrade-level').text()).toContain('0/10')
    expect(offer.find('.ascension-upgrade-cost').text()).toContain('20 PP')
    await offer.find('button.ascension-buy').trigger('click')
    await nextTick()
    const updated = saved()
    expect(updated.ascension.progress.upgradeLevels['news-frequency']).toBe(1)
    expect(updated.ascension.progress.availablePoints).toBe(start.ascension.progress.availablePoints - 20)
    expect(updated.prestige.fameMicros).toBe(beforeFame)
    expect(offer.find('.ascension-upgrade-level').text()).toContain('1/10')
    expect(wrapper.find('.ascension-notice').text()).toContain('Fréquence médiatique')
    wrapper.unmount()
    mounted.splice(mounted.indexOf(wrapper), 1)
    const restarted = mount(App, { attachTo: document.body })
    mounted.push(restarted)
    await restarted.find('.prestige-launch').trigger('click')
    expect(restarted.find('.ascension-upgrade[data-upgrade="news-frequency"] .ascension-upgrade-level').text()).toContain('1/10')
  })

  it('MAX achète plusieurs niveaux Prestige avec un seul remplacement de sauvegarde', async () => {
    const now=Date.now()
    let exact=createV8CapitalState(now)
    for(let i=0;i<3;i++){
      exact=v8CreditIncome(exact,'clicks',10n**40n)
      const result=v8PerformPrestige(exact,now)
      expect(result.ok).toBe(true)
      if(!result.ok)throw Error('Prestige fixture failed')
      exact=result.state
    }
    expect(saveV8CapitalState(localStorage,exact)).toBe(true)
    const wrapper=mount(App,{attachTo:document.body})
    mounted.push(wrapper)
    await wrapper.find('.prestige-launch').trigger('click')
    const offer=wrapper.find('[data-upgrade="news-frequency"]')
    expect(offer.find('.ascension-buy-max').attributes('disabled')).toBeUndefined()
    const walletBefore=BigInt(exact.ascension.progress.availablePoints)
    await offer.find('.ascension-buy-max').trigger('click')
    await nextTick()
    const updated=JSON.parse(localStorage.getItem(V8_STORAGE_KEY)!)
    expect(updated.ascension.progress.upgradeLevels['news-frequency']).toBe(10)
    expect(BigInt(updated.ascension.progress.availablePoints)).toBeLessThan(walletBefore)
    expect(updated.game.balance).toBe(exact.game.balance)
    expect(offer.find('.ascension-buy-max').attributes('disabled')).toBeDefined()
  })

  it('refuse les achats en PP insuffisants sans modifier l’économie et la Fame', async () => {
    const start = fixture()
    const { wrapper, saved } = mountState(start)
    const migratedPrestige = saved().prestige
    const migratedProgress = saved().ascension.progress
    await wrapper.find('.prestige-launch').trigger('click')
    expect(wrapper.findAll('.ascension-category .ascension-buy:disabled')).toHaveLength(11)
    // The live runtime legitimately advances enterprise/market real clocks.
    // A rejected PP purchase must preserve the actual economic balances and
    // permanent progression, not freeze all clock timestamps in the browser.
    expect(saved().game).toEqual(start.game)
    expect(saved().prestige).toEqual(migratedPrestige)
    expect(saved().ascension.progress).toEqual(migratedProgress)
    expect(wrapper.find('.automation-panel').exists()).toBe(false)
  })

  it('affiche les conditions et exige PRESTIGE avant de réinitialiser', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
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
    expect(saved().game.balance).toBe(120_000_000_000)
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
    expect(done.prestige.fameMicros).toBe(0)
    expect(done.fiscal.periodStartedAt).toBe(start.fiscal.periodStartedAt)
    expect(wrapper.find('.ascension-confirm').exists()).toBe(false)
    expect(wrapper.find('.ascension-reset-launch').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.ascension-notice').text()).toContain('Prestige n°1')
  })

  it('avec des impôts dus, Prestige reste accessible et les solde à la confirmation', async () => {
    const taxed = fixture()
    taxed.fiscal.taxesDueCents = 100
    taxed.fiscal.dueBySourceCents.stocks = 100
    const { wrapper, saved } = mountState(taxed)
    await wrapper.find('.prestige-launch').trigger('click')
    expect(wrapper.find('.ascension-reset-launch').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.ascension-checks').text()).toContain('1 $')
    expect(wrapper.find('.ascension-help').text()).toContain('prélevées à la confirmation')
    await wrapper.find('.ascension-reset-launch').trigger('click')
    expect(wrapper.find('.ascension-confirm').text()).toContain('1 $')
    await wrapper.find('#ascension-confirm-input').setValue('PRESTIGE')
    await wrapper.find('.ascension-confirm-submit').trigger('click')
    const next = saved()
    expect(next.ascension.progress.prestigeCount).toBe(1)
    expect(next.fiscal.taxesDueCents).toBe(0)
    expect(next.fiscal.taxesPaidCents).toBe(100)
    expect(next.fiscal.paidBySourceCents.stocks).toBe(100)
    expect(next.fiscal.periodStartedAt).toBe(taxed.fiscal.periodStartedAt)
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


describe('News avancées PP sans condition de cycles',()=>{
  it('présente trois améliorations News accessibles dès le premier Prestige avec PP',async()=>{
    const {wrapper}=mountState(fixture(true))
    await wrapper.find('.prestige-launch').trigger('click')
    await wrapper.find('[data-prestige-tab="transcendent"]').trigger('click')
    const cards=wrapper.findAll('.transcendent-news .ascension-upgrade')
    expect(cards).toHaveLength(3)
    expect(cards.map(card=>card.attributes('data-news-upgrade'))).toEqual([
      'news-power','news-intensity','news-duration',
    ])
    for(const card of cards){
      expect(card.find('.ascension-upgrade-level').text()).toContain('0/100')
      expect(card.find('button.ascension-buy').attributes('disabled')).toBeUndefined()
       expect(card.find('button.ascension-buy').text()).toContain('ACHETER')
    }
    expect(wrapper.find('.ascension-news-effective').text()).toContain('Puissance')
    expect(wrapper.find('.ascension-news-effective').text()).toContain('Rampe')
    expect(wrapper.find('.ascension-news-effective').text()).toContain('Durée future')
  })
  it('achète le rang PP News et le conserve sur recharge sans toucher au shop classique',async()=>{
    const at=Date.now()
    let exact=createV8CapitalState(at)
    for(let i=0;i<3;i++){
      exact=v8CreditIncome(exact,'clicks',10n**40n)
      const cycle=v8PerformPrestige(exact,at)
      expect(cycle.ok).toBe(true)
      if(!cycle.ok)throw Error('Prestige test fixture')
      exact=cycle.state
    }
    expect(saveV8CapitalState(localStorage,exact)).toBe(true)
    const wrapper=mount(App,{attachTo:document.body})
    mounted.push(wrapper)
    await wrapper.find('.prestige-launch').trigger('click')
    await wrapper.find('[data-prestige-tab="transcendent"]').trigger('click')
    const power=wrapper.find('.ascension-upgrade[data-news-upgrade="news-power"]')
    const buy=power.find('button.ascension-buy')
    expect(buy.attributes('disabled')).toBeUndefined()
    expect(power.find('.ascension-upgrade-cost').text()).toContain('5 PP')
    const before=BigInt(exact.ascension.progress.availablePoints)
    await buy.trigger('click')
    await nextTick()
    expect(power.find('.ascension-upgrade-level').text()).toContain('1/100')
    const saved=JSON.parse(localStorage.getItem(V8_STORAGE_KEY)!)
    expect(saved.ascension.progress.transcendentV1.levels['news-power']).toBe(1)
    expect(BigInt(saved.ascension.progress.availablePoints)).toBe(before-5n)
    expect(saved.ascension.progress.upgradeLevels).toEqual(exact.ascension.progress.upgradeLevels)
    expect(saved.prestige.fameMicros).toBe(exact.prestige.fameMicros)
    wrapper.unmount()
    mounted.splice(mounted.indexOf(wrapper),1)
    const restored=mount(App,{attachTo:document.body})
    mounted.push(restored)
    await restored.find('.prestige-launch').trigger('click')
    await restored.find('[data-prestige-tab="transcendent"]').trigger('click')
    expect(restored.find('[data-news-upgrade="news-power"] .ascension-upgrade-level').text()).toContain('1/100')
  })
})
