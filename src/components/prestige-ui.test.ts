import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import App from '../App.vue'
import { createCapitalState, type CapitalState } from '../capital.ts'
import { getLevelStartThreshold } from '../game.ts'
import { FAME_MICROS } from '../prestige/state.ts'

const mounted: VueWrapper[] = []
beforeEach(() => localStorage.clear())
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()))

function mountSaved(balance: number, earned: number = balance) {
  const state = createCapitalState({
    balance, lifetimeEarned: earned, purchasedUpgrades: 0,
  }, Date.now())
  localStorage.setItem('capital-idle-save-v6', JSON.stringify(state))
  const wrapper = mount(App, { attachTo: document.body })
  mounted.push(wrapper)
  const current = () => JSON.parse(localStorage.getItem('capital-idle-save-v6')!) as CapitalState
  return { wrapper, current, initial: state }
}

describe('Fame Shop & Collection — responsive UI', () => {
  it('place Fame à droite du Gold, ouvre et ferme la modale par Escape', async () => {
    const { wrapper, initial } = mountSaved(5000)
    const wallet = wrapper.find('.wallet-primary')
    expect(wallet.exists()).toBe(true)
    expect(wallet.find('.wallet-cash .balance-value').exists()).toBe(true)
    const launch = wallet.find('button.fame-shop-launch')
    expect(launch.exists()).toBe(true)
    expect(launch.text()).toContain('FAME')
    expect(launch.text()).toContain('SHOP')
    expect(launch.text()).toContain('✦')
    expect(launch.text()).toContain(String(initial.prestige.fameMicros / FAME_MICROS))
    await launch.trigger('click')
    expect(wrapper.find('.fame-shop-dialog[role="dialog"]').exists()).toBe(true)
    expect(wrapper.find('.fame-shop-dialog').attributes('aria-modal')).toBe('true')
    expect(wrapper.findAll('.fame-boost-card')).toHaveLength(6)
    expect(wrapper.find('.fame-shop-scroll').exists()).toBe(true)
    expect(wrapper.find('.fame-shop-summary').text()).toContain('120')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(wrapper.find('.fame-shop-dialog').exists()).toBe(false)
    expect(document.activeElement).toBe(launch.element)
  })

  it('achète un seul palier Fame, sauvegarde sans cash perdu, puis affiche le niveau suivant', async () => {
    const threshold = getLevelStartThreshold(20)
    const { wrapper, current } = mountSaved(1000, threshold)
    await wrapper.find('.fame-shop-launch').trigger('click')
    const boost = wrapper.find('.fame-boost-card[data-boost="click"]')
    expect(boost.find('.fame-boost-level').text()).toContain('0/20')
    expect(boost.find('.fame-boost-cost').text()).toContain('52')
    await boost.find('button.fame-buy-button').trigger('click')
    await nextTick()
    const saved = current()
    expect(saved.prestige.boosts.click).toBe(1)
    expect(saved.prestige.fameMicros).toBe((210 - 52) * FAME_MICROS)
    expect(saved.game.balance).toBe(1000)
    expect(saved.game.lifetimeEarned).toBe(threshold)
    expect(wrapper.find('.fame-boost-card[data-boost="click"] .fame-boost-level').text()).toContain('1/20')
    expect(wrapper.find('.fame-boost-card[data-boost="click"] .fame-boost-cost').text()).toContain('67')
    expect(wrapper.find('.fame-shop-summary').text()).toContain('1 / 120')
    expect(wrapper.find('.fame-shop-dialog .prestige-notice').text()).toContain('achetée')
    await wrapper.find('.prestige-close').trigger('click')
    expect(wrapper.find('.fame-shop-dialog').exists()).toBe(false)
    await wrapper.find('.fame-shop-launch').trigger('click')
    expect(wrapper.find('.fame-boost-card[data-boost="click"] .fame-boost-level').text()).toContain('1/20')
  })

  it('Shop refuse les achats sans Fame et continue d afficher les six offres', async () => {
    const { wrapper, current } = mountSaved(0, 0)
    await wrapper.find('.fame-shop-launch').trigger('click')
    expect(wrapper.findAll('button.fame-buy-button')).toHaveLength(6)
    expect(wrapper.findAll('button.fame-buy-button:disabled')).toHaveLength(6)
    expect(wrapper.find('.fame-boost-card[data-boost="fame"] .fame-boost-cost').text()).toContain('70')
    expect(wrapper.find('.fame-boost-card[data-boost="fame"] .fame-buy-button').text()).toContain('INSUFF')
    expect(current().prestige.boosts.fame).toBe(0)
    expect(current().prestige.fameMicros).toBe(FAME_MICROS)
  })

  it('ajoute Collection avant Stats, avec cinq onglets et dix objets par catégorie', async () => {
    const { wrapper } = mountSaved(20_000)
    const nav = wrapper.findAll('.bottom-nav button')
    expect(nav.map((button) => button.text())).toEqual([
      'Accueil', 'Trading', 'Entreprises', 'Collection', 'Stats',
    ])
    await nav[3]!.trigger('click')
    expect(wrapper.find('.collection-screen').exists()).toBe(true)
    expect(wrapper.find('.collection-screen').isVisible()).toBe(true)
    expect(wrapper.findAll('.collection-tab')).toHaveLength(5)
    await wrapper.find('.collection-tab.is-selected').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.find('.collection-tab.is-selected').text()).toContain('Autos')
    await wrapper.find('.collection-tab.is-selected').trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.find('.collection-tab.is-selected').text()).toContain('Montres')
    expect(wrapper.findAll('.collection-card')).toHaveLength(10)
    expect(wrapper.find('.collection-card[data-item-id="watches-01"]').exists()).toBe(true)
    await wrapper.findAll('.collection-tab')[2]!.trigger('click')
    expect(wrapper.find('.collection-tab.is-selected').text()).toContain('Peintures')
    expect(wrapper.find('.collection-card[data-item-id="paintings-01"]').exists()).toBe(true)
    expect(wrapper.findAll('.collection-card')).toHaveLength(10)
    await nav[4]!.trigger('click')
    expect(wrapper.find('.stats-screen').isVisible()).toBe(true)
    expect(wrapper.find('.collection-screen').exists()).toBe(false)
  })

  it('fiche et achat Collection : Gold vers Fame, bonus permanent et objet acquis', async () => {
    const { wrapper, initial, current } = mountSaved(2000)
    await wrapper.findAll('.bottom-nav button')[3]!.trigger('click')
    await wrapper.findAll('.collection-tab')[2]!.trigger('click')
    await wrapper.find('.collection-card[data-item-id="paintings-01"]').trigger('click')
    const dialog = wrapper.find('.collection-detail-dialog')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.text()).toContain('Les Fleurs du Matin')
    expect(dialog.text()).toContain(new Intl.NumberFormat('fr-CH').format(1500))
    expect(dialog.text()).toContain('10')
    expect(dialog.text()).toContain('Expérience')
    expect(dialog.find('button.collection-buy-button').attributes('disabled')).toBeUndefined()
    await dialog.find('button.collection-buy-button').trigger('click')
    await nextTick()
    const saved = current()
    expect(saved.game.balance).toBe(500)
    expect(saved.game.lifetimeEarned).toBe(initial.game.lifetimeEarned)
    expect(saved.prestige.experienceCents).toBe(initial.prestige.experienceCents)
    expect(saved.prestige.collectionFameMicros).toBe(10 * FAME_MICROS)
    expect(saved.prestige.fameMicros).toBe(initial.prestige.fameMicros + 10 * FAME_MICROS)
    expect(saved.prestige.ownedCollectionIds).toEqual(['paintings-01'])
    expect(dialog.find('button.collection-buy-button').attributes('disabled')).toBeDefined()
    expect(dialog.text()).toContain('PIÈCE ACQUISE')
    expect(dialog.find('.prestige-notice').text()).toContain('Achat confirmé')
    await dialog.find('.prestige-close').trigger('click')
    expect(wrapper.find('.collection-card[data-item-id="paintings-01"]').classes()).toContain('is-owned')
    await wrapper.findAll('.bottom-nav button')[4]!.trigger('click')
    expect(wrapper.find('.stats-assets').text()).toContain('Collections')
    expect(wrapper.find('.stats-assets').text()).toContain(new Intl.NumberFormat('fr-CH').format(1500))
  })

  it('Collection : sous-solde et confirmation explicite pour un achat prestigieux', async () => {
    const { wrapper, current } = mountSaved(6_000_000)
    await wrapper.findAll('.bottom-nav button')[3]!.trigger('click')
    await wrapper.find('.collection-card[data-item-id="watches-06"]').trigger('click')
    const dialog = wrapper.find('.collection-detail-dialog')
    expect(dialog.find('.collection-detail-data').text()).toContain(new Intl.NumberFormat('fr-CH').format(4_000_000))
    await dialog.find('button.collection-buy-button').trigger('click')
    expect(dialog.find('.collection-confirm').exists()).toBe(true)
    expect(current().prestige.ownedCollectionIds).toHaveLength(0)
    await dialog.find('button.collection-cancel').trigger('click')
    expect(dialog.find('.collection-confirm').exists()).toBe(false)
    await dialog.find('button.collection-buy-button').trigger('click')
    await dialog.find('button.collection-confirm-buy').trigger('click')
    await nextTick()
    expect(current().game.balance).toBe(2_000_000)
    expect(current().prestige.ownedCollectionIds).toEqual(['watches-06'])
    expect(dialog.find('button.collection-buy-button').attributes('disabled')).toBeDefined()

    await dialog.find('.prestige-close').trigger('click')
    await wrapper.find('.collection-card[data-item-id="watches-10"]').trigger('click')
    expect(wrapper.find('button.collection-buy-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button.collection-buy-button').text()).toContain('INSUFFISANT')
  })

  it('les overlays mobiles restent larges, scrollables et ne masquent pas la navigation fixe', () => {
    const css = readFileSync('src/style.css', 'utf8')
    expect(css).toContain('.prestige-dialog {')
    expect(css).toMatch(/\.prestige-dialog \{[^}]*width:min\(100%,510px\)/)
    expect(css).toMatch(/\.prestige-dialog-scroll \{[^}]*overflow-y:auto/)
    expect(css).toMatch(/\.collection-list-scroll \{[^}]*overflow-y:auto/)
    expect(css).toMatch(/\.collection-screen \{[^}]*min-height:0; overflow:hidden/)
    expect(css).toContain('.wallet-primary { display:flex;')
    expect(css).toContain('.fame-shop-launch {')
    expect(css).toContain('linear-gradient(to bottom,#ad72ee')
    expect(css).toContain('@media(max-width:380px)')
    expect(css).toContain('.bottom-nav .nav-home { min-width:0; flex:1 1 0;')
  })
})
