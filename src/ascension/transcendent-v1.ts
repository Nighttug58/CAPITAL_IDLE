/**
 * Transcendent PP Shop V1. Pass 3 only enables the three news branches.
 * The remaining seven identifiers are reserved at rank 0 for pass 4.
 * All prices and balances use exact BigInt PP; saves store integer ranks only.
 */
import type { V8CapitalState } from '../exact-state-v8.ts'

export const TRANSCENDENT_NEWS_IDS = [
  'news-power', 'news-intensity', 'news-duration',
] as const
export const TRANSCENDENT_IDS = [
  ...TRANSCENDENT_NEWS_IDS,
  'empire', 'trading', 'rentier', 'xp', 'fame', 'heritage', 'starting-capital',
] as const
export type TranscendentId = typeof TRANSCENDENT_IDS[number]
export type TranscendentNewsId = typeof TRANSCENDENT_NEWS_IDS[number]
export const TRANSCENDENT_MAX_LEVEL = 1_000

export interface TranscendentShopV1 {
  readonly version: 1
  readonly levels: Readonly<Record<TranscendentId, number>>
}

export const TRANSCENDENT_NEWS_PRESENTATION: ReadonlyArray<{
  id:TranscendentNewsId; name:string; description:string; effect:string
}> = [
  {id:'news-power',name:'Puissance médiatique',description:'Augmente les pressions haussières et baissières sur les cours et dividendes.',effect:'+0,2 point % de force par niveau ; jusqu’à ×6 avec Frénésie'},
  {id:'news-intensity',name:'Intensité médiatique',description:'Accélère la montée et la descente de l’effet des news actives.',effect:'Rampe de 20 % à 5 % de la durée de chaque news'},
  {id:'news-duration',name:'Durée médiatique',description:'Prolonge les futures annonces positives et négatives.',effect:'+0,1 point % de durée par niveau ; jusqu’à ×3 au total'},
]

export function zeroTranscendentV1(): TranscendentShopV1 {
  return {version:1,levels:Object.fromEntries(TRANSCENDENT_IDS.map(id=>[id,0])) as Record<TranscendentId,number>}
}
export function transcendentNextCost(level:number):bigint|null {
  if(!Number.isSafeInteger(level)||level<0||level>=TRANSCENDENT_MAX_LEVEL)return null
  const n=BigInt(level)
  return 1_000n + 250n*n + 10n*n*n
}
export function transcendentSpentThrough(level:number):bigint|null {
  if(!Number.isSafeInteger(level)||level<0||level>TRANSCENDENT_MAX_LEVEL)return null
  const n=BigInt(level)
  return 1_000n*n + 250n*n*(n-1n)/2n +
    10n*n*(n-1n)*(2n*n-1n)/6n
}
export function transcendentSpent(section:unknown):bigint|null {
  if(!section || typeof section!=='object'||Array.isArray(section))return null
  const entry=section as Record<string,unknown>
  if(entry.version!==1||!entry.levels||typeof entry.levels!=='object'||Array.isArray(entry.levels))return null
  const ranks=entry.levels as Record<string,unknown>
  if(Object.keys(ranks).length!==TRANSCENDENT_IDS.length)return null
  let total=0n
  for(const id of TRANSCENDENT_IDS){
    const rank=ranks[id]
    if(!Number.isSafeInteger(rank)||typeof rank!=='number'||rank<0||rank>TRANSCENDENT_MAX_LEVEL)return null
    if(!TRANSCENDENT_NEWS_IDS.includes(id as TranscendentNewsId) && rank!==0)return null
    const spent=transcendentSpentThrough(rank)
    if(spent===null)return null
    total+=spent
  }
  return total
}
export function transcendentLevel(
  progress:{readonly transcendentV1?:TranscendentShopV1},id:TranscendentId,
):number {
  return progress.transcendentV1?.levels[id]??0
}
export function migrateTranscendentV1(state:V8CapitalState):V8CapitalState {
  if(state.ascension.progress.transcendentV1!==undefined)return state
  return {...state,ascension:{...state.ascension,
    progress:{...state.ascension.progress,transcendentV1:zeroTranscendentV1()}}}
}
export function v8BuyTranscendentNews(
  state:V8CapitalState,id:TranscendentNewsId,expectedRank:number,
):V8CapitalState|null {
  if(!TRANSCENDENT_NEWS_IDS.includes(id)||
    state.ascension.progress.shopVersion!==2 ||
    state.ascension.progress.prestigeCount<3)return null
  const progress=state.ascension.progress
  const section=progress.transcendentV1??zeroTranscendentV1()
  if(section.levels[id]!==expectedRank || transcendentSpent(section)===null)return null
  const price=transcendentNextCost(expectedRank)
  if(price===null||BigInt(progress.availablePoints)<price)return null
  return {...state,ascension:{...state.ascension,progress:{
    ...progress,availablePoints:(BigInt(progress.availablePoints)-price).toString(),
    transcendentV1:{version:1,levels:{...section.levels,[id]:expectedRank+1}},
  }}}
}
/** Deterministic force, envelope and duration multipliers, safe up to rank 1000. */
export function transcendentNewsModifiers(
  progress:{readonly transcendentV1?:TranscendentShopV1},
){
  const power=transcendentLevel(progress,'news-power')
  const intensity=transcendentLevel(progress,'news-intensity')
  const duration=transcendentLevel(progress,'news-duration')
  return {
    powerAdditional:power*0.002,
    rampFraction:Math.max(0.05,0.2-intensity*0.00015),
    durationAdditional:duration*0.001,
  }
}
