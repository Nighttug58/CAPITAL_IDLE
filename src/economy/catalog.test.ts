import assert from 'node:assert/strict'
import test from 'node:test'
import { LEVEL_THRESHOLDS, getLevel } from '../game.ts'
import {
  ENTERPRISES, ENTERPRISE_CATEGORIES, ENTERPRISE_MILESTONES,
  getEnterprise, getEnterprisePurchaseCostCents,
  getEnterpriseUpgradeCostCents, getEnterpriseUpgradeCostCentsExact,
  getEnterpriseIncomeMicrosPerSecond, getEnterpriseIncomeMicrosPerSecondExact,
  getEnterpriseMilestone, getNextEnterpriseMilestone, isEnterpriseUnlocked,
} from './catalog.ts'

test('20 entreprises uniques, cinq catégories et acquisitions historiques conservées', () => {
  assert.equal(ENTERPRISES.length, 20)
  assert.equal(new Set(ENTERPRISES.map(e => e.id)).size, 20)
  assert.deepEqual(ENTERPRISES.reduce((counts, e) => ({ ...counts, [e.category]: (counts[e.category] ?? 0) + 1 }), {} as Record<string, number>),
    { small: 4, local: 4, services: 4, industry: 4, major: 4 })
  const expectedDollars = [75_000,180_000,300_000,420_000,600_000,800_000,1_200_000,1_800_000,
    2_500_000,8_000_000,16_000_000,35_000_000,80_000_000,220_000_000,500_000_000,
    1_200_000_000,3_000_000_000,20_000_000_000,85_000_000_000,300_000_000_000]
  assert.deepEqual(ENTERPRISES.map(e => e.purchaseCostCents / 100), expectedDollars)
  assert.ok(Object.isFrozen(ENTERPRISES))
  for (const [index, e] of ENTERPRISES.entries()) {
    assert.ok(Object.isFrozen(e))
    assert.match(e.id, /^[a-z0-9-]{1,48}$/)
    assert.ok(e.category in ENTERPRISE_CATEGORIES)
    assert.equal(getEnterprise(e.id), e)
    assert.equal(getEnterprisePurchaseCostCents(e.id), e.purchaseCostCents)
    assert.equal('upgradeCostsCents' in e, false, 'no level-precomputed tables')
    assert.equal('incomesMicrosPerSecond' in e, false)
    assert.ok(e.requiredPlayerLevel >= 3 && e.requiredPlayerLevel <= 50)
    if (index) assert.ok(e.requiredPlayerLevel > ENTERPRISES[index-1]!.requiredPlayerLevel)
    assert.equal(isEnterpriseUnlocked(e.id, e.requiredPlayerLevel - 1), false)
    assert.equal(isEnterpriseUnlocked(e.id, e.requiredPlayerLevel), true)
    assert.equal(getLevel(LEVEL_THRESHOLDS[e.requiredPlayerLevel-1]!), e.requiredPlayerLevel)
  }
  assert.equal(getEnterprise('invalid'), undefined)
  assert.equal(getEnterprisePurchaseCostCents('invalid'), null)
})

test('retour brut en minutes selon les cinq catégories, sans changer les prix', () => {
  const windows = { small: [10,20], local: [20,35], services: [35,60], industry: [60,120], major: [120,240] }
  for (const e of ENTERPRISES) {
    const [min,max] = windows[e.category]
    const rate = getEnterpriseIncomeMicrosPerSecondExact(e.id,1)!
    const paybackMinutes = e.purchaseCostCents * 10_000 / Number(rate) / 60
    assert.ok(paybackMinutes >= min - .01 && paybackMinutes <= max + .01,
      `${e.id}: ${paybackMinutes} minutes is outside ${min}–${max}`)
    assert.ok(Math.abs(paybackMinutes-e.targetPaybackHours*60) < 0.02)
  }
})

test('niveaux 1 à 20 : prix et augmentations historiques, quatre milestones conservés', () => {
  assert.deepEqual(ENTERPRISE_MILESTONES.map(m => [m.level,m.bonusBps]),
    [[5,2000],[10,2500],[15,3000],[20,4000]])
  for (const e of ENTERPRISES) {
    let income = e.baseIncomeMicrosPerSecond
    let previousCost = 0
    for (let level=1;level<=20;level++) {
      if (level > 1) {
        income = Math.round(income * 1.12 * (1 + (getEnterpriseMilestone(level)?.bonusBps ?? 0)/10_000))
      }
      assert.equal(getEnterpriseIncomeMicrosPerSecondExact(e.id,level),BigInt(income))
      assert.equal(getEnterpriseIncomeMicrosPerSecond(e.id,level),income)
      const cost = getEnterpriseUpgradeCostCentsExact(e.id,level)!
      assert.ok(cost > BigInt(previousCost))
      assert.equal(getEnterpriseUpgradeCostCents(e.id,level),Number(cost))
      previousCost = Number(cost)
    }
    assert.ok(income > e.baseIncomeMicrosPerSecond * 20)
  }
  assert.equal(getEnterpriseMilestone(21),null)
  assert.equal(getEnterpriseMilestone(25)?.bonusBps,1000)
  assert.equal(getEnterpriseMilestone(50)?.bonusBps,1000)
  assert.equal(getNextEnterpriseMilestone(20)?.level,25)
  assert.equal(getNextEnterpriseMilestone(75)?.level,100)
})

test('niveaux 21, 100, 1000 et 10^12 : tarifs et revenus BigInt croissants en temps borné', () => {
  for (const e of ENTERPRISES) {
    let lastPrice = 0n, lastIncome = 0n
    const before = performance.now()
    for (const level of [1,5,10,19,20,21,25,50,100,1000,1_000_000,1_000_000_000_000]) {
      const income = getEnterpriseIncomeMicrosPerSecondExact(e.id,level)!
      const price = getEnterpriseUpgradeCostCentsExact(e.id,level)!
      assert.ok(income > lastIncome, `${e.id} income at ${level}`)
      assert.ok(price > lastPrice, `${e.id} cost at ${level}`)
      lastIncome = income;lastPrice = price
    }
    assert.ok(performance.now()-before < 1000, 'level computation must not loop through all levels')
    assert.ok(getEnterpriseIncomeMicrosPerSecondExact(e.id,1000)! > BigInt(Number.MAX_SAFE_INTEGER) ||
      getEnterpriseIncomeMicrosPerSecondExact(e.id,1_000_000_000_000)! > BigInt(Number.MAX_SAFE_INTEGER))
  }
})

test('invalid levels and unknown companies reject without fabricating money', () => {
  for (const level of [0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1]) {
    assert.equal(getEnterpriseUpgradeCostCentsExact('kiosque',level),null)
    assert.equal(getEnterpriseIncomeMicrosPerSecondExact('kiosque',level),null)
  }
  assert.equal(getEnterpriseUpgradeCostCentsExact('kiosque',Number.MAX_SAFE_INTEGER),null)
  assert.equal(getEnterpriseUpgradeCostCentsExact('unknown',1),null)
  assert.equal(getEnterpriseIncomeMicrosPerSecondExact('unknown',1),null)
  assert.equal(isEnterpriseUnlocked('unknown',200),false)
  assert.equal(isEnterpriseUnlocked('kiosque',Number.NaN),false)
})
