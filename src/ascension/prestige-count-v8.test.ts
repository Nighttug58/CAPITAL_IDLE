import test from 'node:test'
import assert from 'node:assert/strict'
import { createV8CapitalState } from '../exact-state-v8.ts'
import { v8CreditIncome } from '../exact-runtime-v8.ts'
import { v8PerformPrestige } from '../exact-prestige-v8.ts'
import { MAX_SAFE_CYCLE, nextPrestigeCycle, prestigeCycleCount } from './prestige-count-v8.ts'
import { v8AbsoluteFameStatus } from '../prestige/absolute-v8.ts'
import { validateExactV8State } from '../exact-save-validation.ts'
import { exportV8Save, prepareV8SaveImport } from '../exact-persistence-v8.ts'
import { getAsset } from '../trading/catalog.ts'

const AT=1_800_000_000_000
const decimals=(id:string)=>getAsset(id)?.quantityDecimals??null
const valid=(state:unknown)=>{
  const check=validateExactV8State(state,decimals)
  assert.equal(check.valid,true,check.reason)
}
function cycle() {
  const fresh=createV8CapitalState(AT)
  const earned=v8CreditIncome(fresh,'clicks',10n**40n)
  const transitioned=v8PerformPrestige(earned,AT)
  assert.equal(transitioned.ok,true)
  if (!transitioned.ok) throw Error(transitioned.reason)
  return transitioned.state
}
test('Legacy V8 safe-cycle receipts stay byte-equivalent, and migration remains optional',()=>{
  const source=cycle()
  const progress=source.ascension.progress
  assert.equal(progress.prestigeCount,1)
  assert.equal(progress.prestigeCountExact,undefined)
  assert.equal(progress.history[0]!.cycle,1)
  assert.equal(progress.history[0]!.cycleExact,undefined)
  valid(source)
  const exportText=exportV8Save(source,AT)
  const loaded=prepareV8SaveImport(exportText,AT)
  assert.ok(loaded.ok)
  if(loaded.ok)assert.deepEqual(loaded.state,source)
})
test('At Number.MAX_SAFE_INTEGER V8 keeps a numeric projection and advances an exact receipt cycle',()=>{
  const source=cycle()
  const last=source.ascension.progress.history[0]!
  const p=source.ascension.progress
  const near={...source,ascension:{...source.ascension,progress:{...p,
    prestigeCount:Number.MAX_SAFE_INTEGER,history:[{...last,cycle:Number.MAX_SAFE_INTEGER}],
  }}}
  valid(near)
  assert.equal(prestigeCycleCount(near.ascension.progress),MAX_SAFE_CYCLE)
  const result=v8PerformPrestige(v8CreditIncome(near,'clicks',10n**40n),AT)
  assert.ok(result.ok)
  if(!result.ok)return
  const actual=result.state
  assert.equal(actual.ascension.progress.prestigeCount,Number.MAX_SAFE_INTEGER)
  assert.equal(actual.ascension.progress.prestigeCountExact,(MAX_SAFE_CYCLE+1n).toString())
  assert.equal(result.cycle,Number.MAX_SAFE_INTEGER,'legacy UI remains safe')
  const history=actual.ascension.progress.history
  assert.equal(history[0]!.cycleExact,undefined)
  assert.equal(history[1]!.cycleExact,(MAX_SAFE_CYCLE+1n).toString())
  valid(actual)
  const exported=exportV8Save(actual,AT)
  const imported=prepareV8SaveImport(exported,AT)
  assert.ok(imported.ok)
  if(imported.ok) assert.deepEqual(imported.state,actual)
  const next=v8PerformPrestige(v8CreditIncome(actual,'clicks',10n**40n),AT)
  assert.ok(next.ok)
  if(next.ok){
    assert.equal(next.state.ascension.progress.prestigeCountExact,(MAX_SAFE_CYCLE+2n).toString())
    valid(next.state)
  }
})
test('Unbounded exact cycle counter, 100-slot historical window and tamper rejection',()=>{
  const one=cycle()
  const huge=10n**100n
  const receipt=one.ascension.progress.history[0]!
  const state={...one,ascension:{...one.ascension,progress:{
    ...one.ascension.progress,prestigeCount:Number.MAX_SAFE_INTEGER,prestigeCountExact:huge.toString(),
    history:[{...receipt,cycle:Number.MAX_SAFE_INTEGER,cycleExact:huge.toString()}],
  }}}
  valid(state)
  assert.equal(prestigeCycleCount(state.ascension.progress),huge)
  const changed=v8PerformPrestige(v8CreditIncome(state,'clicks',10n**40n),AT)
  assert.ok(changed.ok)
  if(!changed.ok)return
  assert.equal(changed.state.ascension.progress.prestigeCountExact,(huge+1n).toString())
  valid(changed.state)
  const history=changed.state.ascension.progress.history
  const tampered=JSON.parse(exportV8Save(changed.state,AT))
  tampered.state.ascension.progress.history.at(-1).cycleExact=(huge+2n).toString()
  assert.equal(prepareV8SaveImport(JSON.stringify(tampered),AT).ok,false)
  const counter=JSON.parse(exportV8Save(changed.state,AT))
  counter.state.ascension.progress.prestigeCountExact=(huge+2n).toString()
  assert.equal(prepareV8SaveImport(JSON.stringify(counter),AT).ok,false)
  const badNumber=JSON.parse(exportV8Save(changed.state,AT))
  badNumber.state.ascension.progress.prestigeCount=100
  assert.equal(prepareV8SaveImport(JSON.stringify(badNumber),AT).ok,false)
  const badExact=JSON.parse(exportV8Save(changed.state,AT))
  badExact.state.ascension.progress.prestigeCountExact='00012'
  assert.equal(prepareV8SaveImport(JSON.stringify(badExact),AT).ok,false)
  assert.equal(history.length,2)
})
test('Count helper is constant-space even far beyond the Number safe bound',()=>{
  assert.deepEqual(nextPrestigeCycle({prestigeCount:0}),{
    prestigeCount:1,cycleExact:1n,
  })
  const huge=10n**120n
  const next=nextPrestigeCycle({prestigeCount:Number.MAX_SAFE_INTEGER,prestigeCountExact:huge.toString()})
  assert.equal(next.prestigeCount,Number.MAX_SAFE_INTEGER)
  assert.equal(next.prestigeCountExact,(huge+1n).toString())
  assert.equal(prestigeCycleCount(next),huge+1n)
})
