import {beforeEach,afterEach,expect,it} from 'vitest'
import {mount,type VueWrapper} from '@vue/test-utils'
import {nextTick} from 'vue'
import App from '../App.vue'
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
