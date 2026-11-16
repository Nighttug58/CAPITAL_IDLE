import {readV8LegacyUI} from './v8-ui-test-helper.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import App from '../App.vue'
import { createCapitalState, type CapitalState } from '../capital.ts'
import { performPrestige } from '../ascension/engine.ts'
import { buyAscensionUpgrade } from '../ascension/shop.ts'
import { creditExperience } from '../prestige/state.ts'
import { buyAsset } from '../trading/trades.ts'

const KEY = 'capital-idle-save-v7'
const mounted: VueWrapper[] = []
beforeEach(() => localStorage.clear())
afterEach(() => mounted.splice(0).forEach(wrapper => wrapper.unmount()))

function ready(): CapitalState {
  const now = Date.now()
  const wealth = 1_000_000_000
  const seed = createCapitalState({ balance: wealth, lifetimeEarned: wealth, purchasedUpgrades: 0 }, now)
  const cycle = performPrestige(seed, now)
  if (!cycle.ok) throw new Error('Fixture Prestige failed')
  const unlock = buyAscensionUpgrade(cycle.state, 'crypto-staking', 0)
  if (!unlock.ok) throw new Error('Staking PP fixture failed')
  const withXP = creditExperience(unlock.state, 100_000 * 100)
  if (!withXP) throw new Error('Fixture XP failed')
  const withCash = {
    ...withXP,
    game: { ...withXP.game, balance: 100_000, lifetimeEarned: 100_000 },
    stats: { ...withXP.stats, earnedBySource: { ...withXP.stats.earnedBySource, unclassified: 100_000 } },
  }
  const order = buyAsset(withCash, 'ethereum', 10)
  if (!order.ok) throw new Error('Fixture ETH buy failed')
  return order.state
}
function mountState(state: CapitalState) {
  localStorage.setItem(KEY, JSON.stringify(state))
  const wrapper = mount(App, { attachTo: document.body })
  mounted.push(wrapper)
  return { wrapper, stored: (): CapitalState => readV8LegacyUI() }
}
async function openStaking(wrapper: VueWrapper) {
  await wrapper.findAll('.bottom-nav button')[1]!.trigger('click')
  const tab = wrapper.findAll('.trading-tab').find(item => item.text() === 'Staking')
  expect(tab).toBeDefined()
  await tab!.trigger('click')
}

describe('Trading — interface Staking Prestige', () => {
  it('n’expose pas le Staking avant l’achat et préserve les cinq onglets principaux', async () => {
    const { wrapper } = mountState(createCapitalState(undefined, Date.now()))
    await wrapper.findAll('.bottom-nav button')[1]!.trigger('click')
    expect(wrapper.findAll('.trading-tab').map(x => x.text())).toEqual(['Portfolio', 'Actions', 'Crypto', 'News'])
    expect(wrapper.findAll('.bottom-nav button').at(-1)?.text()).toBe('Stats')
  })

  it('affiche neuf cryptos, taux et solde disponible puis place et retire des ETH', async () => {
    const { wrapper, stored } = mountState(ready())
    await openStaking(wrapper)
    expect(wrapper.find('.staking-panel').exists()).toBe(true)
    expect(wrapper.findAll('.staking-asset')).toHaveLength(9)
    expect(wrapper.find('.staking-detail-head').text()).toContain('Ethereum')
    expect(wrapper.find('.staking-detail-head').text()).toContain('0.020 %/h')
    const beforeCash = stored().game.balance
    await wrapper.find('#staking-quantity').setValue('4')
    expect(wrapper.find('.staking-submit').attributes('disabled')).toBeUndefined()
    await wrapper.find('.staking-submit').trigger('click')
    expect(stored().trading.staking?.positions.ethereum?.locked).toBe(4)
    expect(stored().game.balance).toBe(beforeCash)
    expect(stored().trading.positions.ethereum?.quantity).toBe(10)
    expect(wrapper.find('.staking-message').text()).toContain('placés')
    await wrapper.findAll('.staking-actions button')[1]!.trigger('click')
    await wrapper.find('#staking-quantity').setValue('2')
    await wrapper.find('.staking-submit').trigger('click')
    const saved = stored()
    expect(saved.trading.staking?.positions.ethereum?.locked).toBe(2)
    expect(saved.trading.staking?.positions.ethereum?.unlocking).toBe(2)
    expect(saved.trading.staking?.positions.ethereum?.unlockAt).toBeGreaterThan(Date.now())
    expect(wrapper.find('.staking-pending').text()).toContain('Retrait en cours')
    expect(wrapper.find('.staking-submit').attributes('disabled')).toBeDefined()
    expect(saved.game.balance).toBe(beforeCash)
  })

  it('le panneau affiche la capitalisation quand l’upgrade est acquis, sinon pas', async () => {
    const { wrapper } = mountState(ready())
    await openStaking(wrapper)
    expect(wrapper.find('.staking-compound').exists()).toBe(false)
    expect(wrapper.find('.staking-facts').text()).toContain('24 h max.')
  })
})
