import test from 'node:test'
import assert from 'node:assert/strict'
import { createV8CapitalState } from '../exact-state-v8.ts'
import { createCapitalState } from '../capital.ts'
import { getAbsolutePrestigeStatus } from './absolute.ts'
import { FAME_FACTOR_SCALE, exactAbsoluteFameStatus, v8AbsoluteFameStatus,
  fameStepFactorUnits, formatFameFactor, formatExactBasisPoints } from './absolute-v8.ts'
import { v8ExactRewardRate, v8ScaleRewardUnits } from './exact-bonuses-v8.ts'

const AT = 1_800_000_000_000
const maxShop = () => ({ click:20,enterprise:20,dividend:20,xp:20,trading:20,fame:20 })
function exactCycle(cycle:bigint,fameMicros:bigint,unlocked=true) {
  return exactAbsoluteFameStatus(unlocked ? maxShop() : {...maxShop(),fame:19},fameMicros,cycle)
}
test('Ascension Fame cap is exactly 100 + completed Prestige cycles (0,1,2,100,1000)',()=>{
  const highFame=100_000_000n*100_000n
  for(const [cycles,expected] of [[0n,100n],[1n,101n],[2n,102n],[100n,200n],[1_000n,1_100n]] as const) {
    const status=exactCycle(cycles,highFame)
    assert.equal(status.unlocked,true)
    assert.equal(status.capUnits,expected*FAME_FACTOR_SCALE)
    assert.equal(status.factorUnits,status.capUnits)
    assert.equal(status.capped,true)
  }
  const v7=createCapitalState(undefined,AT)
  const original=getAbsolutePrestigeStatus({...v7,prestige:{...v7.prestige, boosts:maxShop(),
    fameMicros:100_000*100_000_000}})
  assert.equal(original.factor,100)
})
test('Fame steps depend on available Fame only; shop not completed gives ×1; after reset 0 Fame gives ×1',()=>{
  const empty=exactCycle(1_000n,0n)
  assert.equal(empty.factorUnits,FAME_FACTOR_SCALE)
  assert.equal(empty.fameSteps,0n)
  assert.equal(empty.nextStepAtFameMicros,100_000_000n)
  const before=exactCycle(2n,99_999_999n)
  assert.equal(before.factorUnits,FAME_FACTOR_SCALE)
  const at100=exactCycle(2n,100_000_000n)
  assert.equal(at100.factorUnits,FAME_FACTOR_SCALE*101n/100n)
  assert.equal(at100.nextStepAtFameMicros,200_000_000n)
  assert.equal(exactCycle(2n,10n**30n,false).factorUnits,FAME_FACTOR_SCALE)
  assert.equal(formatFameFactor(at100.factorUnits),'1.01')
  assert.equal(formatExactBasisPoints(500n*at100.factorUnits,FAME_FACTOR_SCALE),'5.05 %')
})
test('Fame exponent and huge cycles use capped logarithmic BigInt, no Infinity or Number overflow',()=>{
  const huge=10n**100n
  const status=exactCycle(huge,huge*10n**15n)
  assert.equal(status.capUnits,(100n+huge)*FAME_FACTOR_SCALE)
  assert.equal(status.factorUnits,status.capUnits)
  assert.equal(status.capped,true)
  assert.ok(formatFameFactor(status.factorUnits).includes(''))
  assert.equal(fameStepFactorUnits(10n**25n, 100n),100n*FAME_FACTOR_SCALE)
  const state=createV8CapitalState(AT)
  const progress={...state.ascension.progress,prestigeCount:Number.MAX_SAFE_INTEGER,
    prestigeCountExact:huge.toString()}
  const active={...state,prestige:{...state.prestige,
    boosts:maxShop(),fameMicros:(huge*10n**15n).toString()},
    ascension:{...state.ascension,progress}}
  const exact=v8AbsoluteFameStatus(active)
  assert.equal(exact.factorUnits,exact.capUnits)
  const rate=v8ExactRewardRate(active,'xp')
  const paid=v8ScaleRewardUnits(10n**100n,rate)
  assert.ok(paid>10n**100n)
  assert.ok(!String(paid).includes('Infinity'))
})
test('Fame multiplier is applied to Shop alone, not collections or museum',()=>{
  const state=createV8CapitalState(AT)
  const earned={...state,prestige:{...state.prestige,boosts:maxShop(),fameMicros:'100000000'}}
  const rate=v8ExactRewardRate(earned,'click',false)
  const baseline=10_000n*FAME_FACTOR_SCALE + 10_000n*101n*FAME_FACTOR_SCALE/100n
  assert.equal(rate.numerator,baseline)
  assert.equal(rate.denominator,10_000n*FAME_FACTOR_SCALE)
  assert.equal(v8ScaleRewardUnits(100_000n,rate),201_000n)
})
