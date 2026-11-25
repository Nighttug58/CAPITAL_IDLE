import test from 'node:test'
import assert from 'node:assert/strict'
import { getLevelStartThreshold, getLevel } from './game.ts'
import { getExactLevel, getExactLevelStartThreshold, getExactLevelProgress, LAST_SAFE_XP_LEVEL,
  getExactV3Level, getExactV3LevelStartThreshold, rebaseV3ExperienceCents, getExactLevelNear } from './exact-levels.ts'

test('BigInt XP exactly matches the original curve until the first unsafe threshold', () => {
  for (const level of [1,2,5,50,100,200,500,1000,LAST_SAFE_XP_LEVEL-1,LAST_SAFE_XP_LEVEL]) {
    const threshold = BigInt(getLevelStartThreshold(level))
    assert.equal(getExactV3LevelStartThreshold(level), threshold)
    assert.equal(getExactV3Level(threshold * 100n), level)
    assert.equal(getExactLevel(getExactLevelStartThreshold(level) * 100n), level)
    if (level < LAST_SAFE_XP_LEVEL) {
      assert.equal(getLevel(Number(threshold)), level)
    }
  }
})

test('levels and progress stay monotonic far beyond MAX_SAFE_INTEGER', () => {
  for (const exp of [10n ** 18n, 10n ** 30n, 10n ** 60n, 10n ** 100n, 10n ** 200n]) {
    const p = getExactLevelProgress(exp)
    assert.ok(p.level > 1)
    assert.ok(p.startCents <= exp)
    assert.ok(exp < p.nextCents)
    assert.ok(p.fractionBasisPoints >= 0 && p.fractionBasisPoints < 10_000)
    assert.equal(getExactLevel(p.startCents), p.level)
    assert.equal(getExactLevel(p.nextCents), p.level + 1)
  }
})


test('XP V4 raises costs gradually 5x / 10x / 25x while preserving monotonic thresholds', () => {
  for (const [level, numerator, denominator] of [[2,5n,1n],[50,5n,1n],
      [75,15n,2n],[100,10n,1n],[150,35n,2n],[200,25n,1n],[300,25n,1n]] as const) {
    const old = getExactV3LevelStartThreshold(level)
    const rebased = getExactLevelStartThreshold(level)
    assert.ok(rebased >= old * numerator / denominator)
    assert.ok(rebased <= old * numerator / denominator + 1n)
    assert.ok(rebased > getExactLevelStartThreshold(level-1))
  }
})

test('XP V3 -> V4 rebase preserves level and fractional advancement without Fame rewards', () => {
  for (const level of [1, 2, 49, 50, 51, 75, 100, 101, 150, 200, 250, 500, 1000]) {
    const start = getExactV3LevelStartThreshold(level) * 100n
    const oldStep = (getExactV3LevelStartThreshold(level+1) - getExactV3LevelStartThreshold(level)) * 100n
    const next = getExactLevelStartThreshold(level+1) * 100n
    const fresh = getExactLevelStartThreshold(level) * 100n
    for (const ratio of [0n, 33n, 79n, 99n]) {
      const oldXp = start + oldStep * ratio / 100n
      const newXp = rebaseV3ExperienceCents(oldXp)
      assert.equal(getExactV3Level(oldXp), level)
      assert.equal(getExactLevel(newXp), level)
      assert.ok(newXp >= fresh && newXp < next)
      const oldBps=(oldXp-start)*10_000n/oldStep
      const newBps=(newXp-fresh)*10_000n/(next-fresh)
      assert.ok(oldBps-newBps<=1n && newBps-oldBps<=1n)
    }
  }
  assert.ok(getExactLevel(rebaseV3ExperienceCents(10n**200n)) > 1)
})


test('level hints never change XP boundaries and fall back on stale hints',()=>{
  for(const level of [1,2,49,50,51,100,200,LAST_SAFE_XP_LEVEL,LAST_SAFE_XP_LEVEL+1,10_000]){
    const start=getExactLevelStartThreshold(level)*100n
    const end=getExactLevelStartThreshold(level+1)*100n
    for(const xp of [start,start+(end-start)/2n,end-1n,end]){
      const expected=getExactLevel(xp)
      assert.equal(getExactLevelNear(xp,level),expected)
      assert.equal(getExactLevelNear(xp,1),expected)
      assert.equal(getExactLevelNear(xp,0),expected)
    }
  }
})
