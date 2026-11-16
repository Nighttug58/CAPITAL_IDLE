import { migratePrestigeShop } from './ascension/v2.ts'
/**
 * Versioned V8 save persistence. V7 originals are NEVER overwritten before
 * the V8 write has been verified; invalid source material is not reset.
 * App.vue uses this as the authoritative V8 persistence boundary. Legacy
 * saves remain untouched and can be restored by an explicit import.
 */
import { getAsset } from './trading/catalog.ts'
import { validateExactV8State } from './exact-save-validation.ts'
import { previewV8Migration } from './exact-save-migration.ts'
import { createV8CapitalState, convertValidatedV7ToV8, type V8CapitalState } from './exact-state-v8.ts'
import { migratePreV2V8Save } from './fame-cycle-v8.ts'
import { MAX_IMPORT_FILE_BYTES, SAVE_FILE_FORMAT, SAVE_FILE_FORMAT_VERSION } from './save-transfer.ts'
import {createCapitalState} from './capital.ts'
import {restoreGame,migrateLegacyGame,migrateV2Game,LEVEL_THRESHOLD_FACTOR} from './game.ts'
import {createInitialPrestigeState} from './prestige/state.ts'
import {createInitialAscensionState} from './ascension/state.ts'

export const V8_STORAGE_KEY = 'capital-idle-save-v8'
export const V8_BACKUP_KEY = 'capital-idle-save-backup-v7'
export const V8_FAME_REBALANCE_BACKUP_KEY = 'capital-idle-save-backup-v8-pre-fame-rebalance'
const PREVIOUS_KEYS = [
  'capital-idle-save-v7','capital-idle-save-v6','capital-idle-save-v5','capital-idle-save-v4',
] as const
const decimalsFor = (id:string)=>getAsset(id)?.quantityDecimals??null

function record(value:unknown):value is Record<string,unknown>{
  return value!==null && typeof value==='object' && !Array.isArray(value)
}
function validNow(now:number):boolean{return Number.isSafeInteger(now)&&now>=0}
function validate(state:unknown):state is V8CapitalState{
  return validateExactV8State(state,decimalsFor).valid
}
export type V8ReadResult =
  | {ok:true;state:V8CapitalState;origin:'v8'|'migrated'|'new'}
  | {ok:false;reason:'invalid-v8'|'invalid-legacy'|'storage-unavailable'|'write-failed'}

/** Read only this key when it exists: never resurrect a stale legacy save. */
export function loadV8CapitalState(storage: Pick<Storage,'getItem'|'setItem'>,
  now=Date.now()):V8ReadResult {
  if(!validNow(now))return{ok:false,reason:'invalid-legacy'}
  let previous:string|null
  try {previous=storage.getItem(V8_STORAGE_KEY)}
  catch {return{ok:false,reason:'storage-unavailable'}}
  if(previous!==null){
    try{
      const parsed=JSON.parse(previous) as unknown
      if(!validate(parsed))return{ok:false,reason:'invalid-v8'}
      if((parsed as V8CapitalState).prestige.xpCurveVersion===4 && parsed.ascension.progress.shopVersion===2)
        return{ok:true,state:parsed as V8CapitalState,origin:'v8'}
      // Rebalance historical V8 snapshots once. Keep their raw original bytes
      // and do not replace the active key until the new state is validated.
      const upgraded=migratePrestigeShop(migratePreV2V8Save(parsed as V8CapitalState))
      if(!validate(upgraded))return{ok:false,reason:'invalid-v8'}
      const payload=JSON.stringify(upgraded)
      try {
        if(storage.getItem(V8_FAME_REBALANCE_BACKUP_KEY)===null)
          storage.setItem(V8_FAME_REBALANCE_BACKUP_KEY,previous)
        storage.setItem(V8_STORAGE_KEY,payload)
        if(storage.getItem(V8_STORAGE_KEY)!==payload){
          storage.setItem(V8_STORAGE_KEY,previous)
          return{ok:false,reason:'write-failed'}
        }
      } catch { return{ok:false,reason:'write-failed'} }
      return{ok:true,state:upgraded,origin:'migrated'}
    }catch{return{ok:false,reason:'invalid-v8'}}
  }
  for(const key of PREVIOUS_KEYS){
    let raw:string|null
    try {raw=storage.getItem(key)}
    catch{return{ok:false,reason:'storage-unavailable'}}
    if(raw===null)continue
    const migrated=previewV8Migration(raw,now)
    if(!migrated.ok)return{ok:false,reason:'invalid-legacy'}
    try{
      // Preserve the LAST raw V7 snapshot before any v8 write, even after
      // later successful reloads. Restoring that backup is an explicit action.
      if(key===PREVIOUS_KEYS[0] && storage.getItem(V8_BACKUP_KEY)===null)
        storage.setItem(V8_BACKUP_KEY,raw)
      const payload=JSON.stringify(migrated.convertedState)
      storage.setItem(V8_STORAGE_KEY,payload)
      if(storage.getItem(V8_STORAGE_KEY)!==payload)return{ok:false,reason:'write-failed'}
      return{ok:true,state:migrated.convertedState as unknown as V8CapitalState,origin:'migrated'}
    }catch{return{ok:false,reason:'write-failed'}}
  }
  // The original application also supported localStorage V1..V3. Keep that
  // compatibility at the V8 boundary instead of silently starting a new game.
  for (const key of ['capital-idle-save-v3','capital-idle-save-v2','capital-idle-save-v1']) {
    let raw:string|null
    try {raw=storage.getItem(key)}catch{return{ok:false,reason:'storage-unavailable'}}
    if(raw===null)continue
    try{
      const old=JSON.parse(raw)as unknown
      if(!record(old)||typeof old.balance!=='number'||typeof old.lifetimeEarned!=='number'||
        !Number.isSafeInteger(old.balance)||!Number.isSafeInteger(old.lifetimeEarned)||
        !Number.isSafeInteger(old.purchasedUpgrades))return{ok:false,reason:'invalid-legacy'}
      const previous=key.endsWith('v3') ? restoreGame(old,{
        experiencePoints:(old.lifetimeEarned as number)*LEVEL_THRESHOLD_FACTOR,
      }) : key.endsWith('v2') ? migrateV2Game(old) : migrateLegacyGame(old)
      // A malformed legacy save can otherwise collapse to the empty game.
      if(previous.balance===0&&previous.lifetimeEarned===0&&
        ((old.balance as number)!==0||(old.lifetimeEarned as number)!==0))
        return{ok:false,reason:'invalid-legacy'}
      const base=createCapitalState(previous,now)
      const prestige=createInitialPrestigeState(previous.lifetimeEarned,true)
      const adjusted={...base,prestige,ascension:createInitialAscensionState(now,prestige.lastAwardedLevel)}
      const state=convertValidatedV7ToV8(adjusted)
      const payload=JSON.stringify(state)
      storage.setItem(V8_STORAGE_KEY,payload)
      if(storage.getItem(V8_STORAGE_KEY)!==payload)return{ok:false,reason:'write-failed'}
      return{ok:true,state,origin:'migrated'}
    }catch{return{ok:false,reason:'invalid-legacy'}}
  }
  const state=createV8CapitalState(now)
  try{
    const payload=JSON.stringify(state)
    storage.setItem(V8_STORAGE_KEY,payload)
    if(storage.getItem(V8_STORAGE_KEY)!==payload)return{ok:false,reason:'write-failed'}
    return{ok:true,state,origin:'new'}
  }catch{return{ok:false,reason:'write-failed'}}
}

/** A single verified write; never change the current V8 record on failure. */
export function saveV8CapitalState(storage:Pick<Storage,'getItem'|'setItem'>,
  state:V8CapitalState):boolean {
  if(state.prestige.xpCurveVersion!==4||!validate(state))return false
  try{
    const serialized=JSON.stringify(state)
    if(new TextEncoder().encode(serialized).byteLength>MAX_IMPORT_FILE_BYTES)return false
    const before=storage.getItem(V8_STORAGE_KEY)
    storage.setItem(V8_STORAGE_KEY,serialized)
    if(storage.getItem(V8_STORAGE_KEY)===serialized)return true
    // A storage provider that reports success without storing is not trusted;
    // attempt to restore its old bytes, never declare the write successful.
    if(before!==null)storage.setItem(V8_STORAGE_KEY,before)
    return false
  }catch{return false}
}

export type V8ImportResult=
  | {ok:true;state:V8CapitalState;sourceVersion:4|5|6|7|8}
  | {ok:false;reason:'invalid-json'|'unsupported-version'|'invalid-save'|'file-too-large'}

/** Preview only; caller must separately request confirmation before replacing. */
export function prepareV8SaveImport(text:string,now=Date.now()):V8ImportResult{
  if(!validNow(now))return{ok:false,reason:'invalid-save'}
  if(new TextEncoder().encode(text).byteLength>MAX_IMPORT_FILE_BYTES)return{ok:false,reason:'file-too-large'}
  let parsed:unknown
  try {parsed=JSON.parse(text)as unknown}catch{return{ok:false,reason:'invalid-json'}}
  if(record(parsed) && 'format' in parsed){
    if(parsed.format!==SAVE_FILE_FORMAT || parsed.formatVersion!==SAVE_FILE_FORMAT_VERSION ||
      typeof parsed.exportedAt!=='number'||!Number.isSafeInteger(parsed.exportedAt)||
      parsed.exportedAt>now+300_000 || parsed.exportedAt<0 || !('state'in parsed))
      return{ok:false,reason:'invalid-save'}
    parsed=parsed.state
  }
  if(!record(parsed))return{ok:false,reason:'invalid-save'}
  if(parsed.version===8){
    if(!validate(parsed))return{ok:false,reason:'invalid-save'}
    try {
      const upgraded=migratePrestigeShop(migratePreV2V8Save(parsed as V8CapitalState))
      if(!validate(upgraded))return{ok:false,reason:'invalid-save'}
      return{ok:true,state:upgraded,sourceVersion:8}
    } catch { return{ok:false,reason:'invalid-save'} }
  }
  if(![4,5,6,7].includes(parsed.version as number))return{ok:false,reason:'unsupported-version'}
  const migrated=previewV8Migration(JSON.stringify(parsed),now)
  if(!migrated.ok)return{ok:false,reason:'invalid-save'}
  return{ok:true,state:migrated.convertedState as unknown as V8CapitalState,
    sourceVersion:migrated.sourceVersion as 4|5|6|7}
}

export function exportV8Save(state:V8CapitalState,now=Date.now()):string{
  if(!validNow(now)||state.prestige.xpCurveVersion!==4||!validate(state))throw new RangeError('Invalid V8 export')
  return JSON.stringify({format:SAVE_FILE_FORMAT,formatVersion:SAVE_FILE_FORMAT_VERSION,
    exportedAt:now,state})
}
