/** Test-only view of the active V9 save. The retired V1–V8 keys are never read by the live V9 game. */
import type {CapitalState} from '../capital.ts'
import type {V8CapitalState} from '../exact-state-v8.ts'
import {projectV8ForLegacyUI} from '../exact-view-v8.ts'
import {V8_STORAGE_KEY} from '../exact-persistence-v8.ts'

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
