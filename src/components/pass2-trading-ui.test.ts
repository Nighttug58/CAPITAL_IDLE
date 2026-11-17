import {beforeEach,afterEach,expect,it,describe} from 'vitest'
import {readFileSync} from 'node:fs'
import {mount,type VueWrapper} from '@vue/test-utils'
import {nextTick} from 'vue'
import App from '../App.vue'
import TradingScreen from './TradingScreen.vue'
import {createCapitalState} from '../capital.ts'
import {createInitialQuotes} from '../trading/catalog.ts'
import {buyAsset,sellAsset,type TradeSide,type TradeResult} from '../trading/trades.ts'
import type {MarketNews} from '../trading/types.ts'
import StakingPanel from './StakingPanel.vue'
import PortfolioPanel from './PortfolioPanel.vue'
import {createV8CapitalState, getExactAmount as v, type V8CapitalState} from '../exact-state-v8.ts'
import {saveV8CapitalState} from '../exact-persistence-v8.ts'
import {readV8Raw} from './v8-ui-test-helper.ts'
import {projectV8ForLegacyUI} from '../exact-view-v8.ts'
import {v8ChangeStaking} from '../exact-staking-v8.ts'
import {getAsset} from '../trading/catalog.ts'
import type {StakingResult} from '../trading/staking.ts'

const mounted:VueWrapper[]=[]
beforeEach(()=>localStorage.clear())
afterEach(()=>mounted.splice(0).forEach(w=>w.unmount()))

it('active V8 UI buys and liquidates above former supply using raw decimal text, with exact saved quantity',async()=>{
  const base=createV8CapitalState(Date.now())
  const huge=10n**102n
  const wealthy={...base,game:{...base.game,balance:huge.toString(),lifetimeEarned:huge.toString()}}
  expect(saveV8CapitalState(localStorage,wealthy)).toBe(true)
  const wrapper=mount(App,{attachTo:document.body})
  mounted.push(wrapper)
  await wrapper.findAll('.bottom-nav button')[1]!.trigger('click')
  await wrapper.findAll('.trading-tab')[1]!.trigger('click')
  await wrapper.find('button.market-asset-row').trigger('click')
  const amount='240000000001'
  await wrapper.find('#order-quantity').setValue(amount)
  expect(wrapper.find('button.order-submit').attributes('disabled')).toBeUndefined()
  expect(wrapper.find('.order-calculation').text()).not.toContain('Infinity')
  await wrapper.find('button.order-submit').trigger('click')
  await nextTick()
  expect(readV8Raw().trading.positions.nvideo.quantity).toBe('2400000000010000')
  expect(wrapper.find('.order-success').text()).toContain('Achat confirmé')
  expect(BigInt(readV8Raw().game.balance)).toBeLessThan(huge)
  await wrapper.findAll('.order-side button')[1]!.trigger('click')
  await wrapper.findAll('.order-fractions button')[2]!.trigger('click')
  expect((wrapper.find('#order-quantity').element as HTMLInputElement).value).toBe(amount)
  await wrapper.find('button.order-submit').trigger('click')
  await nextTick()
  expect(readV8Raw().trading.positions.nvideo).toBeUndefined()
  expect(wrapper.find('.order-success').text()).toContain('Vente confirmée')
})

it('staking panel accepts exact text exceeding former coin supply and computes MAX without Number',async()=>{
  const original=createV8CapitalState(Date.now())
  const asset=getAsset('ethereum')!
  const quantity=BigInt(asset.totalSupply)*1000n*10n**BigInt(asset.quantityDecimals)
  let exact:V8CapitalState={...original,
    trading:{...original.trading,positions:{ethereum:{quantity:quantity.toString(),costBasis:'0'}}},
    ascension:{...original.ascension,progress:{...original.ascension.progress,
      upgradeLevels:{...original.ascension.progress.upgradeLevels,'crypto-staking':1}}}}
  const legacy=()=>projectV8ForLegacyUI(exact)
  const wrapper=mount(StakingPanel,{props:{state:legacy(),exactState:exact,
    executeStaking:(_action,_id,_quantity):StakingResult=>({ok:false,state:legacy(),error:'invalid-quantity'}),
    executeExactStaking:(action,id,amount)=>{
      const result=v8ChangeStaking(exact,action,id,amount,Date.now())
      if(result.ok)exact=result.state
      return result
    },
  }})
  mounted.push(wrapper)
  await wrapper.find('#staking-quantity').setValue('72000000000')
  expect(wrapper.find('.staking-submit').attributes('disabled')).toBeUndefined()
  await wrapper.find('.staking-submit').trigger('click')
  expect(v(exact.trading.staking.positions.ethereum!.locked)).toBe(72_000_000_000n*10n**BigInt(asset.quantityDecimals))
  expect(wrapper.find('.staking-message').text()).toContain('placés en staking')
})


it('portfolio and trading wallet display exact wealth and holdings above 1e100',()=>{
  const base=createV8CapitalState(Date.now())
  const stock=getAsset('nvideo')!
  const amount=10n**111n
  const exact={...base,game:{...base.game,balance:amount.toString(),lifetimeEarned:amount.toString()},
    trading:{...base.trading,positions:{nvideo:{quantity:(amount*10n**BigInt(stock.quantityDecimals)).toString(),costBasis:'0'}}}}
  const wrapper=mount(PortfolioPanel,{props:{state:projectV8ForLegacyUI(exact),exactState:exact}})
  mounted.push(wrapper)
  expect(wrapper.find('.portfolio-total').text()).toMatch(/[0-9]{1,3}\.[0-9]{2}[A-Z]{2,} \$/)
  expect(wrapper.find('.portfolio-positions').text()).toMatch(/1\.00[A-Z]{2,} unités/)
  expect(wrapper.text()).not.toContain('Infinity')
})


describe('Passe 2 — modales Trading compactes et détails permanents',()=>{
  const at=1_800_000_000_000
  const news:MarketNews={
    id:'ui-asset-news',templateId:'chip-breakthrough',
    startedAt:at-60_000,endsAt:at+120_000,
    affectedAssetIds:['nvideo'],impact:1,phase:'active',
  }
  function setupLegacy(){
    let state=createCapitalState({balance:1_000_000,lifetimeEarned:1_000_000,purchasedUpgrades:0},at)
    state.trading.quotes=createInitialQuotes(at)
    state.trading.news=[news]
    let wrapper:VueWrapper
    function executeTrade(side:TradeSide,id:string,quantity:number):TradeResult {
      const response=side==='buy'?buyAsset(state,id,quantity):sellAsset(state,id,quantity)
      if(response.ok){state=response.state;void wrapper.setProps({state})}
      return response
    }
    wrapper=mount(TradingScreen,{props:{state,executeTrade},attachTo:document.body})
    mounted.push(wrapper)
    return {wrapper,setState:async (next:typeof state)=>{state=next;await wrapper.setProps({state:next})},getState:()=>state}
  }
  async function openAsset(wrapper:VueWrapper,tab:number,match?:string){
    await wrapper.findAll('.trading-tab')[tab]!.trigger('click')
    const rows=wrapper.findAll('button.market-asset-row')
    const target=match?rows.find(row=>row.text().toLowerCase().includes(match.toLowerCase())):rows[0]
    expect(target,'expected an asset row').toBeDefined()
    await target!.trigger('click')
    const modal=wrapper.find('.trading-asset-modal')
    expect(modal.exists()).toBe(true)
    expect(modal.attributes('role')).toBe('dialog')
    expect(modal.attributes('aria-modal')).toBe('true')
    return modal
  }
  it('always renders market min/max, holdings and related news without details/summary or toggle',async()=>{
    const {wrapper}=setupLegacy()
    const modal=await openAsset(wrapper,1,'Nvideo')
    expect(modal.find('details').exists()).toBe(false)
    expect(modal.find('summary').exists()).toBe(false)
    const section=modal.find('section.asset-market-details')
    expect(section.exists()).toBe(true)
    expect(section.attributes('aria-label')).toBe('Détails du marché et actualités')
    expect(section.find('h3').text()).toBe('Détails du marché et actualités')
    expect(section.text()).toContain('Prix minimum')
    expect(section.text()).toContain('Prix maximum')
    expect(section.text()).toContain('Vous détenez')
    expect(section.findAll('.asset-detail-grid > div')).toHaveLength(3)
    expect(section.findAll('.asset-news-related > button')).toHaveLength(1)
    await section.find('.asset-news-related button').trigger('click')
    await nextTick()
    expect(wrapper.find('.trading-news-modal').exists()).toBe(true)
    // News uses history.back() for closing; assert only the real overlay
    // navigation here, independently of jsdom's asynchronous popstate.
    expect(wrapper.find('.trading-asset-modal .asset-market-details').exists()).toBe(true)
  })
  it('shows always-open market details for both crypto and memecoins, including empty news',async()=>{
    const {wrapper}=setupLegacy()
    const bitcoin=await openAsset(wrapper,2,'Bitcoin')
    expect(bitcoin.text()).toContain('CRYPTOMONNAIE')
    expect(bitcoin.find('.asset-market-details').exists()).toBe(true)
    expect(bitcoin.find('.asset-news-empty').text()).toContain('Aucune actualité associée')
    expect(bitcoin.find('details').exists()).toBe(false)
    expect(bitcoin.find('.market-chart').exists()).toBe(true)
    await bitcoin.find('button.modal-close').trigger('click')
    const meme=await openAsset(wrapper,2,'Turbo')
    expect(meme.text()).toContain('MEMECOIN')
    expect(meme.find('.asset-detail-grid').text()).toContain('Prix minimum')
    expect(meme.find('details').exists()).toBe(false)
    expect(meme.find('.market-chart').exists()).toBe(true)
    await meme.find('button.modal-close').trigger('click')
  })
  it('retains buy/sell controls, exact precision, fractions and quote data after the layout change',async()=>{
    const {wrapper,getState}=setupLegacy()
    const modal=await openAsset(wrapper,1,'Nvideo')
    expect(modal.find('.market-chart').exists()).toBe(true)
    expect(modal.find('.order-precision').text()).toContain('Précision autorisée')
    expect(modal.findAll('.order-fractions button').map(b=>b.text())).toEqual(['25 %','50 %','MAX'])
    await modal.find('#order-quantity').setValue('1')
    expect(modal.find('button.order-submit').attributes('disabled')).toBeUndefined()
    await modal.find('button.order-submit').trigger('click')
    await nextTick()
    expect(getState().trading.positions.nvideo?.quantity).toBe(1)
    expect(modal.find('.order-success').text()).toContain('Achat confirmé')
    expect(modal.find('.asset-detail-grid').text()).toContain('1')
    await modal.findAll('.order-side button')[1]!.trigger('click')
    await modal.findAll('.order-fractions button')[2]!.trigger('click')
    expect((modal.find('#order-quantity').element as HTMLInputElement).value).toBe('1')
    await modal.find('button.order-submit').trigger('click')
    await nextTick()
    expect(getState().trading.positions.nvideo).toBeUndefined()
  })
  it('retains chart dimensions, a single internal scroll and narrow/mobile landscape CSS overrides',()=>{
    const css=readFileSync('src/style.css','utf8')
    const chart=readFileSync('src/components/MarketChart.vue','utf8')
    expect(chart).toContain('viewBox="0 0 432 136"')
    expect(chart).toContain('height:clamp(108px,19vh,162px)')
    expect(chart).toContain('width:100%;display:block;height:clamp')
    expect(css).toMatch(/\.app-shell \.trading-modal\.trading-asset-modal\s*\{[^}]*display:flex[^}]*overflow:hidden/)
    expect(css).toMatch(/\.app-shell \.trading-asset-modal>\.trading-modal-scroll\s*\{[^}]*overflow-y:auto[^}]*overflow-x:hidden/)
    expect(css).toContain('@media (max-width:390px)')
    expect(css).toContain('@media (max-height:570px)')
    expect(css).toContain('.trading-asset-modal .asset-detail-grid')
    expect(css).not.toContain('.trading-asset-modal .market-chart svg {height:')
  })
  it('keeps escape closing and focusable order input when scrolling',async()=>{
    const {wrapper}=setupLegacy()
    const modal=await openAsset(wrapper,1,'Nvideo')
    expect(modal.find('#order-quantity').attributes('inputmode')).toBe('decimal')
    ;(modal.find('#order-quantity').element as HTMLInputElement).focus()
    expect(document.activeElement?.id).toBe('order-quantity')
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))
    await nextTick()
    expect(wrapper.find('.trading-asset-modal').exists()).toBe(false)
  })
})
