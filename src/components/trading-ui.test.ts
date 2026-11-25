import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../App.vue'
import { readFileSync } from 'node:fs'
import TradingScreen from './TradingScreen.vue'
import NewsPreview from './NewsPreview.vue'
import { getNewsPresentation } from '../trading/news.ts'
import { createCapitalState, type CapitalState } from '../capital.ts'
import { createInitialQuotes } from '../trading/catalog.ts'
import { formatPrice } from '../trading/presentation.ts'
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
  it('actualise les mini-graphiques et la courbe détaillée dès chaque cotation accélérée',async()=>{
    const {wrapper}=setup()
    const state=wrapper.props('state') as CapitalState
    const quote=state.trading.quotes.nvideo!
    const baseline=quote.price
    const history=[{at:NOW-5_000,price:baseline},{at:NOW,price:baseline}]
    await wrapper.setProps({state:{...state,trading:{
      ...state.trading,history:{...state.trading.history,nvideo:history},
    }}})
    await tab(wrapper,1)
    const row=wrapper.findAll('button.market-asset-row')
      .find(element=>element.attributes('aria-label')?.includes('Nvideo'))!
    expect(row).toBeDefined()
    const initialSparkline=row.find('.sparkline polyline').attributes('points')
    await row.trigger('click')
    const chart=wrapper.find('.trading-asset-modal .market-chart')
    const initialPolyline=chart.find('svg polyline').attributes('points')
    const livePrice=baseline*1.4
    const liveQuote={...quote,updatedAt:NOW+1_000,price:livePrice}
    const next=wrapper.props('state') as CapitalState
    await wrapper.setProps({state:{...next,trading:{
      ...next.trading,quotes:{...next.trading.quotes,nvideo:liveQuote},
    }}})
    expect(row.find('.sparkline polyline').attributes('points')).not.toBe(initialSparkline)
    expect(chart.find('svg polyline').attributes('points')).not.toBe(initialPolyline)
    expect(chart.find('svg g[color] text').text()).toBe(formatPrice(livePrice))
    expect(wrapper.find('.trading-asset-modal .asset-detail-quote strong').text()).toBe(formatPrice(livePrice))
    // A second fluctuation must update both charts before the next 5-second sample.
    const falling=baseline*0.6
    const nextState=wrapper.props('state') as CapitalState
    const beforeSecond=chart.find('svg polyline').attributes('points')
    await wrapper.setProps({state:{...nextState,trading:{
      ...nextState.trading,quotes:{...nextState.trading.quotes,nvideo:{...liveQuote,price:falling,updatedAt:NOW+2_000}},
    }}})
    expect(chart.find('svg polyline').attributes('points')).not.toBe(beforeSecond)
    expect(chart.find('svg g[color] text').text()).toBe(formatPrice(falling))
    expect(history).toHaveLength(2)
  })
  it('achète puis vend MAX avec commissions sur le solde partagé',async()=>{
    const {wrapper,getState}=setup()
    await openNvideo(wrapper)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.find('.trading-asset-modal').text()).not.toContain('Unités disponibles à l’achat')
    expect(wrapper.find('.trading-asset-modal').text()).not.toContain('Unités disponibles à la vente')
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
  it('vend un reliquat Turbo de 0,2604 avec avertissement et sans cash fictif',async()=>{
    const state=createCapitalState({balance:1000,lifetimeEarned:1000,purchasedUpgrades:0},NOW)
    state.trading.positions.turbo={quantity:0.2604,costBasis:0.01}
    const {wrapper,getState}=setup(state)
    await tab(wrapper,2)
    const turbo=wrapper.findAll('button.market-asset-row').find(row=>row.text().includes('Turbo'))
    expect(turbo).toBeDefined()
    await turbo!.trigger('click')
    await wrapper.findAll('.order-side button')[1]!.trigger('click')
    await wrapper.findAll('.order-fractions button')[2]!.trigger('click')
    expect((wrapper.find('#order-quantity').element as HTMLInputElement).value).toBe('0.2604')
    expect(wrapper.find('.trading-asset-modal').text()).toContain('Cette vente rapporte 0,00 $')
    expect(wrapper.find('button.order-submit').attributes('disabled')).toBeUndefined()
    await wrapper.find('button.order-submit').trigger('click')
    await nextTick()
    expect(getState().trading.positions.turbo).toBeUndefined()
    expect(getState().game.balance).toBe(1000)
    expect(wrapper.find('.order-success').text()).toContain('produit net nul')
  })
  it('gère les fractions BTC et les erreurs de solde',async()=>{
    const {wrapper,getState}=setup()
    await openNvideo(wrapper)
    await wrapper.find('#order-quantity').setValue('100')
    expect(wrapper.find('button.order-submit').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.order-error').text()).toContain('Solde insuffisant')
    await wrapper.find('button.modal-close').trigger('click')
    await tab(wrapper,2)
    await wrapper.find('button.market-asset-row').trigger('click')
    expect(wrapper.find('.trading-asset-modal').text()).not.toContain('Unités disponibles à la vente')
    await wrapper.findAll('.order-fractions button')[0]!.trigger('click')
    const input=wrapper.find('#order-quantity').element as HTMLInputElement
    expect(input.value).toMatch(/^0\.\d+$/)
    expect(input.value).not.toContain('e-')
    await wrapper.find('button.order-submit').trigger('click')
    await nextTick()
    expect(getState().trading.positions.bitcoin?.quantity).toBeGreaterThan(0)
  })
  it('affiche les valeurs exactes de la News, le cumul et la mise à jour après expiration',async()=>{
    const state=createCapitalState({balance:1000,lifetimeEarned:1000,purchasedUpgrades:0},NOW)
    const positive:MarketNews={...news,id:'good-results',templateId:'earnings-beat',
      impact:0.8,startedAt:NOW-120_000,endsAt:NOW+480_000}
    const negative:MarketNews={...positive,id:'bad-results',templateId:'earnings-miss',impact:-0.5}
    state.trading.news=[positive,negative]
    const {wrapper}=setup(state)
    await tab(wrapper,3)
    await wrapper.findAll('button.news-preview-row')[1]!.trigger('click')
    const dialog=wrapper.find('.trading-news-modal')
    expect(dialog.text()).toContain('Intensité initiale')
    expect(dialog.text()).toContain('80,00 %')
    expect(dialog.text()).toContain('Poids sur le cours')
    expect(dialog.text()).toContain('×0,95')
    expect(dialog.text()).toContain('Pression cours de cette News')
    expect(dialog.text()).toContain('+0,760')
    expect(dialog.text()).toContain('Pression dividendes de cette News')
    expect(dialog.text()).toContain('+0,600')
    expect(dialog.text()).toContain('PRESSION CUMULÉE DES NEWS ACTIVES')
    expect(dialog.find('.news-aggregate-row:not(.news-aggregate-column-head)').text()).toContain('+0,310')
    expect(dialog.find('.news-aggregate-row:not(.news-aggregate-column-head)').text()).toContain('+0,250')
    expect(dialog.text()).toContain('indices de pression')
    await wrapper.setProps({state:{...state,trading:{...state.trading,dividendLastPaidAt:NOW+480_000}}})
    expect(dialog.text()).toContain('Impact terminé')
    expect(dialog.find('.news-impact-highlight').text()).toContain('0,000')
    expect(dialog.find('.news-aggregate-row:not(.news-aggregate-column-head)').text()).toContain('0,000')
  })
  it('une News crypto ne prétend pas verser de dividendes et une News globale reste repliée',async()=>{
    const state=createCapitalState({balance:1000,lifetimeEarned:1000,purchasedUpgrades:0},NOW)
    state.trading.news=[{...news,id:'turbo-pump',templateId:'meme-viral',affectedAssetIds:['turbo'],impact:0.7}]
    const {wrapper}=setup(state)
    await tab(wrapper,3)
    await wrapper.find('button.news-preview-row').trigger('click')
    expect(wrapper.find('.news-impact-panel').text()).not.toContain('Pression dividendes')
    expect(wrapper.find('.news-aggregate-row:not(.news-aggregate-column-head)').text()).toContain('—')
    await wrapper.find('button.modal-close').trigger('click')
    const global:MarketNews={...news,id:'global-good',templateId:'macro-recovery',
      affectedAssetIds:Object.keys(state.trading.quotes),impact:0.75}
    await wrapper.setProps({state:{...state,trading:{...state.trading,news:[global]}}})
    await wrapper.find('button.news-preview-row').trigger('click')
    expect(wrapper.find('.news-aggregate-more summary').text()).toContain('40 autres actifs')
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
  it('colore les cadres News en vert/rouge selon l’impact et inverse un démenti', async () => {
    const state = createCapitalState({balance:1000,lifetimeEarned:1000,purchasedUpgrades:0},NOW)
    state.trading.news = [
      news,
      { ...news, id:'news-bearish', templateId:'earnings-miss', impact:-0.8 },
      { ...news, id:'news-denied', templateId:'rumor-acquisition', impact:0.8, phase:'denied' },
    ]
    const {wrapper} = setup(state)
    await tab(wrapper,3)
    const cards = wrapper.findAll('button.news-preview-row')
    expect(cards).toHaveLength(3)
    expect(cards[0]?.classes()).toContain('news-bearish')
    expect(cards[1]?.classes()).toContain('news-bearish')
    expect(cards[2]?.classes()).toContain('news-bullish')
    expect(cards[0]?.attributes('aria-label')).toContain('baissière')
    await cards[0]!.trigger('click')
    expect(wrapper.find('.trading-news-modal').classes()).toContain('news-bearish')
    await wrapper.find('.trading-news-modal .modal-close').trigger('click')
    await cards[2]!.trigger('click')
    expect(wrapper.find('.trading-news-modal').classes()).toContain('news-bullish')
    const styles = readFileSync('src/style.css', 'utf8')
    expect(styles).toContain('.news-preview-row.news-bullish')
    expect(styles).toContain('.news-preview-row.news-bearish')
    expect(styles).toContain('.trading-modal.trading-news-modal.news-bearish')
  })

  it('colore également la Vision anticipée avec le sens de l’annonce', () => {
    const pending = { ...news, id:'news-future', templateId:'earnings-miss',
      impact:-0.5, startedAt:NOW+20_000, endsAt:NOW+300_000 }
    const presentation = getNewsPresentation(pending)
    expect(presentation).not.toBeNull()
    const wrapper = mount(NewsPreview,{props:{
      news:[], now:NOW, upcoming:{event:pending,presentation: presentation!,secondsRemaining:20},
    },attachTo:document.body})
    mounted.push(wrapper)
    expect(wrapper.find('.news-future-preview').classes()).toContain('news-bearish')
  })

  it('affiche les 14 news actives, puis les 10 dernières après expiration',async()=>{
    const state=createCapitalState({balance:1000,lifetimeEarned:1000,purchasedUpgrades:0},NOW)
    state.trading.news=Array.from({length:14},(_,index)=>({
      ...news,
      id:'news-'+index,
      startedAt:NOW-14*30_000+index*30_000,
      endsAt:NOW+120_000+index*30_000,
    }))
    const {wrapper,getState}=setup(state)
    await tab(wrapper,3)
    expect(wrapper.findAll('button.news-preview-row')).toHaveLength(14)
    expect(getState().trading.news).toHaveLength(14)
    expect(wrapper.find('.market-list-head span').text()).toContain('14 EN COURS')
    await wrapper.setProps({state:{...state,trading:{...state.trading,dividendLastPaidAt:NOW+1_000_000}}})
    expect(wrapper.findAll('button.news-preview-row')).toHaveLength(10)
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
  it('fait monter les gains aussi avec les animations réduites',()=>{
    // Lecture directe : le chargement CSS de Vitest en jsdom peut renvoyer une chaîne vide.
    const clickerStyles = readFileSync('src/style.css', 'utf8')
    expect(clickerStyles).toContain('@keyframes coin-rise')
    expect(clickerStyles).toContain('transform: translate(-50%, -90px)')
    expect(clickerStyles).toContain('gain-reduced-rise 600ms')
    expect(clickerStyles).toContain('transform: translate(-50%, -72px)')
    expect(clickerStyles).not.toContain('gain-static')
  })
  it('montre le montant flottant à chaque clic et le nettoie en fin d’animation',async()=>{
    const wrapper=mount(App,{attachTo:document.body})
    mounted.push(wrapper)
    const zone=wrapper.find('button.tap-zone')
    const initialBanknotes=wrapper.find('.banknotes').element
    await zone.trigger('click')
    expect(wrapper.findAll('.floating-gain')).toHaveLength(1)
    expect(wrapper.find('.floating-gain').text()).toBe('+1 $')
    expect(wrapper.find('.bundle-shadow.pulsing').exists()).toBe(true)
    expect(wrapper.find('.banknotes').element).toBe(initialBanknotes)
    const firstAnimation=wrapper.find('.banknotes').element
    await zone.trigger('click')
    expect(wrapper.findAll('.floating-gain')).toHaveLength(2)
    expect(wrapper.find('.balance-value').text()).toContain('2')
    expect(wrapper.find('.banknotes').element).toBe(firstAnimation)
    await wrapper.findAll('.floating-gain')[0]!.trigger('animationend')
    expect(wrapper.findAll('.floating-gain')).toHaveLength(1)
    expect(wrapper.find('.floating-gain').text()).toBe('+1 $')
  })
  it('garde la fenêtre News compacte avec entête fixe et scroll strictement interne', async () => {
    const css=readFileSync('src/style.css','utf8')
    expect(css).toContain('.app-shell .trading-modal.trading-news-modal{display:flex;flex-direction:column;height:min(660px,100%);max-height:100%;min-height:0;overflow:hidden}')
    expect(css).toContain('.app-shell .trading-news-modal>.trading-modal-scroll{flex:1 1 0;min-height:0;overflow-y:auto;')
    expect(css).toContain('.trading-news-modal .news-impact-stat{flex-direction:row;')
    const state=createCapitalState({balance:1000,lifetimeEarned:1000,purchasedUpgrades:0},NOW)
    state.trading.news=[news]
    const {wrapper}=setup(state)
    await tab(wrapper,3)
    await wrapper.find('button.news-preview-row').trigger('click')
    const dialog=wrapper.find('.trading-news-modal')
     expect(dialog.find('.trading-modal-header .modal-close').exists()).toBe(true)
    expect(dialog.find('.news-detail-content').attributes('role')).toBe('region')
    expect(dialog.find('.news-detail-content').attributes('tabindex')).toBe('0')
    expect(dialog.findAll('.news-impact-stat').length).toBeGreaterThanOrEqual(7)
  })
  it('replie le surplus d’actifs sans les rendre inaccessibles', async () => {
    const state=createCapitalState({balance:1000,lifetimeEarned:1000,purchasedUpgrades:0},NOW)
    state.trading.news=[{...news,id:'global-news',templateId:'macro-recovery',
      affectedAssetIds:Object.keys(createInitialQuotes(NOW)),impact:0.8}]
    const {wrapper}=setup(state)
    await tab(wrapper,3)
    await wrapper.find('button.news-preview-row').trigger('click')
    const dialog=wrapper.find('.trading-news-modal')
    expect(dialog.findAll('.news-related-grid:not(.news-related-extra) button')).toHaveLength(4)
    expect(dialog.find('.news-related-more summary').text()).toContain('41 autres actifs')
    expect(dialog.findAll('.news-related-extra button')).toHaveLength(41)
    expect(dialog.find('.news-aggregate-more').exists()).toBe(true)
  })
  it('garantit les contrats de hauteur et de scroll des modales Actions/Crypto/News sur petits écrans',async()=>{
    const css=readFileSync('src/style.css','utf8')
    // Invariants statiques : jsdom ne calcule pas une vraie boîte en pixels.
    expect(css).toMatch(/\.trading-modal \{[^}]*width:100%; max-width:530px; height:min\(780px,100%\); max-height:100%; min-height:0;/)
    expect(css).toMatch(/\.trading-modal-scroll \{[^}]*flex:1 1 0; min-height:0; overflow-y:auto;/)
    expect(css).toContain('env(safe-area-inset-bottom,0px)')
    expect(css).toContain('@media (max-height:570px)')
    const {wrapper}=setup()
    await openNvideo(wrapper)
    const assetDialog=wrapper.find('.trading-asset-modal')
    expect(assetDialog.exists()).toBe(true)
    expect(assetDialog.attributes('aria-modal')).toBe('true')
    expect(assetDialog.find('.trading-modal-scroll').exists()).toBe(true)
    expect(assetDialog.find('.order-submit').exists()).toBe(true)
    await assetDialog.find('button.modal-close').trigger('click')
    await tab(wrapper,2)
    await wrapper.find('button.market-asset-row').trigger('click')
    expect(wrapper.find('.trading-asset-modal .trading-modal-scroll').exists()).toBe(true)
    expect(wrapper.find('.trading-asset-modal .order-submit').exists()).toBe(true)
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


it('battery mode keeps live quotes and exact chart statistics while reducing rendered geometry',async()=>{
  const {wrapper}=setup()
  const state=wrapper.props('state') as CapitalState
  const quote=state.trading.quotes.nvideo!
  const history=Array.from({length:720},(_,i)=>({at:NOW-(719-i)*5000,price:quote.price*(i===100?2:i===200?.5:1+i/10000)}))
  await wrapper.setProps({state:{...state,trading:{...state.trading,history:{...state.trading.history,nvideo:history}}}})
  await openNvideo(wrapper)
  const chart=wrapper.find('.market-chart')
  await chart.findAll('.chart-tools button')[4]!.trigger('click')
  const summary=chart.find('.chart-stats').text()
  const points=chart.find('polyline').attributes('points')!.split(' ').length
  assertChartPoints(points)
  expect(wrapper.findAll('.sparkline').length).toBe(20)
  await wrapper.setProps({batterySaver:true})
  expect(wrapper.findAll('.sparkline')).toHaveLength(0)
  expect(chart.find('polygon').exists()).toBe(false)
  expect(chart.find('polyline').attributes('points')!.split(' ').length).toBeLessThanOrEqual(120)
  expect(chart.find('.chart-stats').text()).toBe(summary)
  const next=wrapper.props('state') as CapitalState
  const live={...quote,updatedAt:NOW+1000,price:quote.price*1.5}
  await wrapper.setProps({state:{...next,trading:{...next.trading,quotes:{...next.trading.quotes,nvideo:live}}}})
  expect(chart.find('svg g[color] text').text()).toBe(formatPrice(live.price))
  expect(history).toHaveLength(720)
  await wrapper.setProps({batterySaver:false})
  expect(wrapper.findAll('.sparkline')).toHaveLength(20)
})
function assertChartPoints(points:number){expect(points).toBe(720)}
