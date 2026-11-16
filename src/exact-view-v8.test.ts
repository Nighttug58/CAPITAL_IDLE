import test from 'node:test'
import assert from 'node:assert/strict'
import {createV8CapitalState} from './exact-state-v8.ts'
import {projectV8ForLegacyUI,approximateMoneyCents} from './exact-view-v8.ts'
import {hasValidFameShopLedger} from './prestige/shop.ts'
import {validAscensionShopLedger} from './ascension/shop.ts'

const at=1_800_000_000_000
test('V8 UI mirror retains ordinary numbers and backend ledgers',()=>{
 const exact=createV8CapitalState(at)
 const view=projectV8ForLegacyUI(exact)
 assert.equal(view.version,7)
 assert.equal(view.game.balance,0)
 assert.equal(view.prestige.fameMicros,1_000_000)
 assert.equal(hasValidFameShopLedger(view),true)
 assert.equal(validAscensionShopLedger(view),true)
})
test('V8 UI mirror never leaks Infinity for 10^200 amounts',()=>{
 const base=createV8CapitalState(at)
 const huge='1'+'0'.repeat(200)
 const v8={...base,
   game:{...base.game,balance:huge,lifetimeEarned:huge},
   prestige:{...base.prestige,fameMicros:huge,lifetimeFameMicros:huge,levelFameMicros:huge},
   ascension:{...base.ascension,progress:{...base.ascension.progress,availablePoints:huge,lifetimePoints:huge}},
 }
 const display=projectV8ForLegacyUI(v8)
 assert.ok(Number.isFinite(display.game.balance))
 assert.ok(Number.isFinite(display.game.lifetimeEarned))
 assert.ok(Number.isFinite(display.prestige.fameMicros))
 assert.ok(Number.isFinite(display.ascension.progress.availablePoints))
 assert.ok(approximateMoneyCents(10n**200n)>0)
 assert.equal(hasValidFameShopLedger(display),true)
 assert.equal(validAscensionShopLedger(display),true)
})
