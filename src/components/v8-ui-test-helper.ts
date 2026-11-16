/** Test-only view of the active V8 save. The legacy V7 key is deliberately
 * immutable after migration and must never be mistaken for the live game. */
import type {CapitalState} from '../capital.ts'
import type {V8CapitalState} from '../exact-state-v8.ts'
import {projectV8ForLegacyUI} from '../exact-view-v8.ts'
import {V8_STORAGE_KEY} from '../exact-persistence-v8.ts'

export function readV8LegacyUI():CapitalState {
  const raw=localStorage.getItem(V8_STORAGE_KEY)
  if(!raw)throw new Error('No V8 save written')
  const state=JSON.parse(raw)as V8CapitalState
  if(state.version!==8)throw new Error('Unexpected save version')
  return projectV8ForLegacyUI(state)
}
export function readV8Raw():V8CapitalState {
  const raw=localStorage.getItem(V8_STORAGE_KEY)
  if(!raw)throw new Error('No V8 save written')
  return JSON.parse(raw)as V8CapitalState
}
