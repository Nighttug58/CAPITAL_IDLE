import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import App from '../App.vue'
import { createV8CapitalState, getExactAmount as cents } from '../exact-state-v8.ts'
import { V8_STORAGE_KEY, saveV8CapitalState } from '../exact-persistence-v8.ts'
import { dollarAutoClickPriceCents, buyDollarAutoClick } from '../dollar-autoclick-v8.ts'
import { readV8Raw } from './v8-ui-test-helper.ts'

const mounted:VueWrapper[]=[]
beforeEach(()=>localStorage.clear())
afterEach(()=>mounted.splice(0).forEach(w=>w.unmount()))
function start(){const w=mount(App,{attachTo:document.body});mounted.push(w);return w}
function wealthy(){
  const base=createV8CapitalState(Date.now())
  const cash=10n**35n
  const state={...base,game:{...base.game,balance:cash.toString(),lifetimeEarned:cash.toString()},
    stats:{...base.stats,earnedBySource:{...base.stats.earnedBySource,unclassified:cash.toString()}}}
  expect(saveV8CapitalState(localStorage,state)).toBe(true)
  return state
}

describe('Pass 4 — compact home and dollar Auto Click',()=>{
  it('groups XP, Boosts, click upgrade and Auto Click in one accessible deck',async()=>{
    const wrapper=start()
    const deck=wrapper.find('.home-progression')
    expect(deck.exists()).toBe(true)
    expect(deck.find('.home-progress-identity').text()).toContain('Niveau 1')
    expect(deck.find('.home-xp-track').attributes('role')).toBe('progressbar')
    expect(deck.find('.home-xp-track').attributes('aria-valuenow')).toBe('0')
    expect(deck.find('button.boost-trigger').text()).toContain('Boosts')
    expect(deck.findAll('.home-upgrade-row')).toHaveLength(2)
    expect(deck.findAll('.upgrade-button')).toHaveLength(2)
    expect(deck.find('.home-upgrade-row[aria-label="Amélioration Auto Click"]').text()).toContain('0 / 20')
    expect(deck.find('.home-auto-footnote').text()).toContain('uniquement en jeu actif')
    expect(deck.find('.home-auto-buy').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.tap-zone').exists()).toBe(true)
  })

  it('buys Auto Click for dollars in V8 without changing PP, Fame, level or XP, and reloads',async()=>{
    const initial=wealthy()
    const initialPP=initial.ascension.progress.availablePoints
    const initialFame=initial.prestige.fameMicros
    const wrapper=start()
    const auto=wrapper.find('.home-upgrade-row[aria-label="Amélioration Auto Click"]')
    expect(auto.find('.home-auto-buy').attributes('disabled')).toBeUndefined()
    expect(auto.find('.home-auto-buy').text()).toContain('2.50K $')
    await auto.find('.home-auto-buy').trigger('click')
    const after=readV8Raw()
    expect(after.ascension.run.autoClickLevel).toBe(1)
    expect(cents(after.game.balance)).toBe(cents(initial.game.balance)-dollarAutoClickPriceCents(0)!)
    expect(after.ascension.progress.availablePoints).toBe(initialPP)
    expect(after.prestige.fameMicros).toBe(initialFame)
    expect(after.prestige.experienceCents).toBe('0')
    expect(after.stats.clickCount).toBe(0)
    expect(auto.text()).toContain('1 /s')
    expect(auto.find('.home-auto-buy').text()).toContain('12.50K $')
    wrapper.unmount();mounted.splice(mounted.indexOf(wrapper),1)
    const restarted=start()
    await nextTick()
    expect(restarted.find('.home-auto-rate').text()).toContain('1 /s')
    expect(readV8Raw().ascension.run.autoClickLevel).toBe(1)
    expect(localStorage.getItem('capital-idle-save-v7')).toBeNull()
  })

  it('max rank 20 stops purchases but stays visible, preserving giant cash',async()=>{
    let state=wealthy()
    for(let rank=0;rank<20;rank++)state=buyDollarAutoClick(state,Date.now())!
    expect(saveV8CapitalState(localStorage,state)).toBe(true)
    const wrapper=start()
    const auto=wrapper.find('.home-upgrade-row[aria-label="Amélioration Auto Click"]')
    expect(auto.text()).toContain('20 /s')
    expect(auto.text()).toContain('20 / 20')
    expect(auto.find('.home-auto-buy').text()).toContain('MAX')
    expect(auto.find('.home-auto-buy').attributes('disabled')).toBeDefined()
    expect(readV8Raw().game.balance).toBe(state.game.balance)
  })

  it('keeps Boosts and current click income in the same card without duplicate panels',()=>{
    const wrapper=start()
    expect(wrapper.findAll('.tap-reward')).toHaveLength(1)
    expect(wrapper.findAll('.home-progress-head')).toHaveLength(1)
    expect(wrapper.findAll('.home-upgrade-row')).toHaveLength(2)
    expect(wrapper.find('.home-upgrade-info .tap-reward').text()).toContain('1 $')
  })

  it('has compact small-screen styling and respects reduced-motion',()=>{
    const css=readFileSync('src/style.css','utf8')
    expect(css).toContain('.home-progress-head')
    expect(css).toContain('.home-upgrade-list')
    expect(css).toContain('.home-upgrade-buy')
    expect(css).toContain('@media(max-width:390px)')
    expect(css).toContain('@media(prefers-reduced-motion:reduce)')
    expect(css).toContain('.home-xp-fill {transition:none;box-shadow:none}')
  })
})
