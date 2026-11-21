import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createV8CapitalState } from '../exact-state-v8.ts'
import { projectV8ForLegacyUI } from '../exact-view-v8.ts'
import FameShopScreen from './FameShopScreen.vue'
import TranscendentShopScreen from './TranscendentShopScreen.vue'
import { TRANSCENDENT_MAIN_IDS, zeroTranscendentV1 } from '../ascension/transcendent-v1.ts'

const AT=1_800_000_000_000
const full=()=>({click:20,enterprise:20,dividend:20,xp:20,trading:20,fame:20})
const noBuy=():never=>{throw Error('UI test should not perform purchase')}
const exact=(fameMicros='0',cycles=2)=>{
  const source=createV8CapitalState(AT)
  return {...source,prestige:{...source.prestige,boosts:full(),fameMicros},
    ascension:{...source.ascension,progress:{...source.ascension.progress,prestigeCount:cycles}}}
}

describe('Pass 7 Fame Shop and ultimate Prestige UI',()=>{
  it('shows cap ×102 at two Prestiges, ×1 after Fame reset and next 100 Fame step',async()=>{
    const initial=exact()
    const wrapper=mount(FameShopScreen,{props:{state:projectV8ForLegacyUI(initial),
      exactState:initial,purchaseBoost:noBuy}})
    try {
      expect(wrapper.find('.absolute-prestige-factor').text()).toContain('×1')
      expect(wrapper.find('.absolute-prestige-details').text()).toContain('100 Fame')
      expect(wrapper.find('.absolute-prestige-card').text()).toContain('×102')
      const newCycle=exact((100_000_000n*1000n).toString())
      await wrapper.setProps({state:projectV8ForLegacyUI(newCycle),exactState:newCycle})
      await nextTick()
      expect(wrapper.find('.absolute-prestige-factor').text()).toContain('×102')
      expect(wrapper.find('.absolute-prestige-details').text()).toContain('Plafond')
      expect(wrapper.text()).not.toContain('Infinity')
      expect(wrapper.text()).not.toContain('NaN')
    } finally { wrapper.unmount() }
  })
  it('renders very large Fame/cycle cap without numeric overflow',()=>{
    const original=exact((10n**150n).toString(),Number.MAX_SAFE_INTEGER)
    const huge={...original,ascension:{...original.ascension,
      progress:{...original.ascension.progress,prestigeCountExact:(10n**100n).toString()}}}
    const wrapper=mount(FameShopScreen,{props:{state:projectV8ForLegacyUI(huge),
      exactState:huge,purchaseBoost:noBuy}})
    try {
      expect(wrapper.find('.absolute-prestige-factor').text()).toMatch(/×/)
      expect(wrapper.text()).not.toContain('Infinity')
      expect(wrapper.text()).not.toContain('NaN')
    } finally { wrapper.unmount() }
  })
  it('requires seven maxed main branches and responds to PP changes',async()=>{
    const source=createV8CapitalState(AT)
    const fullLevels={version:2 as const,levels:{...zeroTranscendentV1().levels,
      ...Object.fromEntries(TRANSCENDENT_MAIN_IDS.map(id=>[id,100]))}}
    const state={...source,ascension:{...source.ascension,progress:{
      ...source.ascension.progress,prestigeCount:3,transcendentV1:fullLevels,
      availablePoints:'1000000000',
    }}}
    const wrapper=mount(TranscendentShopScreen,{props:{exact:state,purchaseBranch:()=>false}})
    try {
      expect(wrapper.find('[data-ultimate-reserve]').classes()).toContain('is-unlocked')
      expect(wrapper.find('[data-ultimate-reserve]').text()).toContain('×1,25')
      expect(wrapper.find('[data-ultimate-reserve]').text()).toContain('700/700')
      const changed={...state,ascension:{...state.ascension,progress:{
        ...state.ascension.progress,availablePoints:'0',
      }}}
      await wrapper.setProps({exact:changed})
      await nextTick()
      expect(wrapper.find('[data-ultimate-reserve]').text()).toContain('×1')
      const locked={...changed,ascension:{...changed.ascension,progress:{
        ...changed.ascension.progress,transcendentV1:{...fullLevels,levels:{
          ...fullLevels.levels,heritage:999,
        }},
      }}}
      await wrapper.setProps({exact:locked})
      await nextTick()
      expect(wrapper.find('[data-ultimate-reserve]').classes()).not.toContain('is-unlocked')
    } finally { wrapper.unmount() }
  })
})
