import {readV8LegacyUI} from './v8-ui-test-helper.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import App from '../App.vue'
import { createCapitalState } from '../capital.ts'
import { getAchievementOffers } from '../achievements.ts'
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

describe('Achievements : navigation et récompenses groupées', () => {
  it('bouton dans la navigation avant Stats ; une seule carte par catégorie', async () => {
    const { wrapper } = start()
    const button = wrapper.find('button.achievements-launch')
    expect(button.exists()).toBe(true)
    expect(button.find('svg').exists()).toBe(true)
    expect(button.attributes('aria-label')).toContain('Achievements')
    expect(button.find('.nav-label').text()).toBe('Succès')
    expect(button.classes()).toContain('nav-home')
    expect(button.classes()).not.toContain('nav-icon')
    expect(button.element.nextElementSibling?.textContent).toContain('Stats')
    await button.trigger('click')
    const page = wrapper.find('main.achievements-screen')
    expect(page.exists()).toBe(true)
    expect(page.find('h1').text()).toContain('Achievements')
    expect(page.findAll('.achievements-group')).toHaveLength(10)
    expect(page.findAll('.achievement-track')).toHaveLength(10)
    expect(page.findAll('.achievement-level')).toHaveLength(10)
    expect(page.findAll('.achievement-tier')).toHaveLength(0)
    expect(page.find('.achievements-claim-all').exists()).toBe(true)
    expect(wrapper.find('.home-screen').isVisible()).toBe(false)
    expect(document.activeElement).toBe(page.find('.achievements-back').element)
    await page.find('.achievements-back').trigger('click')
    await nextTick()
    expect(document.activeElement).toBe(button.element)
  })

  it('utilise un libellé et une taille homogènes pour les sept boutons avec plein écran', async () => {
    const element=document.documentElement
    const previous=Object.getOwnPropertyDescriptor(element,'requestFullscreen')
    Object.defineProperty(element,'requestFullscreen',{configurable:true,value:()=>Promise.resolve()})
    try {
      const {wrapper}=start()
      const nav=wrapper.findAll('.bottom-nav button')
      expect(nav).toHaveLength(7)
      expect(nav.every(button=>button.classes('nav-home'))).toBe(true)
      expect(nav.every(button=>button.find('svg').exists())).toBe(true)
      expect(nav.every(button=>button.find('span:not(.achievements-pending)').exists())).toBe(true)
      expect(nav[4]!.find('.nav-label').text()).toBe('Succès')
      expect(nav[5]!.text()).toBe('Stats')
      expect(nav[6]!.find('.nav-label').text()).toBe('Plein écran')
      expect(nav[6]!.attributes('aria-label')).toBe('Activer le plein écran')
      expect(nav[6]!.attributes('aria-pressed')).toBe('false')
    } finally {
      if(previous)Object.defineProperty(element,'requestFullscreen',previous)
      else Reflect.deleteProperty(element,'requestFullscreen')
    }
  })

  it('réclame une fois les niveaux débloqués de la catégorie et conserve la sauvegarde', async () => {
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
    const card = wrapper.find('[data-group="clicks"]')
    expect(card.classes()).toContain('is-ready')
    expect(card.find('.achievement-level').text()).toMatch(/Niveau 1 \//)
    await card.find('.achievement-claim').trigger('click')
    await nextTick()
    const savedAfter = read()
    expect(savedAfter.game.balance).toBe(1_600)
    expect(savedAfter.game.lifetimeEarned).toBe(1_500)
    expect(savedAfter.achievements.claimedIds).toContain('clicks-100')
    expect(card.find('.achievement-claim').exists()).toBe(false)
    expect(prepareV8SaveImport(localStorage.getItem('capital-idle-save-v8')!, Date.now()).ok).toBe(true)
    await wrapper.find('.achievements-back').trigger('click')
    await nextTick()
    await wrapper.find('.achievements-launch').trigger('click')
    expect(wrapper.find('[data-group="clicks"] .achievement-claim').exists()).toBe(false)
  })

  it('récupérer tout est atomique, multi-catégories et idempotent', async () => {
    const saved = createCapitalState({balance:1_500,lifetimeEarned:1_500,purchasedUpgrades:0},Date.now())
    saved.stats.clickCount=120
    const {wrapper,read}=start(saved)
    await wrapper.find('.achievements-launch').trigger('click')
    const button=wrapper.find('.achievements-claim-all')
    const unlocks=getAchievementOffers(read()).filter(offer=>offer.claimable)
    const expectedCash=1_500+unlocks.reduce((sum,offer)=>sum+offer.rewardCents,0)/100
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    await nextTick()
    expect(read().game.balance).toBe(expectedCash)
    expect(read().achievements.claimedIds).toEqual(expect.arrayContaining(['clicks-100','earnings-1000']))
    expect(button.attributes('disabled')).toBeDefined()
    expect(prepareV8SaveImport(localStorage.getItem('capital-idle-save-v8')!,Date.now()).ok).toBe(true)
  })

  it('échec de sauvegarde : aucun cadeau ne passe en mémoire', async () => {
    const initial = createCapitalState({balance:1_500,lifetimeEarned:1_500,purchasedUpgrades:0},Date.now())
    initial.stats.clickCount=100
    const {wrapper,read}=start(initial)
    const before=JSON.stringify(read())
    const storage=Storage.prototype.setItem
    Storage.prototype.setItem=function(key:string,value:string){
      if(key==='capital-idle-save-v8')throw new Error('Quota')
      return storage.call(this,key,value)
    }
    try{
      await wrapper.find('.achievements-launch').trigger('click')
      await wrapper.find('.achievements-claim-all').trigger('click')
      expect(wrapper.find('.achievements-notice').text()).toContain('Sauvegarde impossible')
      expect(JSON.stringify(read())).toBe(before)
    }finally{Storage.prototype.setItem=storage}
  })

  it('les cartes défilent verticalement sans déplacer la barre de navigation',()=>{
    const css=readFileSync('src/style.css','utf8')
    expect(css).toContain('.app-shell>main.achievements-screen{display:flex;flex-direction:column;overflow:hidden;padding:0}')
    expect(css).toContain('.app-shell .achievements-content{overflow-y:auto;flex:1 1 auto;min-height:0;')
    expect(css).toContain('.app-shell>.bottom-nav>.nav-home{')
  })
})
