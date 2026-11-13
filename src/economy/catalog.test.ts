import assert from 'node:assert/strict'
import test from 'node:test'
import { LEVEL_THRESHOLDS, getLevel } from '../game.ts'
import { MAX_ENTERPRISE_LEVEL } from './state.ts'
import {
  ENTERPRISES, ENTERPRISE_CATEGORIES, ENTERPRISE_MILESTONES,
  getEnterprise, getEnterprisePurchaseCostCents, getEnterpriseUpgradeCostCents,
  getEnterpriseIncomeMicrosPerSecond, getEnterpriseMilestone, isEnterpriseUnlocked,
} from './catalog.ts'

test('catalogue : exactement 20 entreprises uniques, réparties 4 par palier', () => {
  assert.equal(ENTERPRISES.length, 20)
  assert.equal(new Set(ENTERPRISES.map((e) => e.id)).size, 20)
  assert.deepEqual(
    ENTERPRISES.reduce((counts, e) => ({ ...counts, [e.category]: (counts[e.category] ?? 0) + 1 }), {} as Record<string, number>),
    { small: 4, local: 4, services: 4, industry: 4, major: 4 },
  )
  for (const item of ENTERPRISES) {
    assert.match(item.id, /^[a-z0-9-]{1,48}$/)
    assert.ok(item.name.trim().length > 0)
    assert.ok(item.category in ENTERPRISE_CATEGORIES)
    assert.strictEqual(getEnterprise(item.id), item)
    assert.equal(getEnterprisePurchaseCostCents(item.id), item.purchaseCostCents)
    assert.equal('franchises' in item, false)
    assert.equal('resalePrice' in item, false)
  }
  assert.equal(getEnterprise('not-an-enterprise'), undefined)
  assert.equal(getEnterprisePurchaseCostCents('not-an-enterprise'), null)
})

test('déblocages : niveaux joueur croissants, de 3 à 50, sans dépasser le plafond', () => {
  assert.equal(LEVEL_THRESHOLDS.length, 50)
  assert.equal(ENTERPRISES[0]!.id, 'kiosque')
  assert.equal(ENTERPRISES[0]!.requiredPlayerLevel, 3)
  assert.equal(ENTERPRISES[19]!.requiredPlayerLevel, 50)
  ENTERPRISES.forEach((e, index) => {
    assert.ok(Number.isSafeInteger(e.requiredPlayerLevel) && e.requiredPlayerLevel >= 3 && e.requiredPlayerLevel <= 50)
    if (index) assert.ok(e.requiredPlayerLevel > ENTERPRISES[index - 1]!.requiredPlayerLevel)
    assert.equal(isEnterpriseUnlocked(e.id, e.requiredPlayerLevel - 1), false)
    assert.equal(isEnterpriseUnlocked(e.id, e.requiredPlayerLevel), true)
    assert.equal(isEnterpriseUnlocked(e.id, 50), true)
    assert.equal(isEnterpriseUnlocked(e.id, 51), false)
    assert.equal(isEnterpriseUnlocked(e.id, Number.NaN), false)
    const xpAtUnlock = LEVEL_THRESHOLDS[e.requiredPlayerLevel - 1]!
    assert.equal(getLevel(xpAtUnlock), e.requiredPlayerLevel)
  })
  assert.equal(isEnterpriseUnlocked('bogus', 50), false)
})

test('niveaux 1-20 : 19 coûts croissants et 20 revenus fixes croissants', () => {
  for (const e of ENTERPRISES) {
    assert.equal(e.upgradeCostsCents.length, MAX_ENTERPRISE_LEVEL - 1)
    assert.equal(e.incomesMicrosPerSecond.length, MAX_ENTERPRISE_LEVEL)
    assert.equal(e.incomesMicrosPerSecond[0], e.baseIncomeMicrosPerSecond)
    assert.equal(getEnterpriseIncomeMicrosPerSecond(e.id, 1), e.baseIncomeMicrosPerSecond)
    for (let level = 1; level <= MAX_ENTERPRISE_LEVEL; level++) {
      const income = getEnterpriseIncomeMicrosPerSecond(e.id, level)
      assert.equal(income, e.incomesMicrosPerSecond[level - 1])
      assert.ok(Number.isSafeInteger(income) && income > 0)
      if (level > 1) {
        assert.ok(income > e.incomesMicrosPerSecond[level - 2]!, e.id + ': income must rise at level ' + level)
      }
      if (level < MAX_ENTERPRISE_LEVEL) {
        const cost = getEnterpriseUpgradeCostCents(e.id, level)
        assert.equal(cost, e.upgradeCostsCents[level - 1])
        assert.ok(Number.isSafeInteger(cost) && cost > 0)
        if (level > 1) assert.ok(cost > e.upgradeCostsCents[level - 2]!)
      }
    }
    assert.equal(getEnterpriseUpgradeCostCents(e.id, 20), null)
    assert.equal(getEnterpriseUpgradeCostCents(e.id, 21), null)
    assert.equal(getEnterpriseUpgradeCostCents(e.id, 0), null)
    assert.equal(getEnterpriseUpgradeCostCents(e.id, 1.5), null)
    assert.equal(getEnterpriseIncomeMicrosPerSecond(e.id, 0), null)
    assert.equal(getEnterpriseIncomeMicrosPerSecond(e.id, 21), null)
    assert.equal(getEnterpriseIncomeMicrosPerSecond(e.id, Number.POSITIVE_INFINITY), null)
  }
  assert.equal(getEnterpriseUpgradeCostCents('bogus', 1), null)
  assert.equal(getEnterpriseIncomeMicrosPerSecond('bogus', 1), null)
})

test('bonus spéciaux exactement aux niveaux 5/10/15/20, cumulés et sans retomber', () => {
  assert.deepEqual(ENTERPRISE_MILESTONES.map((m) => m.level), [5, 10, 15, 20])
  assert.deepEqual(ENTERPRISE_MILESTONES.map((m) => m.bonusBps), [2_000, 2_500, 3_000, 4_000])
  for (let level = 1; level <= 20; level++) {
    const milestone = getEnterpriseMilestone(level)
    if ([5, 10, 15, 20].includes(level)) {
      assert.ok(milestone && milestone.bonusBps > 0)
      assert.equal(milestone?.level, level)
    } else assert.equal(milestone, null)
  }
  for (const e of ENTERPRISES) {
    for (let level = 2; level <= 20; level++) {
      const previous = e.incomesMicrosPerSecond[level - 2]!
      const expected = Math.round(previous * 1.12 * (1 + (getEnterpriseMilestone(level)?.bonusBps ?? 0) / 10000))
      assert.equal(e.incomesMicrosPerSecond[level - 1], expected, e.id + ' level ' + level)
    }
    assert.ok(e.incomesMicrosPerSecond[19]! > e.baseIncomeMicrosPerSecond * 20)
  }
  assert.equal(getEnterpriseMilestone(21), null)
})

test('rentabilité calibrée : premier achat ~8-64 h ; investissements de niveau 20 non gratuits', () => {
  let previousPrice = 0
  let previousIncome = 0
  for (const e of ENTERPRISES) {
    assert.ok(e.purchaseCostCents > previousPrice, e.id + ' purchase costs increase')
    assert.ok(e.baseIncomeMicrosPerSecond > previousIncome, e.id + ' income increases')
    previousPrice = e.purchaseCostCents
    previousIncome = e.baseIncomeMicrosPerSecond

    const actualHours = e.purchaseCostCents / 100 /
      (e.baseIncomeMicrosPerSecond / 1_000_000) / 3600
    assert.ok(Math.abs(actualHours - e.targetPaybackHours) < 0.01, e.id + ': payback hours drift')
    assert.ok(actualHours >= 7.9 && actualHours <= 64.1, e.id)
    assert.ok(e.purchaseCostCents <= Number.MAX_SAFE_INTEGER)
    assert.ok(e.upgradeCostsCents.every(Number.isSafeInteger))
    assert.ok(e.incomesMicrosPerSecond.every(Number.isSafeInteger))

    const totalInvestmentCents = e.purchaseCostCents +
      e.upgradeCostsCents.reduce((a, b) => a + b, 0)
    const level20Hours = totalInvestmentCents / 100 /
      (e.incomesMicrosPerSecond[19]! / 1_000_000) / 3600
    assert.ok(totalInvestmentCents > e.purchaseCostCents * 10)
    assert.ok(Number.isSafeInteger(totalInvestmentCents))
    assert.ok(level20Hours >= actualHours && level20Hours <= actualHours * 1.2)
  }
  assert.equal(ENTERPRISES[0]!.purchaseCostCents / 100, 150)
  assert.equal(ENTERPRISES[19]!.purchaseCostCents / 100, 300_000_000)
})

test('catalogue réellement figé, stable par consultation et indépendant du marché', () => {
  assert.ok(Object.isFrozen(ENTERPRISES))
  assert.ok(Object.isFrozen(ENTERPRISE_MILESTONES))
  assert.ok(ENTERPRISES.every((e) =>
    Object.isFrozen(e) && Object.isFrozen(e.upgradeCostsCents) && Object.isFrozen(e.incomesMicrosPerSecond)))
  const frozen = JSON.stringify(ENTERPRISES)
  for (let i = 0; i < 10; i++) {
    assert.equal(getEnterpriseIncomeMicrosPerSecond('kiosque', 20), ENTERPRISES[0]!.incomesMicrosPerSecond[19])
    assert.equal(JSON.stringify(ENTERPRISES), frozen)
  }
})
