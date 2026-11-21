import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CollectionScreen from './CollectionScreen.vue'
import { createV8CapitalState } from '../exact-state-v8.ts'
import { CURRENT_COLLECTION_SLOTS } from '../prestige/catalog.ts'

const ids = CURRENT_COLLECTION_SLOTS.map(item => item.id)
const base = createV8CapitalState(1_800_000_000_000)
const withOwned = (ownedCollectionIds: readonly string[]) => ({
  ...base, prestige: { ...base.prestige, ownedCollectionIds: [...ownedCollectionIds] },
})
const unreachable = (): never => { throw new Error('Purchase was not requested') }

describe('Collections V3 progressive UI', () => {
  it('shows six deterministic rarities, the next set threshold and permanent rewards in detail', async () => {
    const wrapper = mount(CollectionScreen, { props: {
      state: withOwned(ids.slice(0, 19)), purchaseCollection: unreachable, purchaseCollectionMax: unreachable,
    } })
    try {
      expect(wrapper.find('.collection-v3-museum').text()).toContain('19/100')
      expect(wrapper.find('.collection-v3-set').text()).toContain('19/20')
      expect(wrapper.find('.collection-v3-set').classes()).not.toContain('is-complete')
      expect(wrapper.findAll('.collection-card')).toHaveLength(20)
      expect(wrapper.findAll('.collection-rarity-tag')).toHaveLength(20)
      expect(wrapper.findAll('.collection-rarity-tag')[0]!.text()).toContain('Commun')
      expect(wrapper.findAll('.collection-rarity-tag')[19]!.text()).toContain('Mythique')
      await wrapper.find('.collection-card').trigger('click')
      expect(wrapper.find('.collection-detail-data').text()).toContain('RARETÉ')
      expect(wrapper.find('.collection-detail-data').text()).toContain('BONUS ORIGINAL')
      expect(wrapper.find('.collection-detail-data').text()).toContain('MUSÉE')
      await wrapper.find('.prestige-close').trigger('click')
      await wrapper.setProps({ state: withOwned(ids.slice(0, 20)) })
      await nextTick()
      expect(wrapper.find('.collection-v3-set').classes()).toContain('is-complete')
      expect(wrapper.find('.collection-v3-set').text()).toContain('DÉBLOQUÉ')
      expect(wrapper.find('.collection-v3-museum').classes()).not.toContain('is-complete')
    } finally { wrapper.unmount() }
  })

  it('unlocks Museum only for 100/100 and updates without page reload', async () => {
    const wrapper = mount(CollectionScreen, { props: {
      state: withOwned(ids.slice(0, 99)), purchaseCollection: unreachable, purchaseCollectionMax: unreachable,
    } })
    try {
      expect(wrapper.find('.collection-v3-museum').classes()).not.toContain('is-complete')
      await wrapper.setProps({ state: withOwned(ids) })
      await nextTick()
      expect(wrapper.find('.collection-v3-museum').classes()).toContain('is-complete')
      expect(wrapper.find('.collection-v3-museum').text()).toContain('+25 % PP')
      expect(wrapper.find('.collection-hero-progress').text()).toContain('100')
    } finally { wrapper.unmount() }
  })

  it('requires confirmation before global MAX and reports the transaction', async () => {
    const rich = {...withOwned([]), game:{...base.game,balance:(10n**30n).toString()}}
    const calls: number[] = []
    const wrapper = mount(CollectionScreen, { props: {
      state:rich,purchaseCollection:unreachable,
      purchaseCollectionMax:()=>{calls.push(1);return {ok:true,count:100,costCents:1_000_000n,fameMicros:5_000_000n}}
    } })
    try {
      expect(wrapper.find('.collection-max-bar').text()).toContain('100 pièces')
      await wrapper.find('.collection-max-button').trigger('click')
      expect(calls).toHaveLength(0)
      expect(wrapper.find('.collection-max-confirm').exists()).toBe(true)
      await wrapper.find('.collection-max-confirm .collection-confirm-buy').trigger('click')
      expect(calls).toHaveLength(1)
      expect(wrapper.find('.collection-max-notice').text()).toContain('100 objets acquis')
      expect(wrapper.find('.collection-max-confirm').exists()).toBe(false)
    } finally { wrapper.unmount() }
  })
  it('disables MAX when no missing collection is affordable', () => {
    const wrapper = mount(CollectionScreen, { props: {
      state:withOwned([]),purchaseCollection:unreachable,purchaseCollectionMax:unreachable,
    } })
    try { expect(wrapper.find('.collection-max-button').attributes('disabled')).toBeDefined() }
    finally { wrapper.unmount() }
  })
})
