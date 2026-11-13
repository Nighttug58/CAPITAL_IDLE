import assert from 'node:assert/strict'
import test from 'node:test'
import { exactMoneyCents } from './money.ts'

test('dollars à plusieurs dizaines de milliards : le retour centimes ne dépend pas des erreurs IEEE-754', () => {
  for (const cents of [1, 15, 10_000_000, 6_980_680_143_515, 8_212_456_051_194, 30_000_000_000_000]) {
    assert.equal(exactMoneyCents(cents / 100), cents)
  }
})

test('aucune monnaie invalide ni vraie fraction de centime n est acceptée', () => {
  for (const invalid of [Number.NaN, Infinity, -Infinity, 0.001, -0.001, 69_806_801_435.155,
    Number.MAX_SAFE_INTEGER]) {
    assert.equal(exactMoneyCents(invalid), null, String(invalid))
  }
  assert.equal(exactMoneyCents(-15.39), -1539)
  assert.equal(exactMoneyCents(0), 0)
})
