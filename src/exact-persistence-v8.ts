/**
 * CAPITAL_IDLE V9 — fresh-only BigInt persistence.
 * V1–V8 localStorage data and exports are never loaded or migrated.
 * Old localStorage bytes are left untouched for an optional manual rollback.
 */
import {getAsset} from './trading/catalog.ts'
import {validateExactV8State} from './exact-save-validation.ts'
import {createV9CapitalState,type V9CapitalState} from './exact-state-v8.ts'
import {MAX_IMPORT_FILE_BYTES,SAVE_FILE_FORMAT,SAVE_FILE_FORMAT_VERSION} from './save-transfer.ts'

export const V9_STORAGE_KEY='capital-idle-save-v9'
/** Temporary export aliases for internal exact-engine callers. */
export const V8_STORAGE_KEY=V9_STORAGE_KEY
// Retained as archived identifiers for existing tests/tools; never accessed in V9.
export const V8_BACKUP_KEY='capital-idle-save-backup-v7'
export const V8_FAME_REBALANCE_BACKUP_KEY='capital-idle-save-backup-v8-pre-fame-rebalance'
export const V8_TRANSCENDENT_BACKUP_KEY='capital-idle-save-backup-v8-pre-transcendent-v1'
export const V8_TRANSCENDENT_V2_BACKUP_KEY='capital-idle-save-backup-v8-pre-transcendent-100-ranks'
export const V8_FAME_V4_BACKUP_KEY='capital-idle-save-backup-v8-pre-fame-v4'
const decimals=(id:string)=>getAsset(id)?.quantityDecimals??null
const valid=(value:unknown):value is V9CapitalState=>
  !!value&&typeof value==='object'&&!Array.isArray(value)&&
  (value as {version?:unknown}).version===9&&
  validateExactV8State(value,decimals).valid
const validNow=(now:number)=>Number.isSafeInteger(now)&&now>=0
const sizeOk=(value:string)=>new TextEncoder().encode(value).byteLength<=MAX_IMPORT_FILE_BYTES
const record=(value:unknown):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value)

export type V9ReadResult=
 | {ok:true;state:V9CapitalState;origin:'v9'|'new'}
 | {ok:false;reason:'invalid-v9'|'storage-unavailable'|'write-failed'}

export function loadV9CapitalState(storage:Pick<Storage,'getItem'|'setItem'>,
  now=Date.now()):V9ReadResult {
  if(!validNow(now))return {ok:false,reason:'invalid-v9'}
  let stored:string|null
  try{stored=storage.getItem(V9_STORAGE_KEY)}
  catch{return {ok:false,reason:'storage-unavailable'}}
  if(stored!==null){
    try{
      const parsed=JSON.parse(stored) as unknown
      if(!valid(parsed))return {ok:false,reason:'invalid-v9'}
      return {ok:true,state:parsed,origin:'v9'}
    }catch{return {ok:false,reason:'invalid-v9'}}
  }
  // Absolutely no fallback to any previous-version key.
  const state=createV9CapitalState(now)
  if(!valid(state))return {ok:false,reason:'invalid-v9'}
  const serialized=JSON.stringify(state)
  if(!sizeOk(serialized))return {ok:false,reason:'write-failed'}
  try{
    storage.setItem(V9_STORAGE_KEY,serialized)
    return storage.getItem(V9_STORAGE_KEY)===serialized
      ? {ok:true,state,origin:'new'} : {ok:false,reason:'write-failed'}
  }catch{return {ok:false,reason:'write-failed'}}
}

/** Validated, read-back verified write, never resetting a corrupt V9 save. */
export function saveV9CapitalState(storage:Pick<Storage,'getItem'|'setItem'>,
  state:V9CapitalState):boolean {
  if(!valid(state))return false
  const serialized=JSON.stringify(state)
  if(!sizeOk(serialized))return false
  try{
    const before=storage.getItem(V9_STORAGE_KEY)
    storage.setItem(V9_STORAGE_KEY,serialized)
    if(storage.getItem(V9_STORAGE_KEY)===serialized)return true
    if(before!==null)storage.setItem(V9_STORAGE_KEY,before)
    return false
  }catch{return false}
}
export type V9ImportResult=
 | {ok:true;state:V9CapitalState;sourceVersion:9}
 | {ok:false;reason:'invalid-json'|'unsupported-version'|'invalid-save'|'file-too-large'}
export function prepareV9SaveImport(text:string,now=Date.now()):V9ImportResult{
  if(!validNow(now))return {ok:false,reason:'invalid-save'}
  if(!sizeOk(text))return {ok:false,reason:'file-too-large'}
  let parsed:unknown
  try{parsed=JSON.parse(text) as unknown}catch{return {ok:false,reason:'invalid-json'}}
  if(record(parsed)&&'format' in parsed){
    if(parsed.format!==SAVE_FILE_FORMAT||parsed.formatVersion!==SAVE_FILE_FORMAT_VERSION||
      typeof parsed.exportedAt!=='number'||!Number.isSafeInteger(parsed.exportedAt)||
      parsed.exportedAt>now+300_000||parsed.exportedAt<0||!('state' in parsed))
      return {ok:false,reason:'invalid-save'}
    parsed=parsed.state
  }
  if(!record(parsed)||parsed.version!==9)return {ok:false,reason:'unsupported-version'}
  if(!valid(parsed))return {ok:false,reason:'invalid-save'}
  return {ok:true,state:parsed,sourceVersion:9}
}
export function exportV9Save(state:V9CapitalState,now=Date.now()):string{
  if(!validNow(now)||!valid(state))throw new RangeError('Invalid V9 export')
  return JSON.stringify({format:SAVE_FILE_FORMAT,formatVersion:SAVE_FILE_FORMAT_VERSION,
    exportedAt:now,state})
}
export const loadV8CapitalState=loadV9CapitalState
export const saveV8CapitalState=saveV9CapitalState
export const prepareV8SaveImport=prepareV9SaveImport
export const exportV8Save=exportV9Save
