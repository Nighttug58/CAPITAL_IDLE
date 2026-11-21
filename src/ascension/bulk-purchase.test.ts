import assert from 'node:assert/strict'
import test from 'node:test'
import {createV8CapitalState, getExactAmount} from '../exact-state-v8.ts'
import {v8BuyPrestigeUpgrade, v8BuyPrestigeUpgradeMax} from '../exact-runtime-v8.ts'
import {
  v8BuyTranscendent, v8BuyTranscendentMax, transcendentSpentThrough,
  TRANSCENDENT_MAX_LEVEL,
} from './transcendent-v1.ts'

const ready=(wallet:bigint,cycles=3)=>{
  const state=createV8CapitalState(1_800_000_000_000)
  return {...state,ascension:{...state.ascension,progress:{
    ...state.ascension.progress,shopVersion:2,prestigeCount:cycles,
    availablePoints:wallet.toString(),
  }}}
}

test('MAX Prestige achète tous les rangs finançables en un seul état',()=>{
  const initial=ready(100n)
  const bought=v8BuyPrestigeUpgradeMax(initial,'news-frequency',0)
  assert.ok(bought)
  assert.equal(bought.ascension.progress.upgradeLevels['news-frequency'],2)
  assert.equal(getExactAmount(bought.ascension.progress.availablePoints),38n)
  assert.equal(initial.ascension.progress.upgradeLevels['news-frequency'],0)
  assert.equal(v8BuyPrestigeUpgradeMax(initial,'news-frequency',1),null)
  let iterative=initial
  for(let rank=0;rank<60;rank++){
    const next=v8BuyPrestigeUpgrade(iterative,'news-frequency',rank)
    assert.ok(next)
    iterative=next
  }
  assert.deepEqual(bought,iterative)
})

test('MAX Prestige respecte le niveau maximal et les portes de cycles',()=>{
  const max=v8BuyPrestigeUpgradeMax(ready(1_000_000n),'news-frequency',0)
  assert.ok(max)
  assert.equal(max.ascension.progress.upgradeLevels['news-frequency'],10)
  assert.equal(v8BuyPrestigeUpgradeMax(max,'news-frequency',10),null)
  assert.equal(v8BuyPrestigeUpgradeMax(ready(1_000_000n,1),'time-accelerator',0),null)
  assert.equal(max.game.balance,ready(1_000_000n).game.balance)
})

test('MAX Transcendant calcule les coûts progressifs BigInt exacts',()=>{
  const initial=ready(2_800n)
  const bought=v8BuyTranscendentMax(initial,'empire',0)
  assert.ok(bought)
  assert.equal(bought.ascension.progress.transcendentV1?.levels.empire,60)
  assert.equal(getExactAmount(bought.ascension.progress.availablePoints),51n)
  assert.equal(initial.ascension.progress.transcendentV1?.levels.empire,0)
  assert.equal(v8BuyTranscendentMax(initial,'empire',1),null)
  let iterative=initial
  for(let rank=0;rank<2;rank++){
    const next=v8BuyTranscendent(iterative,'empire',rank)
    assert.ok(next)
    iterative=next
  }
  assert.deepEqual(bought,iterative)
})

test('MAX Transcendant respecte 100 niveaux, les 10 branches et les verrous',()=>{
  const initial=ready(10n**20n)
  const bought=v8BuyTranscendentMax(initial,'news-power',0)
  assert.ok(bought)
  assert.equal(bought.ascension.progress.transcendentV1?.levels['news-power'],TRANSCENDENT_MAX_LEVEL)
  assert.equal(getExactAmount(bought.ascension.progress.availablePoints),
    10n**20n-transcendentSpentThrough(TRANSCENDENT_MAX_LEVEL)!)
  assert.equal(v8BuyTranscendentMax(bought,'news-power',TRANSCENDENT_MAX_LEVEL),null)
  assert.equal(v8BuyTranscendentMax(ready(10n**20n,2),'heritage',0),null)
  assert.equal(bought.game.balance,initial.game.balance)
  assert.equal(bought.prestige.fameMicros,initial.prestige.fameMicros)
})
