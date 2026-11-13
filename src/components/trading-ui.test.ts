import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../App.vue'
import TradingScreen from './TradingScreen.vue'
import { createCapitalState, type CapitalState } from '../capital.ts'
import { createInitialQuotes } from '../trading/catalog.ts'
import { buyAsset, sellAsset, type TradeResult, type TradeSide } from '../trading/trades.ts'
import type { MarketNews } from '../trading/types.ts'

const NOW = 1_800_000_000_000
const mounted: VueWrapper[] = []
const news: MarketNews = {
  id:'news-integration', templateId:'chip-breakthrough',
  startedAt:NOW - 60_000, endsAt:NOW + 120_000,
  affectedAssetIds:['nvideo'], impact:1, phase:'active',
}
function setup(original?: CapitalState) {
  let state = original ?? createCapitalState({balance:1000,lifetimeEarned:1000,purchasedUpgrades:0},NOW)
  state.trading.quotes = createInitialQuotes(NOW)
  let wrapper: VueWrapper
  const executeTrade = (side: TradeSide, id: string, qty: number): TradeResult => {
    const result = side === 'buy' ? buyAsset(state,id,qty) : sellAsset(state,id,qty)
    if (result.ok) {
      state = result.state
      void wrapper.setProps({state})
    }
    return result
  }
  wrapper = mount(TradingScreen,{props:{state,executeTrade},attachTo:document.body})
  mounted.push(wrapper)
  return {wrapper,getState:()=>state}
}
async function tab(wrapper: VueWrapper, index: number) {
  await wrapper.findAll('.trading-tab')[index]!.trigger('click')
}
async function openNvideo(wrapper: VueWrapper) {
  await tab(wrapper,1)
  await wrapper.find('button.market-asset-row').trigger('click')
}
beforeEach(()=>{ localStorage.clear(); window.history.replaceState(null,'','/') })
afterEach(()=>{ mounted.splice(0).forEach(wrapper=>wrapper.unmount()) })

describe('Trading interface mobile',()=>{
  it('affiche 20 actions et 25 cryptos à travers les 4 rubriques',async()=>{
    const {wrapper}=setup()
    expect(wrapper.findAll('.trading-tab')).toHaveLength(4)
    await tab(wrapper,1)
    expect(wrapper.findAll('button.market-asset-row')).toHaveLength(20)
    await tab(wrapper,2)
    expect(wrapper.findAll('button.market-asset-row')).toHaveLength(25)
    await tab(wrapper,0)
    expect(wrapper.find('.portfolio-panel').exists()).toBe(true)
  })
  it('achète puis vend MAX avec commissions sur le solde partagé',async()=>{
    const {wrapper,getState}=setup()
    await openNvideo(wrapper)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    await wrapper.find('#order-quantity').setValue('1')
    expect(wrapper.find('button.order-submit').attributes('disabled')).toBeUndefined()
    await wrapper.find('button.order-submit').trigger('click')
    await nextTick()
    expect(getState().trading.positions.nvideo?.quantity).toBe(1)
    expect(getState().game.balance).toBeLessThan(1000)
    expect(wrapper.find('.order-success').text()).toContain('Achat confirmé')
    await wrapper.findAll('.order-side button')[1]!.trigger('click')
    await wrapper.findAll('.order-fractions button')[2]!.trigger('click')
    expect((wrapper.find('#order-quantity').element as HTMLInputElement).value).toBe('1')
    await wrapper.find('button.order-submit').trigger('click')
    await nextTick()
    expect(getState().trading.positions.nvideo).toBeUndefined()
    expect(getState().game.lifetimeEarned).toBe(1000)
    expect(wrapper.find('.order-success').text()).toContain('Vente confirmée')
  })
  it('gère les fractions BTC et les erreurs de solde',async()=>{
    const {wrapper,getState}=setup()
    await openNvideo(wrapper)
    await wrapper.find('#order-quantity').setValue('9999999')
    expect(wrapper.find('button.order-submit').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.order-error').text()).toContain('Solde insuffisant')
    await wrapper.find('button.modal-close').trigger('click')
    await tab(wrapper,2)
    await wrapper.find('button.market-asset-row').trigger('click')
    await wrapper.findAll('.order-fractions button')[0]!.trigger('click')
    const input=wrapper.find('#order-quantity').element as HTMLInputElement
    expect(input.value).toMatch(/^0\.\d+$/)
    expect(input.value).not.toContain('e-')
    await wrapper.find('button.order-submit').trigger('click')
    await nextTick()
    expect(getState().trading.positions.bitcoin?.quantity).toBeGreaterThan(0)
  })
  it('affiche la News et conduit à la fiche de son actif',async()=>{
    const state=createCapitalState({balance:1000,lifetimeEarned:1000,purchasedUpgrades:0},NOW)
    state.trading.news=[news]
    const {wrapper}=setup(state)
    await tab(wrapper,3)
    expect(wrapper.find('button.news-preview-row').exists()).toBe(true)
    await wrapper.find('button.news-preview-row').trigger('click')
    expect(wrapper.find('.trading-news-modal').text()).toContain('Nvideo')
    await wrapper.find('.trading-news-modal .asset-news-related button').trigger('click')
    expect(wrapper.find('.trading-asset-modal').exists()).toBe(true)
    await wrapper.find('button.modal-close').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
  it('affiche seulement les 10 dernières News sans masquer leur impact dans le moteur',async()=>{
    const state=createCapitalState({balance:1000,lifetimeEarned:1000,purchasedUpgrades:0},NOW)
    state.trading.news=Array.from({length:14},(_,index)=>({
      ...news,
      id:'news-'+index,
      startedAt:NOW-14*30_000+index*30_000,
      endsAt:NOW+120_000+index*30_000,
    }))
    const {wrapper,getState}=setup(state)
    await tab(wrapper,3)
    expect(wrapper.findAll('button.news-preview-row')).toHaveLength(10)
    expect(getState().trading.news).toHaveLength(14)
    expect(wrapper.find('.market-list-head span').text()).toContain('14 EN COURS')
  })

  it('Escape et popstate ferment les fenêtres',async()=>{
    const {wrapper}=setup()
    await openNvideo(wrapper)
    const dialog=wrapper.find('.trading-asset-modal')
    ;(dialog.element as HTMLElement).focus()
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}))
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Fermer le détail')
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))
    await nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await wrapper.find('button.market-asset-row').trigger('click')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
  it('montre le montant flottant à chaque clic et le nettoie en fin d’animation',async()=>{
    const wrapper=mount(App,{attachTo:document.body})
    mounted.push(wrapper)
    const zone=wrapper.find('button.tap-zone')
    const initialBanknotes=wrapper.find('.banknotes').element
    await zone.trigger('click')
    expect(wrapper.findAll('.floating-gain')).toHaveLength(1)
    expect(wrapper.find('.floating-gain').text()).toBe('+1 
    const wrapper=mount(App,{attachTo:document.body})
    mounted.push(wrapper)
    expect(wrapper.find('.home-screen').isVisible()).toBe(true)
    await wrapper.find('.tap-zone').trigger('click')
    expect(wrapper.find('.balance-value').text()).toContain('1')
    await wrapper.findAll('.bottom-nav button')[1]!.trigger('click')
    expect(wrapper.find('.trading-screen').isVisible()).toBe(true)
    await wrapper.findAll('.bottom-nav button')[0]!.trigger('click')
    expect(wrapper.find('.home-screen').isVisible()).toBe(true)
  })
})
)
    expect(wrapper.find('.banknotes-popping').exists()).toBe(true)
    expect(wrapper.find('.banknotes').element).not.toBe(initialBanknotes)
    const firstAnimation=wrapper.find('.banknotes').element
    await zone.trigger('click')
    expect(wrapper.findAll('.floating-gain')).toHaveLength(2)
    expect(wrapper.find('.balance-value').text()).toContain('2')
    expect(wrapper.find('.banknotes').element).not.toBe(firstAnimation)
    await wrapper.findAll('.floating-gain')[0]!.trigger('animationend')
    expect(wrapper.findAll('.floating-gain')).toHaveLength(1)
    expect(wrapper.find('.floating-gain').text()).toBe('+1 
    const wrapper=mount(App,{attachTo:document.body})
    mounted.push(wrapper)
    expect(wrapper.find('.home-screen').isVisible()).toBe(true)
    await wrapper.find('.tap-zone').trigger('click')
    expect(wrapper.find('.balance-value').text()).toContain('1')
    await wrapper.findAll('.bottom-nav button')[1]!.trigger('click')
    expect(wrapper.find('.trading-screen').isVisible()).toBe(true)
    await wrapper.findAll('.bottom-nav button')[0]!.trigger('click')
    expect(wrapper.find('.home-screen').isVisible()).toBe(true)
  })
})
)
  })
  it('conserve le clicker après navigation aller-retour',async()=>{
    const wrapper=mount(App,{attachTo:document.body})
    mounted.push(wrapper)
    expect(wrapper.find('.home-screen').isVisible()).toBe(true)
    await wrapper.find('.tap-zone').trigger('click')
    expect(wrapper.find('.balance-value').text()).toContain('1')
    await wrapper.findAll('.bottom-nav button')[1]!.trigger('click')
    expect(wrapper.find('.trading-screen').isVisible()).toBe(true)
    await wrapper.findAll('.bottom-nav button')[0]!.trigger('click')
    expect(wrapper.find('.home-screen').isVisible()).toBe(true)
  })
})
