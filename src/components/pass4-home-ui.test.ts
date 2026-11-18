import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { BANKNOTE_FPS, BANKNOTE_FRAME_COUNT, BANKNOTE_CYCLE_MS, banknoteFrameAtElapsedMs } from '../bill-animation.ts'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import App from '../App.vue'
import { createV8CapitalState, getExactAmount as cents } from '../exact-state-v8.ts'
import { V8_STORAGE_KEY, saveV8CapitalState } from '../exact-persistence-v8.ts'
import { dollarAutoClickPriceCents, buyDollarAutoClick } from '../dollar-autoclick-v8.ts'
import { v8CreditIncome, quoteV8ClickMax } from '../exact-runtime-v8.ts'
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

describe('Pass 0.5 — continuous fixed-speed 48-frame banknotes', () => {
  it('maps elapsed time to exactly 12 fps, regardless of display refresh or tap frequency', () => {
    expect(BANKNOTE_FPS).toBe(12)
    expect(BANKNOTE_FRAME_COUNT).toBe(48)
    expect(BANKNOTE_CYCLE_MS).toBe(4000)
    expect(banknoteFrameAtElapsedMs(0)).toBe(0)
    expect(banknoteFrameAtElapsedMs(82)).toBe(0)
    expect(banknoteFrameAtElapsedMs(84)).toBe(1)
    expect(banknoteFrameAtElapsedMs(250)).toBe(3)
    expect(banknoteFrameAtElapsedMs(1000)).toBe(12)
    expect(banknoteFrameAtElapsedMs(3999)).toBe(47)
    expect(banknoteFrameAtElapsedMs(4000)).toBe(0)
    expect(banknoteFrameAtElapsedMs(8084)).toBe(1)
    expect(banknoteFrameAtElapsedMs(-1)).toBe(0)
    expect(banknoteFrameAtElapsedMs(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('autoplays all 48 sprite frames with CSS and never restarts on a click', async () => {
    const css = readFileSync('src/style.css', 'utf8')
    expect(css).toMatch(/\.home-screen \.banknotes\{[^}]*animation:banknote-spin 4000ms steps\(1,end\) infinite/)
    const frames = [...css.matchAll(/^\s*\d+(?:\.\d+)?%\s*\{\s*background-position:/gm)]
    expect(frames).toHaveLength(49) // 48 frames plus the loop boundary at 100%.
    expect(css).not.toContain('.home-screen .tap-zone .banknotes{transform:none;transition:none;animation:none}')
    const wrapper = start()
    const sprite = wrapper.find('.banknotes').element
    expect(wrapper.find('.banknotes').attributes('style')).toBeUndefined()
    await wrapper.find('.tap-zone').trigger('click')
    expect(wrapper.find('.banknotes').element).toBe(sprite)
    expect(wrapper.findAll('.floating-gain')).toHaveLength(1)
  })

  it('discards floating gains when leaving home and does not replay them on return', async () => {
    const css = readFileSync('src/style.css', 'utf8')
    expect(css).toContain('animation: coin-rise 600ms')
    expect(css).toContain('animation: gain-reduced-rise 600ms')
    const wrapper = start()
    await wrapper.find('.tap-zone').trigger('click')
    expect(wrapper.findAll('.floating-gain')).toHaveLength(1)
    await wrapper.findAll('.bottom-nav button')[1]!.trigger('click')
    await nextTick()
    expect(wrapper.findAll('.floating-gain')).toHaveLength(0)
    await wrapper.findAll('.bottom-nav button')[0]!.trigger('click')
    await nextTick()
    expect(wrapper.findAll('.floating-gain')).toHaveLength(0)
    await wrapper.find('.tap-zone').trigger('click')
    expect(wrapper.findAll('.floating-gain')).toHaveLength(1)
    await wrapper.find('.floating-gain').trigger('animationend')
    expect(wrapper.findAll('.floating-gain')).toHaveLength(0)
  })

})


describe('Pass 1 — MAX purchase on the home page',()=>{
  it('shows +1 and MAX, buys all affordable click upgrades in one verified V8 write',async()=>{
    const initial=v8CreditIncome(createV8CapitalState(Date.now()),'clicks',10n**20n)
    expect(saveV8CapitalState(localStorage,initial)).toBe(true)
    const quote=quoteV8ClickMax(initial)!
    const wrapper=start()
    const max=wrapper.find('.home-click-max')
    expect(max.exists()).toBe(true)
    expect(max.attributes('disabled')).toBeUndefined()
    expect(max.text()).toContain('MAX')
    expect(wrapper.find('.home-click-actions .home-upgrade-buy').text()).toContain('+1')
    expect(max.attributes('title')).toContain(String(quote.levelsBought))
    const writes=vi.spyOn(Storage.prototype,'setItem')
    await max.trigger('click')
    await nextTick()
    const saved=readV8Raw()
    expect(saved.game.purchasedUpgrades).toBe(quote.targetLevel)
    expect(cents(saved.game.balance)).toBe(cents(initial.game.balance)-quote.costCents)
    expect(saved.prestige.experienceCents).toBe(initial.prestige.experienceCents)
    const snapshots=writes.mock.calls.filter(([key])=>key===V8_STORAGE_KEY)
      .map(([,payload])=>JSON.parse(payload))
    expect(snapshots.some(s=>s.game.purchasedUpgrades===quote.targetLevel)).toBe(true)
    expect(snapshots.every(s=>[0,quote.targetLevel].includes(s.game.purchasedUpgrades))).toBe(true)
    expect(wrapper.find('.home-click-max-notice').text()).toContain(String(quote.levelsBought))
    expect(max.attributes('disabled')).toBeDefined()
    writes.mockRestore()
  })
  it('disables both buttons if the next level is player-locked despite cash',()=>{
    const base=wealthy()
    const wrapper=start()
    expect(base.game.balance).not.toBe('0')
    expect(wrapper.find('.home-click-max').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.home-click-actions .home-upgrade-buy').attributes('disabled')).toBeDefined()
  })
})
