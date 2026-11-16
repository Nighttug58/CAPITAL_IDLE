import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../App.vue'
import { createCapitalState } from '../capital.ts'
import { getLevelStartThreshold } from '../game.ts'
import { buyFameUpgrade } from '../prestige/shop.ts'
import { V8_STORAGE_KEY, V8_BACKUP_KEY } from '../exact-persistence-v8.ts'
import { readV8Raw } from './v8-ui-test-helper.ts'

const mounted:VueWrapper[]=[]
beforeEach(()=>localStorage.clear())
afterEach(()=>mounted.splice(0).forEach(w=>w.unmount()))

function mountOld(withBoost=false){
  const now=Date.now()
  const dollars=getLevelStartThreshold(30)
  let game=createCapitalState({balance:dollars,lifetimeEarned:dollars,purchasedUpgrades:0},now)
  if(withBoost){
    const purchase=buyFameUpgrade(game,'click',0)
    if(!purchase.ok)throw Error('Cannot seed historic Fame Shop')
    game=purchase.state
  }
  const raw=JSON.stringify(game)
  localStorage.setItem('capital-idle-save-v7',raw)
  const wrapper=mount(App,{attachTo:document.body})
  mounted.push(wrapper)
  return {wrapper,raw}
}

describe('Pass 5 Fame Shop and XP migration in the live V8 app',()=>{
  it('shows new 260 Fame first price and spends only Fame, never cash',async()=>{
    const {wrapper,raw}=mountOld()
    const migrated=readV8Raw()
    expect(migrated.prestige.xpCurveVersion).toBe(4)
    expect(migrated.prestige.lastAwardedLevel).toBe(30)
    await wrapper.find('.fame-shop-launch').trigger('click')
    const boost=wrapper.find('.fame-boost-card[data-boost="click"]')
    expect(boost.find('.fame-boost-cost').text()).toContain('260')
    const cashBefore=readV8Raw().game.balance
    await boost.find('button.fame-buy-button').trigger('click')
    await nextTick()
    const bought=readV8Raw()
    expect(bought.prestige.boosts.click).toBe(1)
    expect(bought.prestige.fameSpentMicros).toBe('260000000')
    expect(bought.prestige.fameLegacyLevels.click).toBe(0)
    expect(bought.game.balance).toBe(cashBefore)
    expect(boost.find('.fame-boost-cost').text()).toContain('338')
    expect(localStorage.getItem('capital-idle-save-v7')).toBe(raw)
    expect(localStorage.getItem(V8_BACKUP_KEY)).toBe(raw)
    expect(localStorage.getItem(V8_STORAGE_KEY)).toBeTruthy()
  })

  it('recognizes an old purchased rank at old price and lists the V2 next price',async()=>{
    const {wrapper}=mountOld(true)
    const saved=readV8Raw()
    expect(saved.prestige.boosts.click).toBe(1)
    expect(saved.prestige.fameLegacyLevels.click).toBe(1)
    expect(saved.prestige.fameSpentMicros).toBe('52000000')
    await wrapper.find('.fame-shop-launch').trigger('click')
    const boost=wrapper.find('.fame-boost-card[data-boost="click"]')
    expect(boost.find('.fame-boost-level').text()).toContain('1/20')
    expect(boost.find('.fame-boost-cost').text()).toContain('338')
    await boost.find('button.fame-buy-button').trigger('click')
    await nextTick()
    const after=readV8Raw()
    expect(after.prestige.fameSpentMicros).toBe('390000000')
    expect(after.prestige.fameLegacyLevels.click).toBe(1)
    expect(after.prestige.boosts.click).toBe(2)
  })
})
