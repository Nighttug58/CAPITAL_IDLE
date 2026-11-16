import test from 'node:test'
import assert from 'node:assert/strict'
import { getLevelStartThreshold, getLevel } from './game.ts'
import { getExactLevel, getExactLevelStartThreshold, getExactLevelProgress, LAST_SAFE_XP_LEVEL } from './exact-levels.ts'

test('BigInt XP exactly matches the original curve until the first unsafe threshold', () => {
  for (const level of [1,2,5,50,100,200,500,1000,LAST_SAFE_XP_LEVEL-1,LAST_SAFE_XP_LEVEL]) {
    const threshold = BigInt(getLevelStartThreshold(level))
    assert.equal(getExactLevelStartThreshold(level), threshold)
    assert.equal(getExactLevel(threshold * 100n), level)
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
