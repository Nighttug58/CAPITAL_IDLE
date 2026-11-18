import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {mount,type VueWrapper} from '@vue/test-utils'
import {nextTick} from 'vue'
import {readFileSync} from 'node:fs'
import App from '../App.vue'
import {PRIMARY_PAGES,adjacentPage,nextPageToward,shouldCompleteSwipe,isSwipeDirectionHorizontal} from '../navigation/swipe.ts'

let wrapper:VueWrapper|null=null
beforeEach(()=>localStorage.clear())
afterEach(()=>{
  wrapper?.unmount()
  wrapper=null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
function openApp() {
  wrapper=mount(App,{attachTo:document.body})
  return wrapper
}
function pointer(target:Element,type:'pointerdown'|'pointermove'|'pointerup'|'pointercancel',x:number,y:number) {
  const event=new Event(type,{bubbles:true,cancelable:true})
  Object.defineProperties(event,{
    pointerId:{value:71},pointerType:{value:'touch'},button:{value:0},clientX:{value:x},clientY:{value:y},
  })
  target.dispatchEvent(event)
}
describe('Navigation horizontale V1',()=>{
  it('uses the exact six main-bar pages and never wraps at the edges',()=>{
    expect(PRIMARY_PAGES).toEqual(['home','trading','enterprises','collection','achievements','stats'])
    expect(adjacentPage('home',-1)).toBeNull()
    expect(adjacentPage('stats',1)).toBeNull()
    expect(nextPageToward('home','stats')).toBe('trading')
    expect(nextPageToward('stats','home')).toBe('achievements')
    expect(nextPageToward('collection','collection')).toBeNull()
    expect(shouldCompleteSwipe(70,800)).toBe(true)
    expect(shouldCompleteSwipe(30,50)).toBe(true)
    expect(shouldCompleteSwipe(30,500)).toBe(false)
    expect(isSwipeDirectionHorizontal(42,10)).toBe(true)
    expect(isSwipeDirectionHorizontal(18,75)).toBe(false)
  })
  it('keeps all pages directly under the app shell, with fixed nav and independently scrolling screens',()=>{
    const css=readFileSync('src/style.css','utf8')
    expect(css).toContain('.app-shell > main {')
    expect(css).toContain('position:absolute;')
    expect(css).toContain('touch-action:pan-y')
    expect(css).toContain('grid-row:2;')
    expect(css).toContain('inset:auto 0 0;')
    expect(css).toContain('margin-bottom:0;')
    expect(css).toContain('padding-bottom:calc(var(--tabs-height) + 12px);')
    const w=openApp()
    const labels=w.findAll('.bottom-nav button').slice(0,6).map(b=>b.text())
    expect(labels).toEqual(['Accueil','Trading','Entreprises','Collection','Succès','Stats'])
    expect(w.findAll('main.home-screen')).toHaveLength(1)
    expect(w.find('main.collection-screen').exists()).toBe(false)
    expect(w.find('main.achievements-screen').exists()).toBe(false)
  })
  it('keeps secondary tabs fixed on vertical scroll and attached to sliding pages',async()=>{
    const css=readFileSync('src/style.css','utf8')
    const rule=css.slice(css.indexOf('/* Fixed secondary navigation.'))
    expect(rule).toContain('.app-shell > main :is(.trading-tabs,.collection-tabs,.prestige-tabs) {')
    expect(rule).toContain('position:fixed;')
    expect(rule).toContain('bottom:var(--nav-height);')
    expect(rule).toContain('main[style*="translate3d"] :is(.trading-tabs,.collection-tabs,.prestige-tabs) {')
    expect(rule).toContain('bottom:0;')
    const sheet=document.createElement('style')
    sheet.textContent=rule
    document.head.append(sheet)
    try {
      const w=openApp()
      const trading=w.find('main.trading-screen')
      const tradingTabs=trading.find('.trading-tabs')
      expect(getComputedStyle(tradingTabs.element).position).toBe('fixed')
      ;(trading.element as HTMLElement).scrollTop=350
      expect(getComputedStyle(tradingTabs.element).position).toBe('fixed')
      ;(trading.element as HTMLElement).style.transform='translate3d(20px,0,0)'
      expect(getComputedStyle(tradingTabs.element).bottom).toMatch(/^0(?:px)?$/)
      ;(trading.element as HTMLElement).style.transform=''
      await w.find('.prestige-launch').trigger('click')
      expect(getComputedStyle(w.find('main.ascension-screen .prestige-tabs').element).position).toBe('fixed')
      await w.findAll('.bottom-nav button')[3]!.trigger('click')
      expect(getComputedStyle(w.find('main.collection-screen .collection-tabs').element).position).toBe('fixed')
    } finally {
      sheet.remove()
    }
  })
  it('accepts horizontal swipes, rejects vertical scrolling and does not wrap',async()=>{
    const w=openApp()
    const home=w.find('main.home-screen').element
    pointer(home,'pointerdown',300,100)
    pointer(home,'pointermove',278,240)
    pointer(home,'pointerup',278,240)
    await nextTick()
    expect(w.find('main.home-screen').isVisible()).toBe(true)
    pointer(home,'pointerdown',150,100)
    pointer(home,'pointermove',260,110)
    pointer(home,'pointerup',260,110)
    await nextTick()
    expect(w.find('main.home-screen').isVisible()).toBe(true)
    pointer(home,'pointerdown',300,100)
    pointer(home,'pointermove',180,104)
    await nextTick()
    expect(w.find('main.home-screen').attributes('style')).toContain('translate3d(-120px,0,0)')
    pointer(home,'pointerup',180,104)
    await nextTick()
    expect(w.find('main.trading-screen').isVisible()).toBe(true)
    expect(w.find('main.home-screen').isVisible()).toBe(false)
    expect(w.find('main.trading-screen').attributes('style')).not.toContain('translate3d')
  })
  it('passes through every intermediate page in order, mounting only adjacent screens during animation',async()=>{
    vi.stubGlobal('matchMedia',()=>({matches:false}))
    const raf=new Map<number,FrameRequestCallback>()
    let id=0
    vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{raf.set(++id,cb);return id})
    vi.stubGlobal('cancelAnimationFrame',(frame:number)=>{raf.delete(frame)})
    const frames=()=>{
      for(let i=0;i<2;i++) {
        const queued=[...raf.values()]
        raf.clear()
        queued.forEach(cb=>cb(100+i*16))
      }
    }
    const w=openApp()
    await w.findAll('.bottom-nav button')[5]!.trigger('click')
    await nextTick()
    expect(w.find('main.home-screen').isVisible()).toBe(true)
    expect(w.find('main.trading-screen').isVisible()).toBe(true)
    expect(w.find('main.collection-screen').exists()).toBe(false)
    const sources=['home-screen','trading-screen','enterprise-screen','collection-screen','achievements-screen']
    const destinations=['trading-screen','enterprise-screen','collection-screen','achievements-screen','stats-screen']
    for(let i=0;i<sources.length;i++) {
      frames()
      await nextTick()
      const source=w.find('main.'+sources[i]!)
      expect(source.exists()).toBe(true)
      const event=new Event('transitionend',{bubbles:true})
      Object.defineProperty(event,'propertyName',{value:'transform'})
      source.element.dispatchEvent(event)
      await nextTick()
      expect(w.find('main.'+destinations[i]!).isVisible()).toBe(true)
      if(i+1<sources.length) {
        const old=w.find('main.'+sources[i]!)
        expect(old.exists() && old.isVisible()).toBe(false)
      }
    }
    expect(w.findAll('main').filter(main=>main.isVisible())).toHaveLength(1)
    expect(w.find('main.stats-screen').attributes('style')).not.toContain('translate3d')
    expect(w.findAll('.bottom-nav button')[5]!.attributes('aria-current')).toBe('page')
    expect(raf.size).toBe(0)
  })
  it('does not swipe on modal or chart interactions',async()=>{
    const w=openApp()
    const main=w.find('main.home-screen').element
    const modal=document.createElement('div')
    modal.setAttribute('role','dialog')
    main.appendChild(modal)
    pointer(modal,'pointerdown',280,120)
    pointer(modal,'pointermove',100,120)
    pointer(modal,'pointerup',100,120)
    await nextTick()
    expect(w.find('main.home-screen').isVisible()).toBe(true)
    modal.remove()
    const chart=document.createElement('div')
    chart.className='market-chart'
    main.appendChild(chart)
    pointer(chart,'pointerdown',280,120)
    pointer(chart,'pointermove',100,120)
    pointer(chart,'pointerup',100,120)
    await nextTick()
    expect(w.find('main.home-screen').isVisible()).toBe(true)
    chart.remove()
  })
})
