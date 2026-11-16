import assert from 'node:assert/strict'
import test from 'node:test'
import { createV8CapitalState, getExactAmount as cents, type V8CapitalState } from './exact-state-v8.ts'
import { dollarAutoClickPriceCents, buyDollarAutoClick, armDollarAutoClick,
  getDollarAutoClickLevel, DOLLAR_AUTOCLICK_MAX_LEVEL } from './dollar-autoclick-v8.ts'
import { v8AutoClickFrame } from './exact-autoclick-frame.ts'
import { createV8MarketRuntime } from './exact-clock-v8.ts'
import { v8PerformPrestige } from './exact-prestige-v8.ts'
import { getExactLevelStartThreshold } from './exact-levels.ts'
import { v8BuyPrestigeUpgrade } from './exact-runtime-v8.ts'
import { validateExactV8State } from './exact-save-validation.ts'
import { getAsset } from './trading/catalog.ts'
import { loadV8CapitalState, saveV8CapitalState, V8_STORAGE_KEY } from './exact-persistence-v8.ts'

const NOW = 1_800_000_000_000
const valid = (s: V8CapitalState) => validateExactV8State(s, id => getAsset(id)?.quantityDecimals ?? null)
const funded = () => {
  const base = createV8CapitalState(NOW)
  const cash = 10n ** 110n
  return { ...base,
    game: { ...base.game, balance: cash.toString(), lifetimeEarned: cash.toString() },
    stats: { ...base.stats, earnedBySource: { ...base.stats.earnedBySource,
      unclassified: cash.toString() } },
  }
}
const storage = () => {
  const data = new Map<string,string>()
  return { data, getItem:(key:string)=>data.get(key)??null,
    setItem:(key:string,value:string)=>{ data.set(key,value) } }
}

function ready(state:V8CapitalState,at:number):V8CapitalState {
  return { ...state, trading: { ...state.trading, dividendLastPaidAt: at, lastTickAt: at },
    enterprises: { ...state.enterprises, lastAccruedAt:at } }
}

test('Dollar Auto Click cost schedule is strictly increasing, capped at rank 20 and exact',()=>{
  assert.equal(dollarAutoClickPriceCents(0),250_000n)
  assert.equal(dollarAutoClickPriceCents(1),1_250_000n)
  assert.equal(dollarAutoClickPriceCents(2),3_515_625n)
  assert.equal(dollarAutoClickPriceCents(19)!>dollarAutoClickPriceCents(18)!,true)
  assert.equal(dollarAutoClickPriceCents(20),null)
  assert.equal(dollarAutoClickPriceCents(-1),null)
  for(let rank=1;rank<DOLLAR_AUTOCLICK_MAX_LEVEL;rank++)
    assert.ok(dollarAutoClickPriceCents(rank)!>dollarAutoClickPriceCents(rank-1)!)
})

test('Dollar Auto Click purchases are cash-only and exact; XP, Fame, PP and click stats do not change',()=>{
  let state = funded()
  const pre=JSON.stringify(state)
  assert.equal(getDollarAutoClickLevel(state),0)
  assert.equal(buyDollarAutoClick(createV8CapitalState(NOW),NOW),null)
  assert.equal(buyDollarAutoClick(state,NOW-1),null)
  const balanceBefore=cents(state.game.balance)
  let spent=0n
  for(let level=0;level<20;level++){
    const cost=dollarAutoClickPriceCents(level)!
    const next=buyDollarAutoClick(state,NOW)
    assert.ok(next)
    assert.equal(next.ascension.run.autoClickLevel,level+1)
    spent+=cost
    state=next
  }
  assert.equal(cents(state.game.balance),balanceBefore-spent)
  assert.equal(state.stats.clickCount,0)
  assert.equal(state.prestige.experienceCents,'0')
  assert.equal(state.prestige.fameMicros,'1000000')
  assert.equal(state.ascension.progress.availablePoints,'0')
  assert.equal(buyDollarAutoClick(state,NOW),null)
  assert.ok(valid(state).valid,valid(state).reason)
  assert.equal(JSON.parse(pre).ascension.run.autoClickLevel,0)
})

test('One real foreground second yields one batch of native XP/Fame/click credit, never a backlog',()=>{
  let state=buyDollarAutoClick(funded(),NOW)!
  assert.ok(state)
  const baseEarned=cents(state.game.lifetimeEarned)
  const quiet=v8AutoClickFrame(ready(state,NOW),NOW,true)
  assert.equal(quiet.stats.clickCount,0)
  const hidden=v8AutoClickFrame(ready(quiet,NOW+1000),NOW+1000,false)
  assert.equal(hidden.stats.clickCount,0)
  const first=v8AutoClickFrame(ready(hidden,NOW+1000),NOW+1000,true)
  assert.equal(first.stats.clickCount,1)
  assert.equal(cents(first.game.lifetimeEarned),baseEarned+100n)
  assert.equal(cents(first.stats.earnedBySource.clicks),100n)
  assert.equal(cents(first.prestige.experienceCents),100n)
  const repeat=v8AutoClickFrame(ready(first,NOW+1000),NOW+1000,true)
  assert.equal(repeat.stats.clickCount,1)
  const offlineGap=v8AutoClickFrame(ready(repeat,NOW+12_000),NOW+12_000,true)
  assert.equal(offlineGap.stats.clickCount,1)
  assert.equal(offlineGap.ascension.run.lastAutomationAtRealMs,NOW+12_000)
  const resumed=v8AutoClickFrame(ready(offlineGap,NOW+13_000),NOW+13_000,true)
  assert.equal(resumed.stats.clickCount,2)
  assert.ok(valid(resumed).valid,valid(resumed).reason)
})

test('At rank 20, exactly twenty clicks per foreground tick; legacy PP Auto Click is never used',()=>{
  let state=funded()
  for(let i=0;i<20;i++)state=buyDollarAutoClick(state,NOW)!
  const withOldPP={...state,ascension:{...state.ascension,progress:{...state.ascension.progress,
    // Separate legacy PP entitlement remains in the ledger for pass 6.
    upgradeLevels:{...state.ascension.progress.upgradeLevels,'auto-click':20},
    lifetimePoints:'210',availablePoints:'0'},run:{...state.ascension.run,
      automation:{...state.ascension.run.automation,autoClickEnabled:true}}}}
  const result=v8AutoClickFrame(ready(withOldPP,NOW+1000),NOW+1000,true)
  assert.equal(result.stats.clickCount,20)
  assert.equal(cents(result.game.lifetimeEarned)-cents(state.game.lifetimeEarned),2000n)
  assert.equal(v8BuyPrestigeUpgrade(withOldPP,'auto-click',20),null)
  const withoutDollars={...withOldPP,ascension:{...withOldPP.ascension,run:{...withOldPP.ascension.run,
    autoClickLevel:0}}}
  const oldOnly=v8AutoClickFrame(ready(withoutDollars,NOW+1000),NOW+1000,true)
  assert.equal(oldOnly.stats.clickCount,0)
})

test('The V8 schema accepts pre-pass-4 saves without Auto Click; new saves persist its rank exactly',()=>{
  const old=funded()
  const {autoClickLevel:_unused,...oldRun}=old.ascension.run
  void _unused
  const oldSave={...old,ascension:{...old.ascension,run:oldRun}}
  const oldJson=JSON.stringify(oldSave)
  assert.ok(valid(oldSave).valid,valid(oldSave).reason)
  assert.equal(getDollarAutoClickLevel(oldSave),0)
  const db=storage()
  db.setItem(V8_STORAGE_KEY,JSON.stringify(oldSave))
  const loaded=loadV8CapitalState(db,NOW)
  assert.equal(loaded.ok,true)
  if(!loaded.ok)return
  const first=buyDollarAutoClick(loaded.state,NOW)!
  assert.ok(valid(first).valid,valid(first).reason)
  assert.equal(saveV8CapitalState(db,first),true)
  const restored=loadV8CapitalState(db,NOW)
  assert.equal(restored.ok,true)
  if(restored.ok)assert.equal(restored.state.ascension.run.autoClickLevel,1)
  assert.equal(JSON.stringify(oldSave),oldJson) // migration never modifies the input fixture
  for (const invalid of [-1,21,1.5,Number.POSITIVE_INFINITY]) {
    const tampered={...first,ascension:{...first.ascension,run:{...first.ascension.run,
      autoClickLevel:invalid}}}
    assert.equal(valid(tampered).valid,false)
    const badDb=storage()
    badDb.setItem(V8_STORAGE_KEY,JSON.stringify(tampered))
    assert.deepEqual(loadV8CapitalState(badDb,NOW),{ok:false,reason:'invalid-v8'})
  }
})

test('Prestige clears dollar Auto Click and PP old ranks remain unchanged for refund',()=>{
  const base=funded()
  const xp=getExactLevelStartThreshold(150)*100n
  const levelFame=11_325_000_000n
  const eligible={...base,prestige:{...base.prestige,experienceCents:xp.toString(),lastAwardedLevel:150,
    fameMicros:levelFame.toString(),lifetimeFameMicros:levelFame.toString(),levelFameMicros:levelFame.toString()},
    ascension:{...base.ascension,progress:{...base.ascension.progress,highestFameAwardedLevel:150}}}
  const owned=buyDollarAutoClick(eligible,NOW)!
  assert.equal(owned.ascension.run.autoClickLevel,1)
  const result=v8PerformPrestige(owned,NOW)
  assert.equal(result.ok,true)
  if(!result.ok)return
  assert.equal(getDollarAutoClickLevel(result.state),0)
  assert.equal(result.state.game.balance,'0')
  assert.equal(result.state.ascension.progress.prestigeCount,1)
  assert.equal(v8BuyPrestigeUpgrade(result.state,'auto-click',0),null)
})

test('Pause and reload rearm the real-second cursor instead of earning offline clicks',()=>{
  let state=buyDollarAutoClick(funded(),NOW)!
  let clock=NOW
  let foreground=true
  let callback:(()=>void)|null=null
  const engine=createV8MarketRuntime({getState:()=>state,setState:next=>{state=next},
    persist:()=>true,isForeground:()=>foreground,now:()=>clock,
    schedule:cb=>{callback=cb;return 1 as unknown as ReturnType<typeof setTimeout>},
    cancel:()=>{callback=null}})
  engine.start()
  assert.equal(state.stats.clickCount,0)
  clock+=1000;callback?.()
  assert.equal(state.stats.clickCount,1)
  foreground=false;engine.pause();clock+=30_000
  foreground=true;engine.resume()
  assert.equal(state.stats.clickCount,1)
  assert.equal(state.ascension.run.lastAutomationAtRealMs,NOW+31_000)
  clock+=1000;callback?.()
  assert.equal(state.stats.clickCount,2)
  engine.stop()
})
