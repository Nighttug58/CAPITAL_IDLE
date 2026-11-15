import assert from 'node:assert/strict'
import test from 'node:test'
import { createCapitalState } from '../capital.ts'
import {
  ASCENSION_MIN_LEVEL, ASCENSION_MIN_WORTH_USD, ASCENSION_POINT_BASE,
  ASCENSION_SHOP_EXPECTED_LEVELS, ASCENSION_SHOP_EXPECTED_TOTAL_PP,
  previewPrestigePoints,
} from './contracts.ts'
import { ASCENSION_UPGRADES, ASCENSION_TOTAL_LEVELS, ASCENSION_TOTAL_COST,
  ascensionSpentPoints, nextAscensionCost } from './catalog.ts'
import { FAME_BOOST_IDS, MAX_FAME_BOOST_LEVEL } from '../prestige/catalog.ts'
import { getAbsolutePrestigeStatus } from '../prestige/absolute.ts'
import { getBonusBreakdown } from '../prestige/bonuses.ts'

const NOW=1_800_000_000_000

test('Calibrage Prestige : 18 améliorations, 87 niveaux et 1 637 PP de dépense exacte', () => {
  assert.equal(ASCENSION_UPGRADES.length,18)
  assert.equal(ASCENSION_TOTAL_LEVELS,ASCENSION_SHOP_EXPECTED_LEVELS)
  assert.equal(ASCENSION_TOTAL_COST,ASCENSION_SHOP_EXPECTED_TOTAL_PP)
  const full = Object.fromEntries(ASCENSION_UPGRADES.map(item => [item.id,item.maxLevel]))
  assert.equal(ascensionSpentPoints(full),ASCENSION_TOTAL_COST)
  for(const row of ASCENSION_UPGRADES) {
    assert.equal(nextAscensionCost(row.id,row.maxLevel),null)
    assert.equal(nextAscensionCost(row.id,0),row.firstCost)
    assert.equal(row.totalCost,row.maxLevel*row.firstCost+
      row.stepCost*row.maxLevel*(row.maxLevel-1)/2)
  }
})

test('Modèle PP sur 20–30 cycles : 1 Md$ débloque le catalogue en 26 cycles',()=>{
  assert.equal(ASCENSION_MIN_WORTH_USD,100_000_000)
  assert.equal(ASCENSION_MIN_LEVEL,100)
  assert.equal(ASCENSION_POINT_BASE,20)
  const wealth=[100_000_000,500_000_000,1_000_000_000,2_000_000_000,10_000_000_000]
  const expected=[20,44,63,89,200]
  const cycles=[82,38,26,19,9]
  for(let i=0;i<wealth.length;i++) {
    const pp=previewPrestigePoints(wealth[i]!,ASCENSION_MIN_LEVEL)
    assert.equal(pp,expected[i])
    assert.equal(Math.ceil(ASCENSION_TOTAL_COST/pp),cycles[i])
  }
  assert.equal(previewPrestigePoints(1_000_000_000,99),0)
  assert.equal(previewPrestigePoints(ASCENSION_MIN_WORTH_USD-1,100),0)
  assert.ok(25*63<1637 && 26*63>=1637)
  // Counts assume constant eligible worth and exclude the real-time effort
  // to level 100. This is an analytic PP model, not a gameplay simulation.
})

test('Prestige absolu (Fame) : bonus compose les boosts achetés, pas les collections',()=>{
  const base=createCapitalState(undefined,NOW)
  const initial=getAbsolutePrestigeStatus(base)
  assert.equal(initial.unlocked,false)
  assert.equal(initial.factor,1)
  const boosts=Object.fromEntries(FAME_BOOST_IDS.map(id=>[id,MAX_FAME_BOOST_LEVEL])) as typeof base.prestige.boosts
  const prestige={...base.prestige, boosts, fameMicros:100_000_000}
  const status=getAbsolutePrestigeStatus({prestige})
  assert.equal(status.unlocked,true)
  assert.equal(status.fameSteps,1)
  assert.equal(status.factor,1.01)
  const breakdown=getBonusBreakdown({prestige},'click')
  assert.ok(breakdown.shopBps>0)
  assert.equal(breakdown.totalBps,breakdown.shopBps*status.factor+breakdown.collectionBps)
  assert.equal(breakdown.collectionBps,0)
})

test('Extrêmes Fame : facteur sécurisé à ×100 même avec une Fame gigantesque',()=>{
  const state=createCapitalState(undefined,NOW)
  const boosts=Object.fromEntries(FAME_BOOST_IDS.map(id=>[id,MAX_FAME_BOOST_LEVEL])) as typeof state.prestige.boosts
  const prestige={...state.prestige,boosts,fameMicros:9_000_000_000_000_000}
  const status=getAbsolutePrestigeStatus({prestige})
  assert.equal(status.unlocked,true)
  assert.equal(status.capped,true)
  assert.equal(status.factor,100)
  assert.equal(Number.isFinite(status.factor),true)
  const bonus=getBonusBreakdown({prestige},'click')
  assert.equal(bonus.shopBps,10_000)
  assert.equal(bonus.totalBps,1_000_000)
})
