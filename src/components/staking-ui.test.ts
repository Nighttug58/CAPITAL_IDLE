import {readV8LegacyUI} from './v8-ui-test-helper.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import App from '../App.vue'
import type {CapitalState} from '../capital.ts'
import {createV9CapitalState,type V9CapitalState} from '../exact-state-v8.ts'
import {v8CreditIncome,v8BuyTrade,v8BuyPrestigeUpgrade} from '../exact-runtime-v8.ts'
import {v8PerformPrestige} from '../exact-prestige-v8.ts'
import {V9_STORAGE_KEY} from '../exact-persistence-v8.ts'

const mounted: VueWrapper[] = []
beforeEach(() => {localStorage.clear(); vi.spyOn(Date,'now').mockReturnValue(1_800_000_000_000)})
afterEach(() => {mounted.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks()})

function ready():V9CapitalState {
 const now=Date.now()
 const rich=v8CreditIncome(createV9CapitalState(now),'clicks',10n**35n)
 const prestiged=v8PerformPrestige(rich,now)
 if(!prestiged.ok)throw Error(prestiged.reason)
 const unlocked=v8BuyPrestigeUpgrade(prestiged.state,'crypto-staking',0)
 if(!unlocked)throw Error('V9 staking PP fixture failed')
 const paid=v8CreditIncome(unlocked,'clicks',100_000_000n)
 const traded=v8BuyTrade(paid,'ethereum','10')
 if(!traded.ok)throw Error('V9 ETH purchase fixture failed: '+traded.reason)
 return traded.state
}
function mountState(state:V9CapitalState) {
 localStorage.setItem(V9_STORAGE_KEY,JSON.stringify(state))
 const wrapper=mount(App,{attachTo:document.body})
 mounted.push(wrapper)
 return {wrapper,stored:():CapitalState=>readV8LegacyUI()}
}
async function openStaking(wrapper: VueWrapper) {
  await wrapper.findAll('.bottom-nav button')[1]!.trigger('click')
  const tab = wrapper.findAll('.trading-tab').find(item => item.text() === 'Staking')
  expect(tab).toBeDefined()
  await tab!.trigger('click')
}

describe('Trading — interface Staking Prestige', () => {
  it('n’expose pas le Staking avant l’achat et préserve les cinq onglets principaux', async () => {
    const { wrapper } = mountState(createV9CapitalState(Date.now()))
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
