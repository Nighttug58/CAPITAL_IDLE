/** Test-only view of the active V9 save. The retired V1–V8 keys are never read by the live V9 game. */
import type {CapitalState} from '../capital.ts'
import type {V8CapitalState} from '../exact-state-v8.ts'
import {projectV8ForLegacyUI} from '../exact-view-v8.ts'
import {convertValidatedV7ToV8} from '../exact-state-v8.ts'
import {getV9PurchasedFameCost} from '../prestige/catalog.ts'
import {fameV4PurchasedCost} from '../prestige/fame-v4-catalog.ts'
import {prestigeSpentV9} from '../ascension/v2.ts'
import {transcendentSpent} from '../ascension/transcendent-v1.ts'
import {validateExactV8State} from '../exact-save-validation.ts'
import {getAsset} from '../trading/catalog.ts'
import {restoreAchievementsState} from '../achievements.ts'
import {V8_STORAGE_KEY,V9_STORAGE_KEY} from '../exact-persistence-v8.ts'

export function readV8LegacyUI():CapitalState {
  const raw=localStorage.getItem(V8_STORAGE_KEY)
  if(!raw)throw new Error('No V9 save written')
  const state=JSON.parse(raw)as V8CapitalState
  if(state.version!==9)throw new Error('Unexpected save version')
  return projectV8ForLegacyUI(state)
}
export function readV8Raw():V8CapitalState {
  const raw=localStorage.getItem(V8_STORAGE_KEY)
  if(!raw)throw new Error('No V9 save written')
  return JSON.parse(raw)as V8CapitalState
}

/** Test-only bridge: seed historical V7 UI fixtures as a *current V9 state*.
 * No migration is performed by the game or by V9 import/load code.
 * Preserve fixture gameplay values while re-pricing purchased ranks at current
 * Fame and Prestige tariffs so exact ledger validation still holds. */
export function prepareLegacyUIFixtureAsV9(source:CapitalState):V8CapitalState {
  const restored={...source,achievements:restoreAchievementsState(source.achievements)}
  const v8=convertValidatedV7ToV8(restored)
  const p=v8.prestige
  const {fameLegacyLevels:_levels,fameShopLedgerVersion:_tariff,xpRebaseV4:_xp,
    ...prestige}=p
  void _levels;void _tariff;void _xp
  const v4=fameV4PurchasedCost(p.fameV4!.levels)!
  const newSpent=(getV9PurchasedFameCost(p.boosts)!+v4)*1_000_000n
  const delta=newSpent-BigInt(p.fameSpentMicros)
  const progress=v8.ascension.progress
  const {legacyRanks:_ppOld,...currentProgress}=progress
  void _ppOld
  const newPP=prestigeSpentV9(progress.upgradeLevels)!+
    transcendentSpent(progress.transcendentV1)!
  const adjusted:V8CapitalState={
    ...v8,version:9,
    prestige:{...prestige,
      fameSpentMicros:newSpent.toString(),
      lifetimeFameMicros:(BigInt(p.lifetimeFameMicros)+delta).toString(),
      levelFameMicros:(BigInt(p.levelFameMicros)+delta).toString(),
      cycleLevelFameMicros:(BigInt(p.cycleLevelFameMicros)+delta).toString(),
      cycleEarnedFameMicros:(BigInt(p.cycleEarnedFameMicros)+delta).toString()},
    ascension:{...v8.ascension,progress:{...currentProgress,
      lifetimePoints:(BigInt(progress.availablePoints)+newPP).toString()}}
  }
  const checked=validateExactV8State(adjusted,id=>getAsset(id)?.quantityDecimals??null)
  if(!checked.valid)throw Error('Invalid V9 UI fixture: '+checked.reason)
  return adjusted
}
export function seedLegacyUIFixtureAsV9(source:CapitalState):void {
 localStorage.setItem(V9_STORAGE_KEY,JSON.stringify(prepareLegacyUIFixtureAsV9(source)))
}
