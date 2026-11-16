import test from 'node:test'
import assert from 'node:assert/strict'
import {createV8CapitalState,getExactAmount as v} from './exact-state-v8.ts'
import {getExactLevelStartThreshold} from './exact-levels.ts'
import {v8PerformPrestige,previewV8PrestigePoints,isqrt,v8EligiblePrestigeWorthCents} from './exact-prestige-v8.ts'
import {getAsset} from './trading/catalog.ts'
import {validateExactV8State} from './exact-save-validation.ts'
const now=1_800_000_000_000

test('BigInt prestige preview agrees with exact old formula at known powers',()=>{
 assert.equal(isqrt(0n),0n)
 assert.equal(isqrt(10n**100n),10n**50n)
 const base=10_000_000_000n
 assert.equal(previewV8PrestigePoints(base,100),20n)
 assert.equal(previewV8PrestigePoints(base*100n,100),200n)
 assert.equal(previewV8PrestigePoints(base,99),0n)
 assert.equal(previewV8PrestigePoints(base*10n**200n,100),20n*10n**100n)
})

test('Prestige with 10^120 cash earns exact PP, settles tax and preserves Fame/collections',()=>{
 const initial=createV8CapitalState(now)
 const amount=10n**120n
 const xp=getExactLevelStartThreshold(100)*100n
 const level=100
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
 assert.equal(result.earnedPoints,previewV8PrestigePoints(amount-100n,100))
 assert.equal(v(result.state.ascension.progress.availablePoints),result.earnedPoints)
 assert.equal(v(result.state.ascension.progress.lifetimePoints),result.earnedPoints)
 assert.equal(result.state.ascension.progress.prestigeCount,1)
 assert.equal(result.state.prestige.experienceCents,'0')
 assert.equal(v(result.state.prestige.fameMicros),levelsFame)
 assert.equal(result.state.game.balance,'0')
 assert.equal(result.state.fiscal.taxesPaidCents,'100')
 assert.equal(result.state.fiscal.taxesDueCents,'0')
 assert.equal(result.state.fiscal.periodStartedAt,now)
 const validation=validateExactV8State(result.state,id=>getAsset(id)?.quantityDecimals??null)
 assert.ok(validation.valid,validation.reason)
})
