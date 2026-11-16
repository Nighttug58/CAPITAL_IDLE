import {mount} from '@vue/test-utils'
import {it, expect, vi} from 'vitest'
import App from '../App.vue'
import {createV8CapitalState} from '../exact-state-v8.ts'
import {v8PerformPrestige} from '../exact-prestige-v8.ts'
import {v8CreditIncome} from '../exact-runtime-v8.ts'
import {V8_STORAGE_KEY} from '../exact-persistence-v8.ts'
import {readV8Raw} from './v8-ui-test-helper.ts'

it.each([390,1366])('News purchase and confirmation at %i px',async(width)=>{
 const at=1_800_000_000_000
 vi.spyOn(Date,'now').mockReturnValue(at)
 vi.stubGlobal('innerWidth',width)
 let state=createV8CapitalState(at)
 for(let i=0;i<10;i++){
   const reset=v8PerformPrestige(v8CreditIncome(state,'enterprises',10n**16n),at)
   if(!reset.ok)throw Error(reset.reason)
   state=reset.state
 }
 localStorage.clear()
 localStorage.setItem(V8_STORAGE_KEY,JSON.stringify(v8CreditIncome(state,'clicks',100000000n)))
 const app=mount(App,{attachTo:document.body})
 try{
   await app.findAll('.bottom-nav button')[1]!.trigger('click')
   await app.findAll('.trading-tab').find(b=>b.text()==='News')!.trigger('click')
   await app.find('.news-panel .order-submit').trigger('click')
   expect(readV8Raw().newsPowers?.count).toBe(1)
   await app.find('.news-preview-row').trigger('click')
   await app.find('.trading-news-modal .order-submit').trigger('click')
   expect(readV8Raw().newsPowers?.count).toBe(1)
   await app.findAll('.trading-news-modal button').find(b=>b.text()==='Confirmer la dépense')!.trigger('click')
   expect(readV8Raw().newsPowers?.count).toBe(2)
   expect(app.find('.trading-news-modal').text()).toContain('Terminée manuellement')
 }finally{app.unmount();vi.restoreAllMocks();vi.unstubAllGlobals()}
})
