import {readV8LegacyUI,seedLegacyUIFixtureAsV9} from './v8-ui-test-helper.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../App.vue'
import { createCapitalState, type CapitalState } from '../capital.ts'
import { performPrestige } from '../ascension/engine.ts'
import { buyAscensionUpgrade } from '../ascension/shop.ts'
import { getAsset } from '../trading/catalog.ts'

const SAVED = 'capital-idle-save-v7'
const wrappers: VueWrapper[] = []
beforeEach(() => localStorage.clear())
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

function withPP(cycles = 1): CapitalState {
  const now = Date.now()
  const initial = createCapitalState({ balance: 10_000_000_000, lifetimeEarned: 10_000_000_000, purchasedUpgrades: 0 }, now)
  const cycle = performPrestige(initial, now)
  if (!cycle.ok) throw new Error('Prestige fixture invalid')
  const progress=cycle.state.ascension.progress
  const history=Array.from({length:cycles}, (_,i)=>({...progress.history[0]!,cycle:i+1}))
  return {...cycle.state,ascension:{...cycle.state.ascension,progress:{...progress,history,
    prestigeCount:cycles,lifetimePoints:progress.lifetimePoints*cycles,availablePoints:progress.availablePoints*cycles}}}
}
function buyLevels(state: CapitalState, id: string, amount: number): CapitalState {
  let current = state
  for (let i = 0; i < amount; i++) {
    const bought = buyAscensionUpgrade(current, id, i)
    if (!bought.ok) throw new Error('Fixture PP too low: ' + id)
    current = bought.state
  }
  return current
}
function mountGame(state: CapitalState) {
  seedLegacyUIFixtureAsV9(state)
  const wrapper = mount(App, { attachTo: document.body })
  wrappers.push(wrapper)
  return { wrapper, stored: () => readV8LegacyUI() }
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
