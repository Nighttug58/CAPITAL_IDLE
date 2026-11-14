import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState } from '../capital.ts'
import { createMarketRuntime } from './runtime.ts'

const NOW=1_800_000_000_000

test('Autosauvegarde : échec de stockage ne blanchit pas le dirty flag et déclenche une nouvelle tentative',()=>{
  let state=createCapitalState(undefined,NOW)
  let instant=NOW+1_000
  let attempts=0
  let callback:(()=>void)|null=null
  const runtime=createMarketRuntime({
    getState:()=>state,
    setState:(value)=>{state=value},
    now:()=>instant,
    schedule:(cb)=>{callback=cb;return 1 as ReturnType<typeof setTimeout>},
    cancel:()=>{},
    persist:()=>{attempts++;return attempts>1},
  })
  runtime.start()
  assert.equal(state.trading.dividendLastPaidAt,NOW+1000)
  assert.equal(attempts,1)
  instant=NOW+2000
  const next=callback as (()=>void)|null
  assert.ok(next)
  next()
  assert.equal(state.trading.dividendLastPaidAt,NOW+2000)
  assert.equal(attempts,2,'une écriture précédente ratée est retentée')
  runtime.stop()
})

