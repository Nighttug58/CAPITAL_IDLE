#!/usr/bin/env node
/**
 * Real Chromium smoke path for the pass-8 validation runner (not jsdom).
 * Browser, actual Vue event handlers, real CSS layout and native browser focus.
 * Local deterministic V8 fixture; does not log in or touch production saves.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import { createV8CapitalState } from '../src/exact-state-v8.ts'
import { v8CreditIncome, v8BuyCollection } from '../src/exact-runtime-v8.ts'
import { CURRENT_COLLECTION_SLOTS } from '../src/prestige/catalog.ts'
import { transcendentSpent, zeroTranscendentV1,
  TRANSCENDENT_MAIN_IDS } from '../src/ascension/transcendent-v1.ts'
import { validateExactV8State } from '../src/exact-save-validation.ts'
import { getAsset } from '../src/trading/catalog.ts'

const PORT=4173
const BASE='http://127.0.0.1:'+PORT+'/CAPITAL_IDLE/'
const output='artifacts/pass8-browser'
// A stalled browser must not monopolize CI indefinitely. Test failures remain failures.
const watchdog=setTimeout(()=>{
  console.error('[BROWSER PASS8] watchdog expired after 140s')
  process.exit(124)
},140_000)
watchdog.unref()
mkdirSync(output,{recursive:true})
const now=Date.now()
const fresh=createV8CapitalState(now)
let source=v8CreditIncome(fresh,'clicks',10n**32n)
for(const row of CURRENT_COLLECTION_SLOTS){
  const bought=v8BuyCollection(source,row.id)
  assert.ok(bought,'Could not acquire '+row.id)
  source=bought
}
const transcendent=zeroTranscendentV1()
const full={version:1,levels:{...transcendent.levels,
  ...Object.fromEntries(TRANSCENDENT_MAIN_IDS.map(id=>[id,1_000]))}}
const spent=transcendentSpent(full)
assert.ok(spent!==null)
const rich={...source,
  ascension:{...source.ascension,progress:{...source.ascension.progress,
    prestigeCount:101,transcendentV1:full,history:[],
    availablePoints:'1000000000',lifetimePoints:(spent+1_000_000_000n).toString()}}}
const validation=validateExactV8State(rich,(id)=>getAsset(id)?.quantityDecimals??null)
assert.equal(validation.valid,true,validation.reason)

const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(PORT)],
  {stdio:['ignore','pipe','pipe']})
let serverOutput=''
server.stdout.on('data',chunk=>{serverOutput+=chunk.toString()})
server.stderr.on('data',chunk=>{serverOutput+=chunk.toString()})
let browser
const errors=[]
const click=async (page,selector)=>{
  const control=page.locator(selector).first()
  await control.waitFor({state:'visible',timeout:10_000})
  await control.click()
}
const visible=async(page,selector)=>page.locator(selector).first().isVisible()
const expectNoOverflow=async(page,where)=>{
  const layout=await page.evaluate(()=>({
    inner:innerWidth,scroll:document.documentElement.scrollWidth,
    body:document.body.scrollWidth,
    visible:!!document.querySelector('.bottom-nav'),
  }))
  assert.ok(layout.visible,where+': navigation missing')
  assert.ok(layout.scroll<=layout.inner+2,
    where+': horizontal overflow '+JSON.stringify(layout))
}
async function browserScenario(viewport){
  const page=await browser.newPage({viewport,
    reducedMotion:'no-preference'})
  page.setDefaultTimeout(12_000)
  page.setDefaultNavigationTimeout(20_000)
  console.log('[BROWSER PASS8] begin',viewport.width+'x'+viewport.height)
  page.on('pageerror',e=>errors.push(viewport.width+': '+e.message))
  page.on('response',response=>{
    if(response.status()>=400 && !/\/favicon\.ico(?:\?|$)/.test(response.url()))
      errors.push(viewport.width+' HTTP '+response.status()+': '+response.url())
  })
  page.on('console',msg=>{
    // HTTP failures are reported with their concrete URL above. Chrome's
    // generic console message alone omits the URL and may be the favicon.
    if(msg.type()==='error' && !/Failed to load resource/.test(msg.text()))
      errors.push(viewport.width+' console: '+msg.text())
  })
  await page.addInitScript(data=>localStorage.setItem('capital-idle-save-v8',data),JSON.stringify(rich))
  try{
    await page.goto(BASE,{waitUntil:'networkidle',timeout:30_000})
    await page.locator('.balance-value').waitFor({timeout:20_000})
    assert.equal(await page.locator('.bottom-nav button').count(),7,'six tabs plus the fullscreen control')
    await expectNoOverflow(page,'home-'+viewport.width)
    const initial=await page.locator('.banknotes').getAttribute('style')
    await page.waitForTimeout(270)
    const animated=await page.locator('.banknotes').getAttribute('style')
    assert.notEqual(initial,animated,'12 FPS bill must animate autonomously (without click)')
    await click(page,'.boost-trigger')
    assert.equal(await visible(page,'.boost-dialog[open]'),true)
    await page.keyboard.press('Escape')
    await page.screenshot({path:output+'/home-'+viewport.width+'x'+viewport.height+'.png'})

    // Trading/Asset/News — click, focus, native dialog closure and live direction.
    await click(page,'.bottom-nav button:nth-child(2)')
    await click(page,'.trading-tab:has-text("Actions")')
    await click(page,'.market-asset-row')
    assert.equal(await visible(page,'.trading-asset-modal'),true)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    assert.equal(await visible(page,'.trading-asset-modal'),false)
    await click(page,'.trading-tab:has-text("News")')
    await page.locator('.news-preview-row').first().waitFor({timeout:10_000})
    assert.ok(await page.locator('.news-preview-row.news-bullish, .news-preview-row.news-bearish').count()>0,
      'at least one active directional news when no active event exists')
    await click(page,'.news-preview-row')
    assert.equal(await visible(page,'.trading-news-modal'),true)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    await expectNoOverflow(page,'trading-'+viewport.width)

    await click(page,'.bottom-nav button:nth-child(3)')
    assert.equal(await page.locator('.enterprise-card').count(),20)
    assert.ok(await page.locator('.enterprise-max-action').count()>0)
    await expectNoOverflow(page,'enterprises-'+viewport.width)

    await click(page,'.bottom-nav button:nth-child(4)')
    assert.equal(await page.locator('.collection-card').count(),20)
    await click(page,'.collection-card')
    assert.equal(await visible(page,'.collection-detail-dialog'),true)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(80)
    assert.equal(await visible(page,'.collection-detail-dialog'),false)
    await expectNoOverflow(page,'collection-'+viewport.width)

    await click(page,'.bottom-nav button:nth-child(5)')
    await page.locator('.achievements-group').first().waitFor()
    await click(page,'.achievements-back')
    await click(page,'.fame-shop-launch')
    await page.locator('.absolute-prestige-card').waitFor()
    await expectNoOverflow(page,'fame-'+viewport.width)
    await click(page,'.fame-shop-return')

    await click(page,'.prestige-launch')
    await page.locator('.transcendent-launch').waitFor()
    await click(page,'.transcendent-launch')
    assert.equal(await visible(page,'[data-ultimate-reserve].is-unlocked'),true)
    assert.ok((await page.locator('[data-ultimate-reserve]').innerText()).includes('1,25'))
    await expectNoOverflow(page,'transcendent-'+viewport.width)
    await page.screenshot({path:output+'/transcendent-'+viewport.width+'.png'})
    await click(page,'.ascension-return')
    await click(page,'.ascension-return')
    await click(page,'.bottom-nav button:nth-child(6)')
    await page.locator('.stats-backup').waitFor()
    await click(page,'.backup-reset')
    assert.equal(await visible(page,'.backup-reset-confirm'),true)
    const resetInput=page.locator('#reset-code')
    await resetInput.fill('WRONG')
    assert.equal(await page.locator('.backup-reset-confirm .backup-confirm-danger').isEnabled(),false)
    await click(page,'.backup-reset-confirm button:has-text("Annuler")')
    await expectNoOverflow(page,'stats-'+viewport.width)
    await page.screenshot({path:output+'/stats-'+viewport.width+'.png'})
    console.log('[BROWSER PASS8]',viewport.width+'x'+viewport.height,'all journeys passed')
  }finally{await page.close()}
}
try{
  let live=false
  for(let i=0;i<140;i++){
    if(server.exitCode!==null)throw new Error('Vite server exited: '+serverOutput)
    try{const response=await fetch(BASE);if(response.ok){live=true;break}}catch{}
    await new Promise(resolve=>setTimeout(resolve,200))
  }
  assert.ok(live,'Local Vite server unavailable: '+serverOutput)
  const executable=process.env.CHROME_BIN
  if(executable)assert.ok(existsSync(executable),'CHROME_BIN does not exist')
  browser=await chromium.launch({headless:true,executablePath:executable||undefined,
    args:['--no-sandbox','--disable-dev-shm-usage']})
  for(const viewport of [
    {width:360,height:780},{width:390,height:844},
    {width:768,height:1024},{width:1280,height:800},{width:832,height:384},
  ])await browserScenario(viewport)
  assert.deepEqual(errors,[],'Browser runtime must have no uncaught errors')
  clearTimeout(watchdog)
  console.log('[BROWSER PASS8] all five real Chromium viewports passed')
}finally{
  if(browser)await browser.close()
  // Spawn Vite directly, not via npm (which leaves a grandchild serving the
  // project and keeps the parent's stdout pipe open forever on success).
  server.kill('SIGTERM')
  server.stdout.destroy()
  server.stderr.destroy()
}
