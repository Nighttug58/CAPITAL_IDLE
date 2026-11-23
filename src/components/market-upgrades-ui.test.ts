import {readV8LegacyUI} from './v8-ui-test-helper.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../App.vue'
import { createV9CapitalState,type V9CapitalState } from '../exact-state-v8.ts'
import {v8CreditIncome,v8BuyPrestigeUpgrade} from '../exact-runtime-v8.ts'
import {v8PerformPrestige} from '../exact-prestige-v8.ts'
import {V9_STORAGE_KEY} from '../exact-persistence-v8.ts'
import { getAsset } from '../trading/catalog.ts'

const wrappers: VueWrapper[] = []
beforeEach(() => localStorage.clear())
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

function withPP(cycles=1):V9CapitalState {
 const now=Date.now()
 let exact=createV9CapitalState(now)
 for(let i=0;i<cycles;i++){
  exact=v8CreditIncome(exact,'clicks',10n**38n)
  const result=v8PerformPrestige(exact,now)
  if(!result.ok)throw Error('Current V9 Prestige fixture: '+result.reason)
  exact=result.state
 }
 return exact
}
function buyLevels(state:V9CapitalState,id:string,amount:number):V9CapitalState {
 let next=state
 for(let i=0;i<amount;i++){
  const purchased=v8BuyPrestigeUpgrade(next,id as keyof V9CapitalState['ascension']['progress']['upgradeLevels'],i)
  if(!purchased)throw Error('V9 PP purchase failed: '+id)
  next=purchased
 }
 return next
}
function mountGame(state:V9CapitalState) {
 localStorage.setItem(V9_STORAGE_KEY,JSON.stringify(state))
 const wrapper=mount(App,{attachTo:document.body})
 wrappers.push(wrapper)
 return {wrapper,stored:()=>readV8LegacyUI()}
}

describe('Prestige marché — contrôles interactifs et affichage', () => {
  it('affiche six vitesses mais verrouille celles qui ne sont pas achetées', async () => {
    const { wrapper } = mountGame(withPP())
    await wrapper.find('.prestige-launch').trigger('click')
    const buttons = wrapper.findAll('.ascension-speed-button')
    expect(buttons).toHaveLength(6)
    expect(buttons[0]?.attributes('aria-pressed')).toBe('true')
    expect(buttons.slice(1).every(button => button.attributes('disabled') !== undefined)).toBe(true)
  })

  it('achète et active ×1,5, revient à ×1, persiste sa sélection', async () => {
    const { wrapper, stored } = mountGame(withPP(10))
    await wrapper.find('.prestige-launch').trigger('click')
    await wrapper.find('.ascension-upgrade[data-upgrade="time-accelerator"] .ascension-buy').trigger('click')
    await nextTick()
    const speeds = wrapper.findAll('.ascension-speed-button')
    expect(speeds[1]?.attributes('disabled')).toBeUndefined()
    await speeds[1]!.trigger('click')
    await nextTick()
    expect(stored().ascension.run.marketClock.selectedSpeed).toBe(1.5)
    expect(stored().ascension.progress.upgradeLevels['time-accelerator']).toBe(1)
    expect(speeds[1]?.attributes('aria-pressed')).toBe('true')
    await speeds[0]!.trigger('click')
    expect(stored().ascension.run.marketClock.selectedSpeed).toBe(1)
  })

  it('Frénésie ne s’active qu’après achat et enregistre son cooldown réel', async () => {
    const { wrapper, stored } = mountGame(withPP(7))
    await wrapper.find('.prestige-launch').trigger('click')
    const ability = wrapper.find('.ascension-frenzy-button')
    expect(ability.attributes('disabled')).toBeDefined()
    await wrapper.find('.ascension-upgrade[data-upgrade="market-frenzy"] .ascension-buy').trigger('click')
    await ability.trigger('click')
    await nextTick()
    const run = stored().ascension.run
    expect(run.frenzyEndsAtRealMs).toBeGreaterThan(Date.now() - 2_000)
    expect(run.frenzyReadyAtRealMs! - run.frenzyEndsAtRealMs!).toBe(29 * 60_000)
    expect(ability.attributes('disabled')).toBeDefined()
  })

  it('News anticipées et radar apparaissent seulement après l’achat Prestige', async () => {
    let state = withPP()
    state = buyLevels(state, 'news-preview', 5)
    state = buyLevels(state, 'volatility-radar', 1)
    const now = state.trading.dividendLastPaidAt
    const pending = {
      id: 'news-' + (now + 15_000).toString(36),
      templateId: 'chip-breakthrough',
      startedAt: now + 15_000,
      endsAt: now + 300_000,
      affectedAssetIds: ['nvideo'],
      impact: 0.6,
      phase: 'active' as const,
    }
    state = { ...state, trading: {
      ...state.trading,
      nextNewsAt: pending.startedAt, upcomingNews: pending,
      history: {
        bitcoin: [
          { at: now - 5_000, price: getAsset('bitcoin')!.referencePrice },
          { at: now, price: getAsset('bitcoin')!.referencePrice * 1.15 },
        ],
      },
    }}
    const { wrapper } = mountGame(state)
    await wrapper.findAll('.bottom-nav button')[1]!.trigger('click')
    expect(wrapper.find('.trading-radar').exists()).toBe(true)
    expect(wrapper.find('.trading-radar').text()).toContain('BTC')
    await wrapper.findAll('.trading-tab')[3]!.trigger('click')
    expect(wrapper.find('.news-future-preview').exists()).toBe(true)
    expect(wrapper.find('.news-future-preview').text()).toContain('Nvideo')
  })
})
