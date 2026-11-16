import test from 'node:test'
import assert from 'node:assert/strict'
import {createV8CapitalState,getExactAmount as v} from './exact-state-v8.ts'
import {getExactLevelStartThreshold} from './exact-levels.ts'
import {v8PerformPrestige,previewV8PrestigePoints,v8EligiblePrestigeWorthCents} from './exact-prestige-v8.ts'
import {getAsset} from './trading/catalog.ts'
import {validateExactV8State} from './exact-save-validation.ts'
import {v8CreditIncome} from './exact-runtime-v8.ts'
const now=1_800_000_000_000

test('BigInt prestige preview agrees with V2 formula at known powers',()=>{
 const base=1_000_000_000_000n
 assert.equal(previewV8PrestigePoints(base,150),10n)
 assert.equal(previewV8PrestigePoints(base*100n,150),50n)
 assert.equal(previewV8PrestigePoints(base,99),0n)
 assert.equal(previewV8PrestigePoints(base*10n**200n,150),10n**71n)
})

test('Prestige with 10^120 cash earns exact PP, settles tax and preserves Fame/collections',()=>{
 const initial=createV8CapitalState(now)
 const amount=10n**120n
 const xp=getExactLevelStartThreshold(150)*100n
 const level=150
 const levelsFame=BigInt(level*(level+1)/2)*1_000_000n
 const pre={...initial,
   game:{...initial.game,balance:amount.toString(),lifetimeEarned:amount.toString()},
   prestige:{...initial.prestige,experienceCents:xp.toString(),lastAwardedLevel:level,
     fameMicros:levelsFame.toString(),lifetimeFameMicros:levelsFame.toString(),levelFameMicros:levelsFame.toString()},
   ascension:{...initial.ascension,progress:{...initial.ascension.progress,highestFameAwardedLevel:level}},
   fiscal:{...initial.fiscal,taxesDueCents:'100',dueBySourceCents:{...initial.fiscal.dueBySourceCents,stocks:'100'}},
 }
 assert.equal(v8EligiblePrestigeWorthCents(pre),amount-100n)
 const result=v8PerformPrestige(pre,now)
 assert.equal(result.ok,true)
 if(!result.ok)return
 assert.equal(result.worthCents,amount-100n)
 assert.equal(result.earnedPoints,previewV8PrestigePoints(amount-100n,150))
 assert.equal(v(result.state.ascension.progress.availablePoints),result.earnedPoints)
 assert.equal(v(result.state.ascension.progress.lifetimePoints),result.earnedPoints)
 assert.equal(result.state.ascension.progress.prestigeCount,1)
 assert.equal(result.state.prestige.experienceCents,'0')
 assert.equal(v(result.state.prestige.fameMicros),0n)
 assert.equal(result.state.prestige.cycleEarnedFameMicros,'0')
 assert.equal(result.state.prestige.cycleLevelFameMicros,'0')
 assert.equal(result.state.prestige.cycleCollectionFameMicros,'0')
 assert.equal(result.state.prestige.xpRebaseV4,undefined)
 assert.equal(result.state.game.balance,'0')
 assert.equal(result.state.fiscal.taxesPaidCents,'100')
 assert.equal(result.state.fiscal.taxesDueCents,'0')
 assert.equal(result.state.fiscal.periodStartedAt,now)
 const validation=validateExactV8State(result.state,id=>getAsset(id)?.quantityDecimals??null)
 assert.ok(validation.valid,validation.reason)
 const repeated=v8CreditIncome(result.state,'enterprises',getExactLevelStartThreshold(3)*100n)
 assert.equal(repeated.prestige.lastAwardedLevel,3)
 assert.equal(v(repeated.prestige.fameMicros),5_000_000n)
 assert.equal(repeated.prestige.cycleLevelFameMicros,'5000000')
 const nextCheck=validateExactV8State(repeated,id=>getAsset(id)?.quantityDecimals??null)
 assert.ok(nextCheck.valid,nextCheck.reason)
})

test('migration refunds retired ranks once and prices only new ranks at the new tariff',async()=>{
 const {migratePrestigeShop,prestigeSpent}=await import('./ascension/v2.ts')
 const {v8BuyPrestigeUpgrade}=await import('./exact-runtime-v8.ts')
 const base=createV8CapitalState(now)
 const progress={...base.ascension.progress,shopVersion:undefined,legacyRanks:undefined,
   prestigeCount:1,availablePoints:'100',lifetimePoints:'146',
   upgradeLevels:{...base.ascension.progress.upgradeLevels,'auto-investor':1,'auto-click':3,'news-duration':1}}
 const migrated=migratePrestigeShop({...base,ascension:{...base.ascension,progress}})
 assert.equal(migrated.ascension.progress.availablePoints,'136')
 assert.equal(migratePrestigeShop(migrated),migrated)
 assert.equal(v8BuyPrestigeUpgrade(migrated,'news-duration',1),null)
 const eligible={...migrated,ascension:{...migrated.ascension,progress:{...migrated.ascension.progress,prestigeCount:2}}}
 const purchased=v8BuyPrestigeUpgrade(eligible,'news-duration',1)!
 assert.equal(purchased.ascension.progress.availablePoints,'56')
 assert.equal(prestigeSpent(purchased.ascension.progress.upgradeLevels,purchased.ascension.progress.legacyRanks),90)
})

test('V8 load, reload, export and import refund exactly once at the historical tariff',async()=>{
 const {V8_STORAGE_KEY,loadV8CapitalState,prepareV8SaveImport,exportV8Save}=await import('./exact-persistence-v8.ts')
 const {createCapitalState}=await import('./capital.ts')
 const {performPrestige}=await import('./ascension/engine.ts')
 const {buyAscensionUpgrade}=await import('./ascension/shop.ts')
 const {projectValidatedV7ToExactV8}=await import('./exact-save-v8.ts')
 const {migratePreV2V8Save}=await import('./fame-cycle-v8.ts')
 const reset=performPrestige(createCapitalState({balance:10_000_000_000,lifetimeEarned:10_000_000_000,purchasedUpgrades:0},now),now)
 assert.ok(reset.ok)
 const bot=buyAscensionUpgrade(reset.state,'auto-investor',0)
 assert.ok(bot.ok)
 const retained=buyAscensionUpgrade(bot.state,'crypto-staking',0)
 assert.ok(retained.ok)
 const old=migratePreV2V8Save(projectValidatedV7ToExactV8(retained.state,id=>getAsset(id)?.quantityDecimals??null) as unknown as ReturnType<typeof createV8CapitalState>)
 const data=new Map([[V8_STORAGE_KEY,JSON.stringify(old)]])
 const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)}}
 const first=loadV8CapitalState(storage,now)
 assert.ok(first.ok)
 assert.equal(first.state.ascension.progress.availablePoints,String(retained.state.ascension.progress.availablePoints+30))
 assert.equal(first.state.ascension.progress.upgradeLevels['crypto-staking'],1)
 assert.equal(first.state.ascension.run.automation,undefined)
 const second=loadV8CapitalState(storage,now)
 assert.ok(second.ok)
 assert.deepEqual(second.state,first.state)
 const imported=prepareV8SaveImport(exportV8Save(second.state,now),now)
 assert.ok(imported.ok)
 assert.deepEqual(imported.state,first.state)
})
