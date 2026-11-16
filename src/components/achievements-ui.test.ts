import {readV8LegacyUI} from './v8-ui-test-helper.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import App from '../App.vue'
import { createCapitalState } from '../capital.ts'
import { prepareV8SaveImport } from '../exact-persistence-v8.ts'

const mounted: VueWrapper[] = []
beforeEach(() => { localStorage.clear() })
afterEach(() => { mounted.splice(0).forEach(wrapper => wrapper.unmount()) })

function start(saved = createCapitalState({
  balance: 1_500, lifetimeEarned: 1_500, purchasedUpgrades: 0,
}, Date.now())) {
  localStorage.setItem('capital-idle-save-v7', JSON.stringify(saved))
  const wrapper = mount(App, { attachTo: document.body })
  mounted.push(wrapper)
  return { wrapper, read: () => readV8LegacyUI() }
}

describe('Achievements : bouton ruban et récupération persistante', () => {
  it('bouton ruban compact sur accueil et retour avec focus', async () => {
    const { wrapper } = start()
    const button = wrapper.find('button.achievements-launch')
    expect(button.exists()).toBe(true)
    expect(button.find('svg').exists()).toBe(true)
    expect(button.attributes('aria-label')).toContain('Achievements')
    await button.trigger('click')
    const page = wrapper.find('main.achievements-screen')
    expect(page.exists()).toBe(true)
    expect(page.find('h1').text()).toContain('Achievements')
    expect(page.findAll('.achievements-group')).toHaveLength(10)
    for(const toggle of page.findAll('button[aria-expanded]'))await toggle.trigger('click')
    expect(page.findAll('.achievement-tier').length).toBeGreaterThanOrEqual(260)
    expect(wrapper.find('.bottom-nav').exists()).toBe(true)
    expect(wrapper.find('.home-screen').isVisible()).toBe(false)
    expect(document.activeElement).toBe(page.find('.achievements-back').element)
    await page.find('.achievements-back').trigger('click')
    await nextTick()
    expect(document.activeElement).toBe(button.element)
  })

  it('charge une ancienne v7 et récupère le palier une seule fois en cash', async () => {
    const saved = createCapitalState({
      balance: 1_500, lifetimeEarned: 1_500, purchasedUpgrades: 0,
    }, Date.now())
    saved.stats.clickCount = 120
    const legacy = JSON.parse(JSON.stringify(saved))
    delete legacy.achievements
    const { wrapper, read } = start(legacy)
    const launch = wrapper.find('button.achievements-launch')
    expect(launch.find('.achievements-pending').exists()).toBe(true)
    await launch.trigger('click')
    const reward = wrapper.find('[data-achievement="clicks-100"]')
    expect(reward.classes()).toContain('is-ready')
    expect(reward.find('.achievement-claim').exists()).toBe(true)
    await reward.find('.achievement-claim').trigger('click')
    await nextTick()
    const savedAfter = read()
    expect(savedAfter.game.balance).toBe(1_600)
    expect(savedAfter.game.lifetimeEarned).toBe(1_500)
    expect(savedAfter.achievements.claimedIds).toContain('clicks-100')
    expect(reward.find('.achievement-claim').exists()).toBe(false)
    expect(reward.text()).toContain('Récupéré')
    const imported = prepareV8SaveImport(localStorage.getItem('capital-idle-save-v8')!, Date.now())
    expect(imported.ok).toBe(true)
    await wrapper.find('.achievements-back').trigger('click')
    await nextTick()
    await wrapper.find('.achievements-launch').trigger('click')
    expect(wrapper.find('[data-achievement="clicks-100"] .achievement-claim').exists()).toBe(false)
  })

  it('garde le cash et la sauvegarde d origine si l enregistrement du cadeau échoue', async () => {
    const initial = createCapitalState({
      balance: 1_500, lifetimeEarned: 1_500, purchasedUpgrades: 0,
    }, Date.now())
    initial.stats.clickCount = 100
    const { wrapper, read } = start(initial)
    const before = JSON.stringify(read())
    const storage = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'capital-idle-save-v8') throw new Error('Quota')
      return storage.call(this, key, value)
    }
    try {
      await wrapper.find('.achievements-launch').trigger('click')
      await wrapper.find('[data-achievement="clicks-100"] .achievement-claim').trigger('click')
      expect(wrapper.find('.achievements-notice').text()).toContain('Sauvegarde impossible')
      expect(JSON.stringify(read())).toBe(before)
    } finally {
      Storage.prototype.setItem = storage
    }
  })

  it('page scrollable et bouton à largeur fixe même sur petits écrans', () => {
    const css = readFileSync('src/style.css', 'utf8')
    expect(css).toContain('.app-shell>main.achievements-screen{display:flex;flex-direction:column;overflow:hidden;padding:0}')
    expect(css).toContain('.app-shell .achievements-content{overflow-y:auto;flex:1 1 auto;min-height:0;')
    expect(css).toContain('.app-shell .home-actions .achievements-launch{')
  })
})
